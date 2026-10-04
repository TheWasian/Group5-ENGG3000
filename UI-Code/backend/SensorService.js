// Shared sensor API adapter for gameLogic.js and the modular main.js backend.
// Both game entry points keep their own scoring rules; this service owns polling.
var SensorService = {
  POLL_EVERY_MS: 75,
  MAX_EVENT_AGE_MS: 1000,
  MAX_POSITION_AGE_MS: 500,
  REQUEST_TIMEOUT_MS: 1200,
  baseUrl: "http://192.168.4.1",
  lastEventId: null, lastBootId: null, lastFrame: null,
  timer: null, busy: false, onHit: null,
  lastData: null, receivedAt: 0,
  init: function () {
    if (window.location.hostname === "192.168.4.1") this.baseUrl = "";
    this.holes = Array.from(document.querySelectorAll(".hole"));
    this.sensorStatus = document.getElementById("sensor-status");
    this.playerMarker = document.getElementById("player-marker");
    this.debugSensorLabels = [document.getElementById("debug-label-1"), document.getElementById("debug-label-2")];
    this.debugSensorDisplays = [document.getElementById("debug-sensor-1"), document.getElementById("debug-sensor-2")];
    this.debugLastEvent = document.getElementById("debug-last-event");
  },
  start: function () {
    clearInterval(this.timer);
    this.check();
    this.timer = setInterval(() => { this.expireDisplay(); this.check(); }, this.POLL_EVERY_MS);
  },
  request: async function (path, method = "GET") {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(this.baseUrl + path, {method, cache: "no-store", signal: controller.signal});
      if (!response.ok) throw new Error("Sensor HTTP " + response.status);
      return method === "GET" ? await response.json() : null;
    } finally { clearTimeout(timeout); }
  },
  notifyGameStart: function () {
    // Retain the frame cursor: a restart must not replay the last measurement.
    return this.request("/api/game/start", "POST").catch(() => null);
  },
  expireDisplay: function () {
    const data = this.lastData, p = data?.position;
    if (data?.source === "access_point" && p?.valid &&
        performance.now() - this.receivedAt + p.age_ms > this.MAX_POSITION_AGE_MS) {
      this.lastData = null;
      this.updateSensorStatus(true, {...data, position: {...p, valid: false, reason: "stale"}});
    }
  },
  check: async function () {
    if (this.busy) return;
    this.busy = true;
    try {
      const data = await this.request("/api/hits");
      if (!data || !Number.isSafeInteger(data.event_id) || data.event_id < 0)
        throw new Error("Invalid /api/hits response");
      if (data.source === "access_point" && data.frame_id !== undefined &&
          (!Number.isSafeInteger(data.frame_id) || data.frame_id < 0 ||
           !Number.isSafeInteger(data.boot_id) || data.boot_id < 0))
        throw new Error("Invalid AP frame");
      this.lastData = data; this.receivedAt = performance.now();
      this.updateSensorStatus(true, data);
      if (data.source === "access_point") {
        if (data.boot_id !== this.lastBootId) { this.lastFrame = null; this.lastEventId = null; }
        this.lastBootId = data.boot_id;
        if (Number.isSafeInteger(data.frame_id)) {
          const key = `${data.boot_id}:${data.frame_id}`;
          if (key !== this.lastFrame) {
            this.lastFrame = key;
            const player = this.getPlayerPosition(data);
            if (player && data.position.held !== true && this.onHit) this.onHit(player.holeIndex, "occupancy");
          }
          this.lastEventId = data.event_id;
          return;
        }
      }
      // MVP / older event-only AP firmware. Never coerce null into hole zero.
      const oldEvent = this.lastEventId; this.lastEventId = data.event_id;
      if (oldEvent === null || data.event_id === oldEvent) return;
      if (typeof data.event_age_ms === "number" && Number.isFinite(data.event_age_ms) &&
          data.event_age_ms >= 0 && data.event_age_ms <= this.MAX_EVENT_AGE_MS &&
          Number.isInteger(data.hole) && data.hole >= 0 && data.hole < this.holes.length &&
          (data.source !== "access_point" || (this.usableAccessPointPosition(data) &&
           data.position.held !== true && data.current_hole === data.hole)) && this.onHit)
        this.onHit(data.hole, "event");
    } catch (error) {
      this.lastData = null;
      this.updateSensorStatus(false);
      // Keep cursors across a transient HTTP error: a repeated frame/event is
      // still a duplicate. AP reboot is identified separately by boot_id.
    } finally { this.busy = false; }
  },
  usableAccessPointPosition: function (data) {
    const p = data?.position;
    return p?.valid === true && !p.warning && p.in_play_area !== false && p.in_game_area !== false &&
      Number.isInteger(p.sensors_used) && p.sensors_used >= 2 && p.sensors_used <= 3 &&
      typeof p.x_m === "number" && Number.isFinite(p.x_m) &&
      typeof p.y_m === "number" && Number.isFinite(p.y_m) &&
      typeof p.age_ms === "number" && p.age_ms >= 0 && p.age_ms <= this.MAX_POSITION_AGE_MS;
  },

  getPlayerPosition: function (data) {
    const accessPointHole = data?.current_hole;
    if (
      this.usableAccessPointPosition(data) &&
      data.current_hole !== null &&
      Number.isInteger(accessPointHole) &&
      accessPointHole >= 0 &&
      accessPointHole < this.holes.length
    ) {
      return {
        sensorIndex: accessPointHole % 2,
        holeIndex: accessPointHole,
        distanceCm: Number(data.position.y_m) * 100,
        xM: Number(data.position.x_m),
        yM: Number(data.position.y_m),
      };
    }

    // The AP's sensors array is a compatibility lane view, not a fallback
    // source of physical positioning when its actual fix is invalid.
    if (data?.source === "access_point") return null;

    if (!Array.isArray(data?.sensors)) return null;

    const validSensorIndexes = data.sensors
      .map((sensor, index) =>
        sensor?.valid === true && Number.isInteger(sensor.hole) ? index : -1,
      )
      .filter((index) => index >= 0);

    if (validSensorIndexes.length === 0) return null;

    // If both beams see the player, prefer the sensor that most recently
    // produced a movement event. Otherwise use the only valid sensor.
    const latestSensorIndex = Number(data.sensor) - 1;
    const sensorIndex = validSensorIndexes.includes(latestSensorIndex)
      ? latestSensorIndex
      : validSensorIndexes[0];
    const holeIndex = Number(data.sensors[sensorIndex].hole);

    if (
      !Number.isInteger(holeIndex) ||
      holeIndex < 0 ||
      holeIndex >= this.holes.length
    ) {
      return null;
    }

    return {
      sensorIndex,
      holeIndex,
      distanceCm: data.sensors[sensorIndex].distance_cm,
    };
  },

  displayPlayerPosition: function (data) {
    const position = this.getPlayerPosition(data);

    if (!position) {
      this.playerMarker.classList.add("hidden");
      this.playerMarker.removeAttribute("title");
      return null;
    }

    const targetHole = this.holes.find(
      (hole) => Number(hole.dataset.hole) === position.holeIndex,
    );
    targetHole.appendChild(this.playerMarker);
    this.playerMarker.classList.remove("hidden");
    this.playerMarker.title = Number.isFinite(position.xM)
      ? `Player: hole ${position.holeIndex + 1} (${position.xM.toFixed(2)}, ${position.yM.toFixed(2)} m)`
      : `Player: hole ${position.holeIndex + 1}, sensor ${position.sensorIndex + 1}`;
    return position;
  },

  updateDebugPanel: function (data = null) {
    if (data?.source === "access_point") {
      this.debugSensorLabels[0].textContent = "Position";
      this.debugSensorLabels[1].textContent = "Network";

      const xM = Number(data.position?.x_m);
      const yM = Number(data.position?.y_m);
      const currentHole = Number(data.current_hole);
      const positionValid = data.position?.valid &&
        data.position.x_m !== null && data.position.y_m !== null &&
        Number.isFinite(xM) && Number.isFinite(yM);
      this.debugSensorDisplays[0].textContent = positionValid
        ? `${xM.toFixed(2)}, ${yM.toFixed(2)} m | ${currentHole >= 0 ? `Hole ${currentHole + 1}` : "stabilising"}`
        : `No valid fix | ${Number(data.position?.sensors_used) || 0} ranges`;

      const nodeOnline = Array.isArray(data.node_online)
        ? data.node_online
        : [false, false];
      const validRangeCount = Array.isArray(data.ranges_m)
        ? data.ranges_m.filter(
            (range) => range !== null && Number.isFinite(Number(range)),
          ).length
        : 0;
      const totalRangeCount = Array.isArray(data.ranges_m)
        ? data.ranges_m.length
        : 0;
      this.debugSensorDisplays[1].textContent =
        `N1 ${nodeOnline[0] ? "online" : "offline"} | ` +
        `N2 ${nodeOnline[1] ? "online" : "offline"} | ` +
        `${validRangeCount}/${totalRangeCount} ranges`;
      const physicalRanges = (data.ranges_m || []).map((r, i) =>
        `${["N1", "AP", "N2"][i]} ${typeof r === "number" && Number.isFinite(r) ? r.toFixed(2) + " m" : "no echo"}`);
      this.debugSensorDisplays[1].textContent += ` | ${physicalRanges.join(" / ")}`;
      this.debugSensorDisplays[0].textContent += ` | ${data.position?.reason || "positioning"}`;
      const mask = data.position?.sensors_used_mask;
      const usedNames = ["N1", "AP", "N2"].filter((name, i) => Number.isInteger(mask) && (mask & (1 << i)));
      if (usedNames.length) this.debugSensorDisplays[0].textContent += ` | ${data.position.held ? "Last fix:" : "Using"} ${usedNames.join(" + ")}`;
      if (data.position?.held) this.debugSensorDisplays[0].textContent += " | Held: no scoring";

      if (Number(data.event_id) === 0) {
        this.debugLastEvent.textContent = "None";
      } else {
        this.debugLastEvent.textContent =
          `#${data.event_id} | Hole ${Number(data.hole) + 1} | ` +
          `${Number(data.distance_cm).toFixed(1)} cm from screen`;
      }
      return;
    }

    this.debugSensorLabels[0].textContent = "Sensor 1";
    this.debugSensorLabels[1].textContent = "Sensor 2";
    this.debugSensorDisplays.forEach((display, index) => {
      const sensor = data?.sensors?.[index];
      if (!sensor) {
        display.textContent = "Disconnected";
        return;
      }

      const distance =
        sensor.distance_cm === null ? "No echo" : `Avg ${sensor.distance_cm} cm`;
      const hole =
        sensor.valid && Number(sensor.hole) >= 0
          ? `Hole ${Number(sensor.hole) + 1}`
          : "No player";
      display.textContent = `${distance} | ${hole}`;
    });

    if (!data) {
      this.debugLastEvent.textContent = "Disconnected";
    } else if (Number(data.event_id) === 0) {
      this.debugLastEvent.textContent = "None";
    } else {
      this.debugLastEvent.textContent = `#${data.event_id} | S${data.sensor} | Hole ${Number(data.hole) + 1} | ${data.distance_cm} cm`;
    }
  },

  updateSensorStatus: function (connected, data = null) {
    this.sensorStatus.classList.toggle("connected", connected);
    this.sensorStatus.classList.toggle("disconnected", !connected);

    if (!connected) {
      this.playerMarker.classList.add("hidden");
      this.updateDebugPanel();
      this.sensorStatus.textContent =
        "Sensor controller: disconnected (mouse testing is available)";
      return;
    }

    this.updateDebugPanel(data);
    const playerPosition = this.displayPlayerPosition(data);

    if (data?.source === "access_point") {
      const position = data.position;
      const g = data.game_area;
      if (g && [g.x_min_m, g.x_max_m, g.start_y_m, g.end_y_m].every(Number.isFinite)) {
        this.holes.forEach(hole => {
          const index = Number(hole.dataset.hole);
          const x = g.x_min_m + (index % 2 + 0.5) * (g.x_max_m - g.x_min_m) / 2;
          const y = g.start_y_m + (Math.floor(index / 2) + 0.5) * (g.end_y_m - g.start_y_m) / 3;
          hole.title = `Stand at x=${Math.round(x * 100)} cm from the area's left edge, ${Math.round(y * 100)} cm from the screen`;
        });
      }
      const xM = Number(position?.x_m);
      const yM = Number(position?.y_m);
      const warning = position?.warning ? "WARNING: too close to screen — " : "";
      this.sensorStatus.textContent = position?.valid && position.x_m !== null && position.y_m !== null
        ? `${warning}Access point: tracking ${playerPosition ? `hole ${playerPosition.holeIndex + 1}` : "position"} at ${xM.toFixed(2)}, ${yM.toFixed(2)} m`
        : `${warning}Access point: connected — ${position?.reason || "waiting for a valid player position"}`;
      if (position?.held) this.sensorStatus.textContent += " | Position held; waiting for confirmation before scoring";
      else if (position?.valid) this.sensorStatus.textContent += ` | ${position.sensors_used}-sensor tracking`;
      if (position?.valid && position.in_game_area === false) this.sensorStatus.textContent += " | Move into the target zones shown at 192.168.4.1";
      return;
    }

    const activeSensors = (Array.isArray(data?.sensors) ? data.sensors : [])
      .map((sensor, index) =>
        sensor.valid ? `S${index + 1}: ${sensor.distance_cm} cm` : null,
      )
      .filter(Boolean);
    this.sensorStatus.textContent = activeSensors.length
      ? `Player: ${playerPosition ? `hole ${playerPosition.holeIndex + 1}` : "position unknown"} — ${activeSensors.join(" | ")}`
      : "Sensor controller: connected — waiting for player";
  },
};
