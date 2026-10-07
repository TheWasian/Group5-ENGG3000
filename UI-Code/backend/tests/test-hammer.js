// Hammer tests: the sensor-driven hammer marker (player-marker), the
// sensor->whack wiring, and the #hammer-cursor element the frontend left
// in the markup.
// Method: direct calls against SensorService + the wiring main.js installed.
const fs = require("fs");
const path = require("path");
const h = require("./helpers");
const { check } = h;
const SECTION = "Hammer";
const W8 = { week: 8 };

// Captured when this module is required — i.e. before other suites replace
// SensorService.onHit with their own spies — so we can restore main.js's
// real handler here.
const MAIN_ON_HIT = SensorService.onHit;

async function run() {
  console.log("== Hammer (sensor marker + wiring) ==");
  await h.test(SECTION, "sensor hammer follows the player's hole", () => {
    const p = SensorService.displayPlayerPosition({
      sensors: [
        { valid: true, hole: 4, distance_cm: 42 },
        { valid: false, hole: -1, distance_cm: null },
      ],
      sensor: 1,
    });
    check("marker found at hole 4", p && p.holeIndex, 4);
    check("marker visible", SensorService.playerMarker._classes.has("hidden"), false);
    check(
      "marker title names the hole",
      String(SensorService.playerMarker.title).indexOf("hole 5") !== -1,
      true
    );
    // No valid fix: the hammer is hidden rather than parked on a wrong hole.
    const none = SensorService.displayPlayerPosition({ sensors: [{ valid: false }] });
    check("no fix -> no position", none, null);
    check("marker hidden without a fix", SensorService.playerMarker._classes.has("hidden"), true);
    // Offline hides it too.
    SensorService.updateSensorStatus(false);
    check("offline hides the marker", SensorService.playerMarker._classes.has("hidden"), true);
    check(
      "offline status line",
      SensorService.sensorStatus.textContent.indexOf("disconnected") !== -1,
      true
    );
  }, W8);

  await h.test(SECTION, "a sensor hit is scored through GameService", () => {
    if (typeof MAIN_ON_HIT !== "function") throw new Error("main.js did not install SensorService.onHit");
    SensorService.onHit = MAIN_ON_HIT;
    GameService.start();
    GameService.spawnMole("normal", 4);
    const before = GameService.game.score;
    // Occupancy at the mole's hole -> flash + whack.
    SensorService.onHit(4, "occupancy");
    check("sensor whack scores +50", GameService.game.score - before, 50);
    check("sensor whack source recorded", GameService.game.score, 50);
    // Occupancy on an empty hole must NOT reset anything (occupancy guard).
    GameService.spawnMole("normal", 2);
    const before2 = GameService.game.score;
    SensorService.onHit(5, "occupancy");
    check("occupancy on empty hole does not score", GameService.game.score, before2);
    check("mole untouched by empty-hole occupancy", GameService.game.mole.hole, 2);
    GameService.game.playing = false;
  }, W8);

  await h.test(SECTION, "#hammer-cursor has styling and wiring", () => {
    // index.html ships <div id="hammer-cursor"> but commit df8fe44 removed
    // the CSS/JS that used it: dead markup. This test is EXPECTED to fail
    // (known, frontend-owned) so the report can list it as a gap.
    const css = fs.readFileSync(path.join(__dirname, "..", "..", "styles.css"), "utf8");
    const html = fs.readFileSync(path.join(__dirname, "..", "..", "index.html"), "utf8");
    const js = fs
      .readdirSync(path.join(__dirname, ".."))
      .filter((f) => f.endsWith(".js"))
      .map((f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8"))
      .join("\n");
    check("markup exists (dead markup is the bug)", html.indexOf('id="hammer-cursor"') !== -1, true);
    const cssOk = /#hammer-cursor/.test(css);
    const jsOk = /hammer-cursor/.test(js);
    check("CSS rule + JS wiring for #hammer-cursor (both removed by df8fe44)", cssOk && jsOk, true);
  }, { week: 8, known: true });
}

module.exports = { run };
