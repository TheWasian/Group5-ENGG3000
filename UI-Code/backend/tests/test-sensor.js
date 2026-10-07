// SensorService logic tests: position mapping + basic poll handling.
// Method: direct getPlayerPosition() calls for both ESP32 formats,
// then a scripted fetch queue (baseline -> fresh -> stale -> offline).
// Poll speed + connection consistency live in test-connection.js.
const h = require("./helpers");
const { check } = h;
const SECTION = "SensorService";

async function run() {
  console.log("== SensorService (polling + positions) ==");
  await h.test(SECTION, "finds the player's hole in both ESP32 formats", () => {
    const ap = SensorService.getPlayerPosition({
      current_hole: 3,
      position: { valid: true, x_m: 1.25, y_m: 2, age_ms: 20, sensors_used: 2 },
    });
    check("access-point hole", ap.holeIndex, 3);
    check(
      "bad fix -> null",
      SensorService.getPlayerPosition({ current_hole: 3, position: { valid: false }, sensors: [] }),
      null
    );
    const lanes = SensorService.getPlayerPosition({
      sensor: 2,
      sensors: [
        { valid: true, hole: 0 },
        { valid: true, hole: 4 },
      ],
    });
    check("latest lane wins", lanes.holeIndex, 4);
    check("no valid -> null", SensorService.getPlayerPosition({ sensors: [{ valid: false }] }), null);
    check("no data -> null", SensorService.getPlayerPosition(null), null);
  }, { week: 8 });
  await h.test(SECTION, "polling: fresh hit forwarded, stale ignored, offline shown", async () => {
    const hits = [];
    SensorService.onHit = (hole) => hits.push(hole);
    SensorService.lastEventId = null;
    h.setFetchQueue([{ body: { event_id: 5, hole: 0, event_age_ms: 10 } }]);
    await SensorService.check();
    await h.flush();
    check("baseline: no hit yet", hits.length, 0);
    h.setFetchQueue([
      {
        body: {
          event_id: 6,
          hole: 2,
          event_age_ms: 50,
          sensors: [
            { valid: true, hole: 2, distance_cm: 42 },
            { valid: false, hole: -1, distance_cm: null },
          ],
        },
      },
    ]);
    await SensorService.check();
    await h.flush();
    check("fresh event -> hit hole 2", hits.join(), "2");
    check("debug box filled", h.getById("debug-sensor-1").textContent.indexOf("Hole 3") !== -1, true);
    h.setFetchQueue([{ body: { event_id: 7, hole: 1, event_age_ms: 5000 } }]);
    await SensorService.check();
    await h.flush();
    check("stale event ignored", hits.length, 1);
    h.setFetchQueue([{ error: true }]);
    await SensorService.check();
    await h.flush();
    check(
      "offline shown on page",
      h.getById("sensor-status").textContent.indexOf("disconnected") !== -1,
      true
    );
  }, { week: 8 });
}

module.exports = { run };
