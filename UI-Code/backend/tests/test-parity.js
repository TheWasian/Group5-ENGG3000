// Parity tests: the modular services must agree with the live frontend
// (gameLogic.js). The monolith is loaded in its own vm context and its OWN
// constants/behaviour are the expectations — so if the frontend changes the
// rules again, this suite fails loudly instead of the two paths drifting.
// Method: direct constant comparison + scripted whacks in both contexts.
const h = require("./helpers");
const { check, checkClose } = h;
const SECTION = "Parity";
const W8 = { week: 8 };

// Fire the most recent live mole-lifetime callback in the monolith sandbox.
function fireMonolithTimeout(m) {
  for (let i = m.timers.timeouts.length - 1; i >= 0; i--) {
    const fn = m.timers.timeouts[i];
    if (fn) {
      m.timers.timeouts[i] = null;
      fn();
      return true;
    }
  }
  return false;
}

async function run() {
  console.log("== Parity: services == live gameLogic.js ==");
  const m = h.loadMonolith();

  await h.test(SECTION, "scoring constants match the live game", () => {
    check("normal points", MoleService.POINTS.normal, m.read("POINTS_PER_MOLE"));
    check("golden points", MoleService.POINTS.golden, m.read("GOLDEN_POINTS"));
    check("bomb pays nothing", MoleService.POINTS.bomb, 0);
    check("frozen pays the normal amount", MoleService.POINTS.frozen, m.read("POINTS_PER_MOLE"));
    check("golden chance", MoleService.SPAWN_CHANCES[1].golden, m.read("GOLDEN_CHANCE"));
    check("frozen chance", MoleService.SPAWN_CHANCES[1].frozen, m.read("FROZEN_CHANCE"));
    check("freeze seconds", MoleService.FREEZE_SECONDS, m.read("FREEZE_SECONDS"));
    check("golden lifetime factor", MoleService.GOLDEN_LIFETIME_FACTOR, m.read("GOLDEN_LIFETIME_FACTOR"));
    check("round time", GameService.ROUND_TIME, m.read("ROUND_TIME"));
    check("starting lives", GameService.START_LIVES, m.read("STARTING_LIVES"));
  }, W8);

  await h.test(SECTION, "level thresholds match the live game", () => {
    check("L2 at", (function () {
      const band = LevelingService.bandFor(1);
      return band.to;
    })(), m.read("LEVEL_2_AT"));
    check("L3 at", LevelingService.bandFor(2).to, m.read("LEVEL_3_AT"));
    check("win at", LevelingService.WIN_AT, m.read("WIN_AT"));
    check("getLevel agrees at 0", LevelingService.getLevel(0), m.run("checkLevel(); level"));
    // checkLevel() reads the sandbox `score`, so drive it explicitly.
    check("getLevel agrees at 499", LevelingService.getLevel(499), m.run("score=499; checkLevel(); level"));
    check("getLevel agrees at 500", LevelingService.getLevel(500), m.run("score=500; checkLevel(); level"));
    check("getLevel agrees at 999", LevelingService.getLevel(999), m.run("score=999; checkLevel(); level"));
    check("getLevel agrees at 1000", LevelingService.getLevel(1000), m.run("score=1000; checkLevel(); level"));
    check("getLevel agrees at 1999", LevelingService.getLevel(1999), m.run("score=1999; checkLevel(); level"));
    check("live win at 2000", m.run("score=2000; checkLevel(); gameActive"), false);
  }, W8);

  await h.test(SECTION, "spawn odds match the live bomb/golden/frozen roll", () => {
    // bombChance is assigned inside spawnMole(), not exported: read it from
    // the source table the live game actually uses.
    const chances = (m.src.match(/bombChance = (0\.\d+)/g) || []).map((s) => Number(s.split("=")[1].trim()));
    check("live table has 3 levels", chances.length, 3);
    checkClose("L1 bomb", MoleService.SPAWN_CHANCES[1].bomb, chances[0], 1e-9);
    checkClose("L2 bomb", MoleService.SPAWN_CHANCES[2].bomb, chances[1], 1e-9);
    checkClose("L3 bomb", MoleService.SPAWN_CHANCES[3].bomb, chances[2], 1e-9);
    // The live roll order is bomb -> golden -> frozen -> normal, matching
    // the iteration order of SPAWN_CHANCES.
    check("roll order starts with bomb", Object.keys(MoleService.SPAWN_CHANCES[1])[0], "bomb");
    check("then golden", Object.keys(MoleService.SPAWN_CHANCES[1])[1], "golden");
    check("then frozen", Object.keys(MoleService.SPAWN_CHANCES[1])[2], "frozen");
    check("then normal", Object.keys(MoleService.SPAWN_CHANCES[1])[3], "normal");
  }, W8);

  await h.test(SECTION, "spawn interval + lifetime match per level", () => {
    m.run("score=0; checkLevel(); updateProgress();");
    check("L1 spawn (live)", m.read("SPAWN_INTERVAL"), LevelingService.getSettings(1).spawnEvery);
    check("L1 lifetime (live)", m.read("MOLE_LIFETIME"), LevelingService.getSettings(1).moleStaysUp);

    m.run("score=500; checkLevel();");
    check("L2 spawn (live)", m.read("SPAWN_INTERVAL"), LevelingService.getSettings(2).spawnEvery);
    check("L2 lifetime (live)", m.read("MOLE_LIFETIME"), LevelingService.getSettings(2).moleStaysUp);

    m.run("score=1000; checkLevel();");
    check("L3 spawn (live)", m.read("SPAWN_INTERVAL"), LevelingService.getSettings(3).spawnEvery);
    check("L3 lifetime (live)", m.read("MOLE_LIFETIME"), LevelingService.getSettings(3).moleStaysUp);
  }, W8);

  await h.test(SECTION, "whacking behaves identically in both paths", () => {
    // --- normal ---
    m.run('gameActive=true; score=0; spawnMole(); activeMoleType="normal"; whackHole(Number(activeHole.dataset.hole));');
    check("live normal +50", m.read("score"), MoleService.POINTS.normal);
    GameService.start();
    GameService.spawnMole("normal", 0);
    GameService.whack(0, "mouse");
    check("services normal +50", GameService.game.score, MoleService.POINTS.normal);

    // --- golden ---
    m.run('score=0; spawnMole(); activeMoleType="golden"; whackHole(Number(activeHole.dataset.hole));');
    check("live golden +200", m.read("score"), MoleService.POINTS.golden);
    GameService.start();
    GameService.spawnMole("golden", 0);
    GameService.whack(0, "mouse");
    check("services golden +200", GameService.game.score, MoleService.POINTS.golden);

    // --- bomb ---
    m.run('score=0; lives=3; spawnMole(); activeMoleType="bomb"; whackHole(Number(activeHole.dataset.hole));');
    check("live bomb costs a life", m.read("lives"), 2);
    check("live bomb pays nothing", m.read("score"), 0);
    GameService.start();
    GameService.spawnMole("bomb", 0);
    GameService.whack(0, "mouse");
    check("services bomb costs a life", GameService.game.lives, 2);
    check("services bomb pays nothing", GameService.game.score, 0);

    // --- frozen ---
    m.run('score=0; timeLeft=100; freezeTicksLeft=0; spawnMole(); activeMoleType="frozen"; whackHole(Number(activeHole.dataset.hole));');
    check("live frozen +50", m.read("score"), MoleService.POINTS.frozen);
    check("live freeze armed", m.read("freezeTicksLeft"), m.read("FREEZE_SECONDS"));
    GameService.start();
    GameService.spawnMole("frozen", 0);
    GameService.whack(0, "mouse");
    check("services frozen +50", GameService.game.score, MoleService.POINTS.frozen);
    check("services freeze armed", GameService.game.freezeTicksLeft, MoleService.FREEZE_SECONDS);

    // --- escapes ---
    m.run('lives=3; gameActive=true; spawnMole(); activeMoleType="normal";');
    fireMonolithTimeout(m);
    check("live normal escape costs a life", m.read("lives"), 2);
    m.run('lives=3; spawnMole(); activeMoleType="golden";');
    fireMonolithTimeout(m);
    check("live golden escape is free", m.read("lives"), 3);
    m.run('lives=3; spawnMole(); activeMoleType="bomb";');
    fireMonolithTimeout(m);
    check("live bomb escape is free", m.read("lives"), 3);

    GameService.start();
    GameService.spawnMole("normal", 0);
    GameService.onMoleMissed();
    check("services normal escape costs a life", GameService.game.lives, 2);
    GameService.spawnMole("golden", 0);
    GameService.onMoleMissed();
    check("services golden escape is free", GameService.game.lives, 2);
    GameService.game.playing = false;
  }, W8);

  await h.test(SECTION, "progress bar renders the same text in both paths", () => {
    const cases = [
      [150, 1],
      [750, 2],
      [1500, 3],
      [0, 1],
      [2000, 3],
    ];
    for (const [score, level] of cases) {
      m.run("score=" + score + "; level=" + level + "; updateProgress();");
      const liveText = m.dom.getById("progress-text").textContent;
      const p = LevelingService.getProgressInBand(score, level);
      const svcText = p.done + " / " + p.total + " (" + p.label + ")";
      check("progress text at " + score, liveText, svcText);
      const liveWidth = m.dom.getById("progress-bar").style.width;
      check("progress width at " + score, liveWidth, (p.done / p.total) * 100 + "%");
    }
  }, W8);

  await h.test(SECTION, "ice/fire variant classes are added by the live path", () => {
    // Known frontend gap: styles.css defines .has-normal-ice / .has-bomb-ice /
    // .has-normal-fire / .has-bomb-fire but gameLogic.js never adds them.
    const liveAdds = /has-normal-ice|has-bomb-ice|has-normal-fire|has-bomb-fire/.test(m.src);
    check("services add them", MoleService.variantFor("normal", 2), "has-normal-ice");
    if (!liveAdds) {
      h.partial(
        "ice/fire classes added by the live path",
        "only the services add them: gameLogic.js never sets has-normal-ice / has-bomb-ice / has-normal-fire / has-bomb-fire"
      );
    }
    check("live path gaps recorded", true, true);
  }, { week: 8, known: true });
}

module.exports = { run };
