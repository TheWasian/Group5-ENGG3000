// Level  services handles: speed, lifetime, spawn odds and score bands
// Bands: L1 0-499, L2 500-999, L3 1000-1999, win at 2000
var LevelingService = {
  MAX_LEVEL: 3,
  WIN_AT: 2000,

  // Score -> level (1-3)
  levelingLevelForScore: function (score) {
    if (score >= 1000) return 3;
    if (score >= 500) return 2;
    return 1;
  },

  // Lowest score for this level
  levelingMinScore: function (level) {
    var table = { 1: 0, 2: 500, 3: 1000 };
    return table[level] || 0;
  },

  // Win condition
  levelingHasWon: function (score) {
    return score >= this.WIN_AT;
  },

  // Spawn interval (ms)
  levelingSpeed: function (level) {
    var table = { 1: 3800, 2: 3500, 3: 3100 };
    return table[level] || table[1];
  },

  // Mole lifetime (ms)
  levelingLifetime: function (level) {
    var table = { 1: 3800, 2: 3500, 3: 3100 };
    return table[level] || table[1];
  },

  // Spawn odds
  levelingChance: function (level) {
    return MoleService.SPAWN_CHANCES[level] || MoleService.SPAWN_CHANCES[1];
  },

  // Progress band
  levelingBand: function (level) {
    var bands = {
      1: { from: 0, to: 500, label: "Level 2" },
      2: { from: 500, to: 1000, label: "Level 3" },
      3: { from: 1000, to: 2000, label: "Win" },
    };
    return bands[level] || bands[1];
  },

  // Progress to next level
  levelingProgress: function (score) {
    return this.levelingProgressInBand(score, this.levelingLevelForScore(score));
  },

  // Progress in a fixed band
  levelingProgressInBand: function (score, level) {
    var band = this.levelingBand(level);
    var done = score - band.from;
    if (done < 0) done = 0;
    if (done > band.to - band.from) done = band.to - band.from;
    return { done: done, total: band.to - band.from, label: band.label };
  },
};
