// GameService tests: scripted play through the live legend (normal, bomb,
// golden, frozen), freeze semantics, escape rules, plus a full bot game.
// Method: forced spawnMole(type, hole) + whack() (scripted simulation
// with exact score math), plus one end-to-end bot game.
const h = require("./helpers");
const { check } = h;
const SECTION = "GameService";
const W5 = { week: 5 };
const W6 = { week: 6 };
const W8 = { week: 8 };

async function run() {
  console.log("== GameService (scripted play) ==");
  await h.test(SECTION, "start resets everything", () => {
    GameService.start();
    const g = GameService.game;
    check("playing", g.playing, true);
    check("score 0", g.score, 0);
    check("level 1", g.level, 1);
    check("3 lives", g.lives, 3);
    check("300s", g.timeLeft, 300);
    check("mole up", !!g.mole, true);
    check("streak 0", g.streak, 0);
    check("multiplier 1", g.multiplier, 1);
    check("no freeze pending", g.freezeTicksLeft, 0);
    check("timer not frozen", h.getById("timer")._classes.has("frozen"), false);
    check("environment is grassland", document.body._classes.has("env-grassland") || !document.body._classes.has("env-fire"), true);
  }, W5);

  await h.test(SECTION, "normal pays exactly +50 (flat, no streak multiplier)", () => {
    GameService.start();
    let expected = 0;
    for (let i = 1; i <= 3; i++) {
      GameService.spawnMole("normal", i % 6);
      const before = GameService.game.score;
      const res = GameService.whack(GameService.game.mole.hole, "mouse");
      expected += 50;
      check("hit " + i + " exact", GameService.game.score - before, 50);
      check("hit " + i + " returns 50", res.points, 50);
    }
    check("total exact", GameService.game.score, expected);
    check("score is 150 not 150 x multiplier", GameService.game.score, 150);
    check("multiplier untouched", GameService.game.multiplier, 1);
  }, W6);

  await h.test(SECTION, "bomb costs a life and pays nothing", () => {
    GameService.start();
    const g = GameService.game;
    const livesBefore = g.lives;
    GameService.spawnMole("bomb", 0);
    const before = g.score;
    const res = GameService.whack(0, "mouse");
    check("bomb pays 0", g.score - before, 0);
    check("bomb result", res.bomb, true);
    check("bomb costs a life", g.lives, livesBefore - 1);
    check("score still 0", g.score, 0);
  }, W8);

  await h.test(SECTION, "golden pays +200 and lives 25% less", () => {
    GameService.start();
    const g = GameService.game;
    GameService.spawnMole("golden", 1);
    check("golden window is 75%", h.getLastTimeoutMs(), 2400);
    const before = g.score;
    GameService.whack(1, "mouse");
    check("golden +200", g.score - before, 200);
    check("golden no life lost", g.lives, 3);
  }, W6);

  await h.test(SECTION, "frozen pays +50 and freezes the clock 5s", () => {
    GameService.start();
    const g = GameService.game;
    const t = g.timeLeft;
    GameService.spawnMole("frozen", 2);
    check("frozen keeps full window", h.getLastTimeoutMs(), 3200);
    const before = g.score;
    GameService.whack(2, "mouse");
    check("frozen +50", g.score - before, 50);
    check("freeze armed", g.freezeTicksLeft, 5);
    check("timer shows frozen", h.getById("timer")._classes.has("frozen"), true);
    check("clock untouched by the hit", g.timeLeft, t);
  }, W8);

  await h.test(SECTION, "frozen ticks consume freeze, not the clock", () => {
    GameService.start();
    const g = GameService.game;
    g.freezeTicksLeft = 0;
    g.timeLeft = 100;
    GameService.freezeTimer(5);
    for (let i = 0; i < 5; i++) GameService.tickSecond();
    check("clock unchanged after 5 frozen ticks", g.timeLeft, 100);
    check("freeze spent", g.freezeTicksLeft, 0);
    check("frozen class cleared", h.getById("timer")._classes.has("frozen"), false);
    check("freeze ended message", h.getById("status-message").textContent.indexOf("Freeze ended") !== -1, true);
    GameService.tickSecond();
    check("clock runs again", g.timeLeft, 99);
    // A frozen countdown can never end the game by itself.
    g.timeLeft = 1;
    g.freezeTicksLeft = 3;
    GameService.tickSecond();
    check("frozen tick at 1s keeps playing", g.playing, true);
    check("clock still 1", g.timeLeft, 1);
  }, W8);

  await h.test(SECTION, "escapes: only a normal mole costs a life", () => {
    GameService.start();
    const g = GameService.game;
    GameService.spawnMole("bomb", 0);
    let r = GameService.onMoleMissed();
    check("bomb escape is free", g.lives, 3);
    check("bomb escape reported", r.type, "bomb");

    GameService.spawnMole("golden", 1);
    GameService.onMoleMissed();
    check("golden escape is free", g.lives, 3);

    GameService.spawnMole("frozen", 2);
    GameService.onMoleMissed();
    check("frozen escape is free", g.lives, 3);

    GameService.spawnMole("normal", 3);
    r = GameService.onMoleMissed();
    check("normal escape costs a life", g.lives, 2);
    check("normal escape reported", r.type, "normal");
  }, W8);

  await h.test(SECTION, "wrong hole never scores and never crashes", () => {
    GameService.start();
    const g = GameService.game;
    GameService.spawnMole("normal", 0);
    const before = g.score;
    const res = GameService.whack(1, "mouse");
    check("wrong hole misses", res.hit, false);
    check("score unchanged", g.score, before);
    check("mole still up", g.mole.hole, 0);
    check("non-integer index ignored", GameService.whack(1.5).hit, false);
    g.playing = false;
    check("whack after game over ignored", GameService.whack(0).hit, false);
    g.playing = true;
  }, W6);

  await h.test(SECTION, "miss loses a life; 0 lives ends game; 2000 wins", () => {
    GameService.start();
    GameService.spawnMole("normal", 0);
    GameService.onMoleMissed();
    check("miss -1 life", GameService.game.lives, 2);
    GameService.game.lives = 1;
    GameService.spawnMole("normal", 0);
    GameService.onMoleMissed();
    check("dead game stops", GameService.game.playing, false);
    GameService.start();
    GameService.game.score = 2000;
    GameService.applyLevel();
    GameService.refreshProgress();
    check("progress bar reaches Win", h.getById("progress-text").textContent.indexOf("Win") !== -1, true);
    check("win", GameService.checkEnd(), "won");
  }, W5);

  await h.test(SECTION, "level up at 500/1000 changes speed + environment", () => {
    GameService.start();
    const g = GameService.game;
    g.score = 499;
    GameService.applyLevel();
    check("still L1", g.level, 1);
    g.score = 500;
    GameService.applyLevel();
    check("L2 at 500", g.level, 2);
    check("L2 environment", document.body._classes.has("env-freezing"), true);
    g.score = 1000;
    GameService.applyLevel();
    check("L3 at 1000", g.level, 3);
    check("L3 environment", document.body._classes.has("env-fire"), true);
    g.score = 10;
    GameService.applyLevel();
    check("level never drops", g.level, 3);
    GameService.refreshProgress();
    check("progress pinned to L3 band", h.getById("progress-text").textContent.indexOf("/ 1000") !== -1, true);
  }, W5);

  await h.test(SECTION, "FULL BOT GAME to 2000 (end-to-end)", () => {
    GameService.start();
    let whacks = 0;
    while (GameService.game.playing && whacks < 500) {
      GameService.spawnMole("normal", whacks % 6);
      GameService.whack(GameService.game.mole.hole, "mouse");
      whacks++;
    }
    check("bot won", GameService.game.playing, false);
    check("score >= 2000", GameService.game.score >= 2000, true);
    check("score math exact (50 x whacks)", GameService.game.score, whacks * 50);
    check("exactly 40 whacks", whacks, 40);
    console.log("  (bot needed " + whacks + " whacks to win)");
    h.perf("GameService.whack (full pipeline)", () => {
      GameService.start();
      GameService.spawnMole("normal", 0);
      GameService.whack(0, "mouse");
    }, 2000);
  }, W6);
}

module.exports = { run };
