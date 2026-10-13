//Main Mole Logic (Like a Mole class)
var MoleService = {
  POINTS: { normal: 50, bomb: 0, golden: 200, frozen: 50 },

  GOLDEN_LIFETIME_FACTOR: 0.75, // golden moles only stay up 75% as long
  FREEZE_SECONDS: 5, // frozen mole freezes the countdown for 5s

  // Spawn odds per level, progresses as it goes (must sum to 1 per level)
  SPAWN_CHANCES: {
    1: { bomb: 0.1, golden: 0.15, frozen: 0.08, normal: 0.67 },
    2: { bomb: 0.25, golden: 0.15, frozen: 0.08, normal: 0.52 },
    3: { bomb: 0.4, golden: 0.15, frozen: 0.08, normal: 0.37 },
  },

  //Picking mole type logic based on the spawn chances
  pickType: function (level, rng) {
    var rand = rng || Math.random;
    var chances = this.SPAWN_CHANCES[level] || this.SPAWN_CHANCES[1];
    var roll = rand();
    var edge = 0;
    for (var type in chances) {
      if (!chances.hasOwnProperty(type)) continue;
      edge += chances[type];
      if (roll < edge) return type;
    }
    return "normal";
  },

  //Level Themed skins: 
  variantFor: function (type, level) {
    if (type === "golden") return "has-golden";
    if (type === "frozen") return "has-frozen";
    if (level === 2 && type === "normal") return "has-normal-ice";
    if (level === 2 && type === "bomb") return "has-bomb-ice";
    if (level === 3 && type === "normal") return "has-normal-fire";
    if (level === 3 && type === "bomb") return "has-bomb-fire";
    return "";
  },

  // How long this mole stays up (golden lives 25% less)
  lifetimeFor: function (type, staysUp) {
    if (type === "golden") return Math.round(staysUp * this.GOLDEN_LIFETIME_FACTOR);
    return staysUp;
  },
};
