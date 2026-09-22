//Main Mole Logic (Like a Mole class)
var MoleService = {
  POINTS: { normal: 10, speedy: 20, dark: -15, toxic: 30, golden: 50 },

  SPEEDY_UPTIME: 0.6, // speedy stays up 60% longer for them to hit it
  TOXIC_TIME_COST: 5, // toxic hit costs 5 seconds of clock

  // Spawn odds per level, progresses as it goes
  SPAWN_CHANCES: {
    1: { normal: 1 },
    2: { normal: 0.7, speedy: 0.2, dark: 0.1 },
    3: { normal: 0.55, speedy: 0.2, dark: 0.15, toxic: 0.1 },
    4: { normal: 0.45, speedy: 0.2, dark: 0.15, toxic: 0.15, golden: 0.05 },
    5: { normal: 0.35, speedy: 0.2, dark: 0.2, toxic: 0.15, golden: 0.1 },
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
};
