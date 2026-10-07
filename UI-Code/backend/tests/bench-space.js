// Child-process heap probe (run with --expose-gc by tests/test-complexity.js).
// Loads ONE architecture, forces GC, records heapUsed; runs a scripted game
// to 2000 points, forces GC again, records heapUsed; prints JSON (KB).
//
//   node --expose-gc tests/bench-space.js services
//   node --expose-gc tests/bench-space.js monolith
if (typeof global.gc !== "function") {
  process.stderr.write("bench-space.js must run with --expose-gc\n");
  process.exit(2);
}

const h = require("./helpers");
const path = process.argv[2] || "services";

function kb() {
  // Read the retained floor: the first full GC can leave materialisation
  // garbage behind right after loading a vm context, so force GC a few
  // times and keep the lowest reading.
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    global.gc();
    const v = process.memoryUsage().heapUsed / 1024;
    if (v < best) best = v;
  }
  return best;
}

function playGame() {
  if (path === "services") {
    GameService.start();
    let n = 0;
    while (GameService.game.playing && n < 200) {
      GameService.spawnMole("normal", n % 6);
      GameService.whack(GameService.game.mole.hole, "mouse");
      n++;
    }
    return { score: GameService.game.score, ops: n };
  }
  const m = h.__monolith;
  m.run("gameActive = true; score = 0; lives = 3;");
  let n = 0;
  while (n < 200 && m.read("score") < 2000) {
    // Force a normal mole so both architectures play the identical scripted
    // game (40 whacks to 2000) instead of one rolling bombs.
    m.run("spawnMole(); activeMoleType = 'normal'; whackHole(Number(activeHole.dataset.hole));");
    n++;
  }
  return { score: m.read("score"), ops: n };
}

let loadKB, gameKB, meta;

if (path === "services") {
  h.loadServices();
  loadKB = kb();
  meta = playGame();
  gameKB = kb();
} else if (path === "monolith") {
  const m = h.loadMonolith();
  h.__monolith = m;
  loadKB = kb();
  meta = playGame();
  gameKB = kb();
} else {
  process.stderr.write("unknown path: " + path + "\n");
  process.exit(2);
}

process.stdout.write(
  JSON.stringify({
    path,
    loadKB: Math.round(loadKB * 10) / 10,
    gameKB: Math.round(gameKB * 10) / 10,
    deltaKB: Math.round((gameKB - loadKB) * 10) / 10,
    score: meta.score,
    whacks: meta.ops,
  })
);
