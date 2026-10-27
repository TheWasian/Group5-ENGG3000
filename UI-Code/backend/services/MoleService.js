// Mole types, points, spawn odds and skins.
var MoleService = {
  MOLE_POINTS: { normal: 50, bomb: 0, golden: 200, frozen: 50 },
  GOLDEN_LIFETIME_FACTOR: 0.75, // golden mole lifespan
  FREEZE_SECONDS: 5, // frozen mole duration

  // Spawn odds; roll order is bomb, golden, frozen, normal
  SPAWN_CHANCES: {
    1: { bomb: 0.1, golden: 0.15, frozen: 0.08, normal: 0.67 },
    2: { bomb: 0.25, golden: 0.15, frozen: 0.08, normal: 0.52 },
    3: { bomb: 0.4, golden: 0.15, frozen: 0.08, normal: 0.37 },
  },

  // Pick a mole type for this level using the level's spawn odds.
  pickMoleType: function (level, rng) {
    var rand = rng || Math.random;
    var chances = LevelingService.levelingChance(level);
    var roll = rand();
    var edge = 0;
    for (var type in chances) {
      if (!chances.hasOwnProperty(type)) continue;
      edge += chances[type];
      if (roll < edge) return type;
    }
    return "normal";
  },

  // Level skin: golden/frozen keep their look, otherwise ice at L2, fire at L3
  moleVariant: function (type, level) {
    if (type === "golden") return "has-golden";
    if (type === "frozen") return "has-frozen";
    if (level === 2 && type === "normal") return "has-normal-ice";
    if (level === 2 && type === "bomb") return "has-bomb-ice";
    if (level === 3 && type === "normal") return "has-normal-fire";
    if (level === 3 && type === "bomb") return "has-bomb-fire";
    return "";
  },

  // How long this mole stays up (golden lives 25% less)
  moleLifetime: function (type, staysUp) {
    if (type === "golden") return Math.round(staysUp * this.GOLDEN_LIFETIME_FACTOR);
    return staysUp;
  },
};
