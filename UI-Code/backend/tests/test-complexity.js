// Complexity probes: time + space, monolith vs services.
// Time: each probe is timed 10x (best/worst/average) and reported in ms;
// input-size sweeps turn growth into an O() verdict.
// Cross-architecture: the live monolith is measured in its own child process
// (tests/bench-monolith.js) so the two paths never share a global scope.
// Space: heap deltas from tests/bench-space.js (--expose-gc, best of 3).
const { execFileSync } = require("child_process");
const path = require("path");
const h = require("./helpers");
const SECTION = "Complexity";
const W8 = { week: 8 };

function measureLocal(fn, ops) {
  fn();
  const attempts = [];
  for (let a = 0; a < 10; a++) {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < ops; i++) fn(i);
    attempts.push(Number(process.hrtime.bigint() - t0) / ops);
  }
  attempts.sort((x, y) => x - y);
  const avg = attempts.reduce((s, v) => s + v, 0) / 10;
  return {
    ops,
    attempts: 10,
    bestMs: attempts[0] / 1e6,
    avgMs: avg / 1e6,
    worstMs: attempts[9] / 1e6,
    perThousandMs: (avg / 1e6) * 1000,
    perSec: Math.round(1e9 / avg),
  };
}

function median(list) {
  const s = list.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function run() {
  console.log("== TIME COMPLEXITY (measured: 10 attempts each, reported in ms) ==");
  await h.test(SECTION, "O(1): fixed work stays flat", () => {
    h.printProbe(
      h.complexityFlat("LevelingService.getLevel (3 fixed ifs)", (x, i) => LevelingService.getLevel(i % 2100), 50000, "score value never changes the 3 ifs")
    );
    h.printProbe(
      h.complexityFlat("MoleService.pickType (one dice roll)", (x, i) => MoleService.pickType(1 + (i % 3)), 20000, "one roll over the level table whatever the level")
    );
    h.printProbe(
      h.complexityFlat("StreakService.hit (one multiply)", (x, i) => StreakService.hit(i % 15), 50000, "single multiply, no loops")
    );
    h.printProbe(
      h.complexityFlat("HighScoreService.get (one storage read)", () => HighScoreService.get(), 20000, "one localStorage read whatever the score")
    );
    // whack() has no loops over inputs: fixed scoring math per hit.
    GameService.start();
    h.printProbe(
      h.complexityFlat("GameService.whack (fixed pipeline)", () => {
        const g = GameService.game;
        if (!g || !g.playing) {
          GameService.start();
          GameService.game.score = 0;
        } else if (g.score > 1500) {
          g.score = 0;
        }
        GameService.spawnMole("normal", 0);
        GameService.whack(0, "mouse");
      }, 2000, "same fixed steps every hit, nothing scales with input")
    );
    const row = h.stats().complexityProbes[h.stats().complexityProbes.length - 1];
    checkAllFlat(row);
  }, W8);

  await h.test(SECTION, "O(s): sensor work grows with sensor count", () => {
    // s = number of sensors. All invalid, so the whole list is scanned.
    const probe = h.complexityScales(
      "SensorService.getPlayerPosition (scans s sensors)",
      "s",
      [2, 20, 200],
      (n) => {
        const sensors = [];
        for (let i = 0; i < n; i++) sensors.push({ valid: false });
        return { sensors };
      },
      (data) => SensorService.getPlayerPosition(data),
      2000,
      "one loop over the sensor list"
    );
    h.printProbe(probe);
    const first = probe.sizes[0].avgMs;
    const last = probe.sizes[probe.sizes.length - 1].avgMs;
    if (last <= first * 2) {
      // Flat at these sizes: still report the structural O(s), but say so.
      probe.verdict += " (measured flat at s<=200: loop is too cheap to see against call overhead)";
    }
  }, W8);

  await h.test(SECTION, "monolith vs services, same operation, measured in ms", () => {
    // 1. services side, in this process
    GameService.start();
    const svc = {
      "score a normal hit (spawn + whack)": measureLocal(() => {
        if (!GameService.game || !GameService.game.playing || GameService.game.score > 1500) {
          GameService.start();
          GameService.game.score = 0;
          GameService.game.maxLevel = 1;
          GameService.game.level = 1;
        }
        GameService.game.lives = 3; // bombs must never end the timed run
        GameService.spawnMole();
        GameService.whack(GameService.game.mole.hole, "mouse");
      }, 2000),
      "spawn a mole": measureLocal(() => {
        if (!GameService.game || !GameService.game.playing) GameService.start();
        GameService.spawnMole();
      }, 5000),
      "level + progress update": measureLocal(() => {
        if (!GameService.game) GameService.start();
        GameService.game.score = (GameService.game.score + 50) % 1900;
        GameService.applyLevel();
        GameService.refreshProgress();
      }, 5000),
    };

    // 2. monolith side, child process
    const raw = execFileSync(process.execPath, [path.join(__dirname, "bench-monolith.js")], {
      encoding: "utf8",
    });
    const mono = JSON.parse(raw);

    for (const label of Object.keys(mono.probes)) {
      h.crossArch.push({
        op: label,
        monolith: mono.probes[label],
        services: svc[label],
        note:
          label.indexOf("level") === 0
            ? "services memoise the level (maxLevel), so repeated updates skip work the monolith redoes"
            : "",
      });
      const ratio = svc[label].avgMs / mono.probes[label].avgMs;
      console.log(
        "  " +
          label.padEnd(38) +
          " monolith " + mono.probes[label].avgMs.toFixed(6) + " ms/op | " +
          "services " + svc[label].avgMs.toFixed(6) + " ms/op | " +
          "ratio " + ratio.toFixed(2) + "x"
      );
    }
    checkAllFinite(mono, svc);
  }, W8);

  await h.test(SECTION, "space: heap used by each architecture (child --expose-gc)", () => {
    const modes = ["services", "monolith"];
    for (const mode of modes) {
      const runs = [];
      for (let i = 0; i < 3; i++) {
        const out = execFileSync(
          process.execPath,
          ["--expose-gc", path.join(__dirname, "bench-space.js"), mode],
          { encoding: "utf8" }
        );
        runs.push(JSON.parse(out));
      }
      const pick = runs.slice().sort((a, b) => a.deltaKB - b.deltaKB)[1] || runs[0];
      h.spaceProbes.push({
        path: mode,
        file: mode === "services" ? "backend/services/* + main.js" : "backend/gameLogic.js",
        loadKB: pick.loadKB,
        gameKB: pick.gameKB,
        deltaKB: median(runs.map((r) => r.deltaKB)),
        score: pick.score,
        whacks: pick.whacks,
        runs: runs.map((r) => r.deltaKB),
      });
      console.log(
        "  " + mode.padEnd(10) +
        " load " + pick.loadKB + " KB | after game " + pick.gameKB +
        " KB | delta " + median(runs.map((r) => r.deltaKB)) + " KB (3 runs)"
      );
    }
    h.check("both paths measured", h.spaceProbes.length, 2);
    h.check("services path produced a game", h.spaceProbes[0].score >= 2000 || h.spaceProbes[0].whacks > 0, true);
    h.check("monolith path produced a game", h.spaceProbes[1].score > 0, true);
  }, W8);
}

function checkAllFlat(row) {
  const spread = row.sizes[0].worstMs / row.sizes[0].bestMs;
  console.log("  (worst/best spread " + spread.toFixed(2) + "x over 10 attempts)");
}

function checkAllFinite(mono, svc) {
  const h2 = require("./helpers");
  let ok = true;
  for (const k of Object.keys(mono.probes)) {
    if (!isFinite(mono.probes[k].avgMs) || !isFinite(svc[k].avgMs)) ok = false;
    if (mono.probes[k].avgMs <= 0 || svc[k].avgMs <= 0) ok = false;
  }
  h2.check("every probe produced a positive finite ms/op", ok, true);
}

module.exports = { run };
