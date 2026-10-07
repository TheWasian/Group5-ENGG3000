//Leveling System
// 3 levels, matching the live game: L1 0-499, L2 500-999, L3 1000-1999, win 2000.
var LevelingService = {
  MAX_LEVEL: 3,
  WIN_AT: 2000,

  // Score -> level (1-3)
  getLevel: function (score) {
    if (score >= 1000) return 3;
    if (score >= 500) return 2;
    return 1;
  },

  // Lowest score still counting as this level (drains can't push below it)
  minScoreForLevel: function (level) {
    var table = { 1: 0, 2: 500, 3: 1000 };
    return table[level] || 0;
  },

  //win condition checker
  hasWon: function (score) {
    return score >= this.WIN_AT;
  },

  // Spawn interval / mole lifetime per level (same numbers as gameLogic.js)
  getSettings: function (level) {
    var table = {
      1: { spawnEvery: 3500, moleStaysUp: 3200 },
      2: { spawnEvery: 2200, moleStaysUp: 1800 },
      3: { spawnEvery: 1400, moleStaysUp: 1100 },
    };
    return table[level] || table[1];
  },

  // Score and progression towards the next level
  bandFor: function (level) {
    var bands = {
      1: { from: 0, to: 500, label: "Level 2" },
      2: { from: 500, to: 1000, label: "Level 3" },
      3: { from: 1000, to: 2000, label: "Win" },
    };
    return bands[level] || bands[1];
  },

  // Progress bar
  getProgress: function (score) {
    return this.getProgressInBand(score, this.getLevel(score));
  },

  //used for effects (higher the level the higher the effect)
  getProgressInBand: function (score, level) {
    var band = this.bandFor(level);
    var done = score - band.from;
    if (done < 0) done = 0; // penalised below the band: pin at start
    if (done > band.to - band.from) done = band.to - band.from;
    return { done: done, total: band.to - band.from, label: band.label };
  },
};
