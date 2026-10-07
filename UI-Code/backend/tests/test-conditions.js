// EnvironmentService + GameConditionService + HighScoreService tests.
// Method: direct calls with fixed values (theme table, win/lose rules,
// high-score submit/get against the fake localStorage).
const h = require("./helpers");
const { check } = h;
const SECTION = "Conditions";
const W5 = { week: 5 };

async function run() {
  console.log("== EnvironmentService + GameConditionService + HighScoreService ==");
  await h.test(SECTION, "theme per level + win/lose", () => {
    check("L1", EnvironmentService.themeFor(1), "grassland");
    check("L2", EnvironmentService.themeFor(2), "freezing");
    check("L3", EnvironmentService.themeFor(3), "fire");
    check("L4 hook kept", EnvironmentService.themeFor(4), "toxic");
    check("L5 hook kept", EnvironmentService.themeFor(5), "void");
    check("unknown level falls back", EnvironmentService.themeFor(99), "grassland");
    check("won", GameConditionService.check(2000, 2, 100), "won");
    check("not won at 1999", GameConditionService.check(1999, 2, 100), "playing");
    check("dead", GameConditionService.check(10, 0, 100), "lost");
    check("timeout", GameConditionService.check(10, 2, 0), "lost");
    check("playing", GameConditionService.check(10, 2, 100), "playing");
  }, W5);
  await h.test(SECTION, "high score: only beaten records save", () => {
    localStorage.clear();
    check("fresh best is 0", HighScoreService.get(), 0);
    let r = HighScoreService.submit(100);
    check("100 is new best", r.isNewBest, true);
    check("best now 100", r.best, 100);
    r = HighScoreService.submit(50);
    check("50 is not best", r.isNewBest, false);
    check("best still 100", HighScoreService.get(), 100);
    r = HighScoreService.submit(150);
    check("150 beats it", r.isNewBest, true);
    check("best now 150", HighScoreService.get(), 150);
    check("tie is not new best", HighScoreService.submit(150).isNewBest, false);
  }, W5);
}

module.exports = { run };
