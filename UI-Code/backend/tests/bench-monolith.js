// Child-process timing probe for the LIVE monolith (gameLogic.js).
// Run by tests/test-complexity.js so the two architectures never share a
// global scope. Prints one JSON object on stdout; everything in ms (D8).
//
//   node tests/bench-monolith.js
const h = require("./helpers");

const ATTEMPTS = 10;

function measure(fn, opsPerAttempt) {
  fn(); // warm up
  const attempts = [];
  for (let a = 0; a < ATTEMPTS; a++) {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < opsPerAttempt; i++) fn(i);
    attempts.push(Number(process.hrtime.bigint() - t0) / opsPerAttempt);
  }
  attempts.sort((x, y) => x - y);
  const avg = attempts.reduce((s, v) => s + v, 0) / ATTEMPTS;
  return {
    ops: opsPerAttempt,
    attempts: ATTEMPTS,
    bestMs: attempts[0] / 1e6,
    avgMs: avg / 1e6,
    worstMs: attempts[ATTEMPTS - 1] / 1e6,
    perThousandMs: (avg / 1e6) * 1000,
    perSec: Math.round(1e9 / avg),
  };
}

const m = h.loadMonolith();

// Probes are compiled inside the sandbox so their bodies run against the
// monolith's own globals with zero bridging cost.
const probes = m.run(`({
  hit: function () {
    if (score > 1500) score = 0;
    lives = 3; // bombs must never end the timed run
    gameActive = true;
    spawnMole();
    whackHole(Number(activeHole.dataset.hole));
  },
  spawn: function () {
    gameActive = true;
    spawnMole();
  },
  level: function () {
    gameActive = false;
    score = (score + 50) % 1900;
    checkLevel();
    updateProgress();
  }
})`);

const out = {
  path: "monolith",
  file: "backend/gameLogic.js",
  probes: {
    "score a normal hit (spawn + whack)": measure(probes.hit, 2000),
    "spawn a mole": measure(probes.spawn, 5000),
    "level + progress update": measure(probes.level, 5000),
  },
};

process.stdout.write(JSON.stringify(out));
