// StreakService tests: multiplier curve, milestones, cap, reset.
// Method: direct calls with fixed streak values, then one integration check
// that documents the current pipeline (D7: streaks are NOT applied).
const h = require("./helpers");
const { check, checkClose } = h;
const SECTION = "StreakService";
const W5 = { week: 5 };
const W8 = { week: 8 };

async function run() {
  console.log("== StreakService ==");
  await h.test(SECTION, "streak starts at x1, then +0.01 per hit", () => {
    let r = StreakService.hit(0);
    check("hit 1 streak", r.streak, 1);
    check("hit 1 = x1 (no bonus yet)", r.multiplier, 1);
    r = StreakService.hit(1);
    check("hit 2 streak", r.streak, 2);
    checkClose("hit 2 = x1.01", r.multiplier, 1.01, 0.001);
    r = StreakService.hit(2);
    checkClose("hit 3 = x1.02", r.multiplier, 1.02, 0.001);
    check("no milestone early", StreakService.hit(2).milestone, null);
    check("milestone at 10", StreakService.hit(9).milestone, "Heating Up!");
    check("milestone at 25", StreakService.hit(24).milestone, "On Fire!");
    check("cap at 3x", StreakService.multiplierFor(500), 3);
    check("streak 0 is x1", StreakService.multiplierFor(0), 1);
    const miss = StreakService.miss();
    check("miss resets", miss.streak + miss.multiplier, 1);
  }, W5);

  await h.test(SECTION, "streak applied during play", () => {
    // Expected PARTIAL (D7): the module maths above is correct, but the
    // GameService pipeline scores flat and never tracks a streak — the live
    // game has no streak display either.
    GameService.start();
    for (let i = 0; i < 5; i++) {
      GameService.spawnMole("normal", i % 6);
      GameService.whack(GameService.game.mole.hole, "mouse");
    }
    check("5 hits scored flat", GameService.game.score, 250);
    if (GameService.game.streak !== 5) {
      h.partial(
        "streak tracked during play",
        "streaks are not tracked during play: services score flat (+50/+200), the live game has no streak display, and StreakService stays a standalone module"
      );
    }
    check("multiplier stays at 1", GameService.game.multiplier, 1);
    GameService.game.playing = false;
  }, W8);

  h.perf("StreakService.hit", (i) => StreakService.hit(i % 15), 200000);
}

module.exports = { run };
