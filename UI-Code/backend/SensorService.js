//Sensor Logic
var SensorService = {
  POLL_EVERY_MS: 75,
  MAX_EVENT_AGE_MS: 1000,

  // ESP32 URL
  baseUrl: "http://192.168.4.1",

  lastEventId: null, // last event_id seen or null
  timer: null,
  busy: false, //checks if there is already a request no over flooding
  onHit: null, // function in main.js to check the sensor has detected a hit

  holes: [],
  sensorStatus: null,
  playerMarker: null,
  debugLabels: [],
  debugDisplays: [],
  debugLastEvent: null,

  // Grab page element when backends main calls it
  init: function () {
    if (window.location.hostname === "192.168.4.1") {
      this.baseUrl = "";
    }
    this.holes = Array.from(document.querySelectorAll(".hole"));
    this.sensorStatus = document.getElementById("sensor-status");
    this.playerMarker = document.getElementById("player-marker");
    this.debugLabels = [document.getElementById("debug-label-1"), document.getElementById("debug-label-2")];
    this.debugDisplays = [document.getElementById("debug-sensor-1"), document.getElementById("debug-sensor-2")];
    this.debugLastEvent = document.getElementById("debug-last-event");
  },

  // Keep Polling until the esp's switch off
  start: function () {
    this.check(); // check once right away
    clearInterval(this.timer);
    var self = this;
    this.timer = setInterval(function () {
      self.check();
    }, this.POLL_EVERY_MS);
  },

  //start the game and the esp32 is rearmed and if offline then any failure flagged is thrown out
  //Mouse is still working as i need it to test
  notifyGameStart: function () {
    fetch(this.baseUrl + "/api/game/start", { method: "POST" }).catch(function () { 
    });
  },

  //Instead of multiple poll's, just made it one and ensured that the new movement event's become one poll
  check: function () {
    if (this.busy) return;
    this.busy = true;
    var self = this;
    fetch(this.baseUrl + "/api/hits", { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("Sensor HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        self.busy = false;
        var eventId = Number(data.event_id);
        if (!Number.isInteger(eventId) || eventId < 0) {
          throw new Error("Invalid /api/hits response");
        }
        self.updateSensorStatus(true, data);

        if (self.lastEventId === null) {
          self.lastEventId = eventId;
          return;
        }
        if (eventId === self.lastEventId) return;
        self.lastEventId = eventId;

        var eventAgeMs = Number(data.event_age_ms);
        var eventHole = Number(data.hole);
        if (
          Number.isFinite(eventAgeMs) &&
          eventAgeMs <= self.MAX_EVENT_AGE_MS &&
          Number.isInteger(eventHole) &&
          eventHole >= 0 &&
          eventHole < self.holes.length &&
          self.onHit
        ) {
          self.onHit(eventHole);
        }
      })
      .catch(function () {
        self.busy = false;
        self.updateSensorStatus(false);
      });
  },

  // Checks which hole the player is at before returning the values like sensor and hold or null if there not their
  getPlayerPosition: function (data) {
    var accessPointHole = Number(data && data.current_hole);
    if (
      data &&
      data.position &&
      data.position.valid &&
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

    if (!data || !Array.isArray(data.sensors)) return null;

    var validSensorIndexes = [];
    for (var i = 0; i < data.sensors.length; i++) {
      if (data.sensors[i].valid && Number.isInteger(Number(data.sensors[i].hole))) {
        validSensorIndexes.push(i);
      }
    }
    if (validSensorIndexes.length === 0) return null;

    //Getting the players last position based on the last time it was sensed
    var latestSensorIndex = Number(data.sensor) - 1;
    var sensorIndex = validSensorIndexes[0];
    if (validSensorIndexes.indexOf(latestSensorIndex) !== -1) {
      sensorIndex = latestSensorIndex;
    }
    var holeIndex = Number(data.sensors[sensorIndex].hole);

    if (!Number.isInteger(holeIndex) || holeIndex < 0 || holeIndex >= this.holes.length) {
      return null;
    }

    return {
      sensorIndex: sensorIndex,
      holeIndex: holeIndex,
      distanceCm: data.sensors[sensorIndex].distance_cm,
    };
  },

  // Move the player marker onto their hole (hide it when unknown)
  displayPlayerPosition: function (data) {
    var position = this.getPlayerPosition(data);

    if (!position) {
      this.playerMarker.classList.add("hidden");
      this.playerMarker.removeAttribute("title");
      return null;
    }

    var targetHole = null;
    for (var i = 0; i < this.holes.length; i++) {
      if (Number(this.holes[i].dataset.hole) === position.holeIndex) {
        targetHole = this.holes[i];
      }
    }
    targetHole.appendChild(this.playerMarker);
    this.playerMarker.classList.remove("hidden");
    if (Number.isFinite(position.xM)) {
      this.playerMarker.title =
        "Player: hole " + (position.holeIndex + 1) + " (" + position.xM.toFixed(2) + ", " + position.yM.toFixed(2) + " m)";
    } else {
      this.playerMarker.title = "Player: hole " + (position.holeIndex + 1) + ", sensor " + (position.sensorIndex + 1);
    }
    return position;
  },

  // Debug box (top-right of the page), moved it into this js file instead of the old gamelogic file 
  updateDebugPanel: function (data) {
    if (!data) {
      this.debugDisplays[0].textContent = "Disconnected";
      this.debugDisplays[1].textContent = "Disconnected";
      this.debugLastEvent.textContent = "Disconnected";
      return;
    }

    if (data.source === "access_point") {
      this.debugLabels[0].textContent = "Position";
      this.debugLabels[1].textContent = "Network";

      var xM = Number(data.position && data.position.x_m);
      var yM = Number(data.position && data.position.y_m);
      var currentHole = Number(data.current_hole);
      var positionValid = data.position && data.position.valid && Number.isFinite(xM) && Number.isFinite(yM);
      var holeText = currentHole >= 0 ? "Hole " + (currentHole + 1) : "stabilising";
      this.debugDisplays[0].textContent = positionValid
        ? xM.toFixed(2) + ", " + yM.toFixed(2) + " m | " + holeText
        : "No valid fix | " + (Number(data.position && data.position.sensors_used) || 0) + " ranges";

      var nodeOnline = Array.isArray(data.node_online) ? data.node_online : [false, false];
      var validRangeCount = 0;
      var totalRangeCount = 0;
      if (Array.isArray(data.ranges_m)) {
        totalRangeCount = data.ranges_m.length;
        for (var i = 0; i < data.ranges_m.length; i++) {
          if (data.ranges_m[i] !== null && Number.isFinite(Number(data.ranges_m[i]))) {
            validRangeCount++;
          }
        }
      }
      this.debugDisplays[1].textContent =
        "N1 " + (nodeOnline[0] ? "online" : "offline") + " | " +
        "N2 " + (nodeOnline[1] ? "online" : "offline") + " | " +
        validRangeCount + "/" + totalRangeCount + " ranges";

      if (Number(data.event_id) === 0) {
        this.debugLastEvent.textContent = "None";
      } else {
        this.debugLastEvent.textContent =
          "#" + data.event_id + " | Hole " + (Number(data.hole) + 1) + " | " +
          Number(data.distance_cm).toFixed(1) + " cm from screen";
      }
      return;
    }

    this.debugLabels[0].textContent = "Sensor 1";
    this.debugLabels[1].textContent = "Sensor 2";
    for (var s = 0; s < this.debugDisplays.length; s++) {
      var sensor = data.sensors && data.sensors[s];
      if (!sensor) {
        this.debugDisplays[s].textContent = "Disconnected";
      } else {
        var distance = sensor.distance_cm === null ? "No echo" : "Avg " + sensor.distance_cm + " cm";
        var hole = sensor.valid && Number(sensor.hole) >= 0 ? "Hole " + (Number(sensor.hole) + 1) : "No player";
        this.debugDisplays[s].textContent = distance + " | " + hole;
      }
    }

    if (Number(data.event_id) === 0) {
      this.debugLastEvent.textContent = "None";
    } else {
      this.debugLastEvent.textContent =
        "#" + data.event_id + " | S" + data.sensor + " | Hole " + (Number(data.hole) + 1) + " | " + data.distance_cm + " cm";
    }
  },

  // Status line under the game (This is for debugging, was just trying to emulate, doesn't effect much)
  updateSensorStatus: function (connected, data) {
    this.sensorStatus.classList.toggle("connected", connected);
    this.sensorStatus.classList.toggle("disconnected", !connected);

    if (!connected) {
      this.playerMarker.classList.add("hidden");
      this.updateDebugPanel(null);
      this.sensorStatus.textContent = "Sensor controller: disconnected (mouse testing is available)";
      return;
    }

    this.updateDebugPanel(data);
    var playerPosition = this.displayPlayerPosition(data);

    //Too close logic, basically so ian doesn't say we don't warn players
    if (data && data.source === "access_point") {
      var position = data.position;
      var axM = Number(position && position.x_m);
      var ayM = Number(position && position.y_m);
      var warning = position && position.warning ? "WARNING: too close to screen — " : "";
      if (position && position.valid) {
        var where = playerPosition ? "hole " + (playerPosition.holeIndex + 1) : "position";
        this.sensorStatus.textContent =
          warning + "Access point: tracking " + where + " at " + axM.toFixed(2) + ", " + ayM.toFixed(2) + " m";
      } else {
        this.sensorStatus.textContent = "Access point: connected — waiting for a valid player position";
      }
      return;
    }

    //checking if there is a player and if the sensor is live
    var activeSensors = [];
    var list = Array.isArray(data && data.sensors) ? data.sensors : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].valid) {
        activeSensors.push("S" + (i + 1) + ": " + list[i].distance_cm + " cm");
      }
    }
    if (activeSensors.length) {
      var who = playerPosition ? "hole " + (playerPosition.holeIndex + 1) : "position unknown";
      this.sensorStatus.textContent = "Player: " + who + " — " + activeSensors.join(" | ");
    } else {
      this.sensorStatus.textContent = "Sensor controller: connected — waiting for player";
    }
  },
};
