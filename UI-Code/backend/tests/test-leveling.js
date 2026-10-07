// LevelingService tests: bands, win rule, spawn speeds, progress bar.
// Method: direct calls with fixed values (no randomness, no simulation).
// Week tags follow D3: evolved tests keep their original Sep-22 week,
// brand-new tests are Week 8.
const h = require("./helpers");
const { check } = h;
const SECTION = "LevelingService";
const W5 = { week: 5 };
const W8 = { week: 8 };

async function run() {
  console.log("== LevelingService ==");
  await h.test(SECTION, "level bands (0/499/500/999/1000/1999)", () => {
    check("score 0", LevelingService.getLevel(0), 1);
    check("score 499", LevelingService.getLevel(499), 1);
    check("score 500", LevelingService.getLevel(500), 2);
    check("score 999", LevelingService.getLevel(999), 2);
    check("score 1000", LevelingService.getLevel(1000), 3);
    check("score 1999", LevelingService.getLevel(1999), 3);
    check("MAX_LEVEL", LevelingService.MAX_LEVEL, 3);
    check("L2 floor", LevelingService.minScoreForLevel(2), 500);
    check("L3 floor", LevelingService.minScoreForLevel(3), 1000);
  }, W5);

  await h.test(SECTION, "win at 2000 + spawn/lifetime table", () => {
    check("1999 not won", LevelingService.hasWon(1999), false);
    check("2000 won", LevelingService.hasWon(2000), true);
    check("L1 spawn", LevelingService.getSettings(1).spawnEvery, 3500);
    check("L1 lifetime", LevelingService.getSettings(1).moleStaysUp, 3200);
    check("L2 spawn", LevelingService.getSettings(2).spawnEvery, 2200);
    check("L2 lifetime", LevelingService.getSettings(2).moleStaysUp, 1800);
    check("L3 spawn", LevelingService.getSettings(3).spawnEvery, 1400);
    check("L3 lifetime", LevelingService.getSettings(3).moleStaysUp, 1100);
    check("unknown level falls back to L1", LevelingService.getSettings(9).spawnEvery, 3500);
  }, W5);

  await h.test(SECTION, "progress bar bands (0/500, 500/1000, 1000/2000)", () => {
    const l1 = LevelingService.getProgress(150);
    check("L1 done", l1.done, 150);
    check("L1 total", l1.total, 500);
    check("L1 label", l1.label, "Level 2");

    const l2 = LevelingService.getProgress(900);
    check("L2 done", l2.done, 400);
    check("L2 total", l2.total, 500);
    check("L2 label", l2.label, "Level 3");

    const l3 = LevelingService.getProgress(1500);
    check("L3 done", l3.done, 500);
    check("L3 total", l3.total, 1000);
    check("L3 label", l3.label, "Win");

    check("bar clamps at band start", LevelingService.getProgressInBand(400, 2).done, 0);
    check("bar clamps at band end", LevelingService.getProgressInBand(2500, 3).done, 1000);
    check("bar at 0", LevelingService.getProgress(0).done, 0);
    check("bar at win", LevelingService.getProgress(2000).done, 1000);
  }, W8);

  h.perf("LevelingService.getLevel", (i) => LevelingService.getLevel(i % 2100), 200000);
}

module.exports = { run };
