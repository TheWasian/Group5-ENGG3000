// MoleService tests: legend tables + spawn distribution + variant skins.
// Method: direct table checks, then a seeded simulation (30k picks)
// that must land within tolerance of the spec rates.
const h = require("./helpers");
const { check, checkClose } = h;
const SECTION = "MoleService";
const W6 = { week: 6 };
const W8 = { week: 8 };

async function run() {
  console.log("== MoleService ==");
  await h.test(SECTION, "legend tables (points + effects)", () => {
    check("normal +50", MoleService.POINTS.normal, 50);
    check("bomb 0", MoleService.POINTS.bomb, 0);
    check("golden +200", MoleService.POINTS.golden, 200);
    check("frozen +50", MoleService.POINTS.frozen, 50);
    check("golden lifetime x0.75", MoleService.GOLDEN_LIFETIME_FACTOR, 0.75);
    check("freeze 5s", MoleService.FREEZE_SECONDS, 5);
    check("no speedy", MoleService.POINTS.speedy, undefined);
    check("no dark", MoleService.POINTS.dark, undefined);
    check("no toxic", MoleService.POINTS.toxic, undefined);
    check("L1 bomb 10%", MoleService.SPAWN_CHANCES[1].bomb, 0.1);
    check("L2 bomb 25%", MoleService.SPAWN_CHANCES[2].bomb, 0.25);
    check("L3 bomb 40%", MoleService.SPAWN_CHANCES[3].bomb, 0.4);
    check("golden 15% every level", MoleService.SPAWN_CHANCES[3].golden, 0.15);
    check("frozen 8% every level", MoleService.SPAWN_CHANCES[3].frozen, 0.08);
    // Every level's odds add up to 1.
    for (let lvl = 1; lvl <= 3; lvl++) {
      let total = 0;
      const c = MoleService.SPAWN_CHANCES[lvl];
      for (const t in c) total += c[t];
      checkClose("L" + lvl + " odds sum to 1", total, 1, 0.0001);
    }
  }, W6);

  await h.test(SECTION, "spawn distribution accuracy (30k picks, seeded)", () => {
    function rates(level, n) {
      const rng = h.seededRandom(42);
      const counts = { normal: 0, bomb: 0, golden: 0, frozen: 0 };
      for (let i = 0; i < n; i++) counts[MoleService.pickType(level, rng)]++;
      const r = {};
      for (const t in counts) r[t] = counts[t] / n;
      return r;
    }
    const l1 = rates(1, 30000);
    checkClose("L1 bomb ~10%", l1.bomb, 0.1, 0.012);
    checkClose("L1 golden ~15%", l1.golden, 0.15, 0.015);
    checkClose("L1 frozen ~8%", l1.frozen, 0.08, 0.012);
    checkClose("L1 normal ~67%", l1.normal, 0.67, 0.015);

    const l2 = rates(2, 30000);
    checkClose("L2 bomb ~25%", l2.bomb, 0.25, 0.015);
    const l3 = rates(3, 30000);
    checkClose("L3 bomb ~40%", l3.bomb, 0.4, 0.018);
    checkClose("L3 normal ~37%", l3.normal, 0.37, 0.018);
    // an unknown level falls back to the L1 table
    check("unknown level -> normal family", ["normal", "bomb", "golden", "frozen"].indexOf(MoleService.pickType(99, h.seededRandom(7))) !== -1, true);
  }, W6);

  await h.test(SECTION, "variant class per level (ice at L2, fire at L3)", () => {
    check("L1 normal has no variant", MoleService.variantFor("normal", 1), "");
    check("L1 bomb has no variant", MoleService.variantFor("bomb", 1), "");
    check("L2 normal is ice", MoleService.variantFor("normal", 2), "has-normal-ice");
    check("L2 bomb is ice", MoleService.variantFor("bomb", 2), "has-bomb-ice");
    check("L3 normal is fire", MoleService.variantFor("normal", 3), "has-normal-fire");
    check("L3 bomb is fire", MoleService.variantFor("bomb", 3), "has-bomb-fire");
    check("golden keeps its own class", MoleService.variantFor("golden", 2), "has-golden");
    check("frozen keeps its own class", MoleService.variantFor("frozen", 3), "has-frozen");
  }, W8);

  await h.test(SECTION, "golden lifetime is 75% of the level lifetime", () => {
    check("L1 golden", MoleService.lifetimeFor("golden", 3200), 2400);
    check("L2 golden", MoleService.lifetimeFor("golden", 1800), 1350);
    check("L3 golden", MoleService.lifetimeFor("golden", 1100), 825);
    check("normal keeps full lifetime", MoleService.lifetimeFor("normal", 3200), 3200);
    check("bomb keeps full lifetime", MoleService.lifetimeFor("bomb", 3200), 3200);
    check("frozen keeps full lifetime", MoleService.lifetimeFor("frozen", 3200), 3200);
  }, W8);

  h.perf("MoleService.pickType", (i) => MoleService.pickType(1 + (i % 3)), 50000);
}

module.exports = { run };
