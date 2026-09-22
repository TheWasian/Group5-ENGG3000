//Leveling System
var LevelingService = {
  MAX_LEVEL: 5,
  WIN_AT: 2000,

  // Score -> level (1-5)
  getLevel: function (score) {
    if (score >= 800) return 5;
    if (score >= 600) return 4;
    if (score >= 400) return 3;
    if (score >= 200) return 2;
    return 1;
  },

  // Lowest score still counting as this level (drains debuffs can't push below it)
  minScoreForLevel: function (level) {
    var table = { 1: 0, 2: 200, 3: 400, 4: 600, 5: 800 };
    return table[level] || 0;
  },

  //win condition checker
  hasWon: function (score) {
    return score >= this.WIN_AT;
  },

  // Mole speed per level (This is based on the rough draft on the google docs)
  getSettings: function (level) {
    var table = {
      1: { spawnEvery: 5500, moleStaysUp: 5450 },
      2: { spawnEvery: 4500, moleStaysUp: 4450 },
      3: { spawnEvery: 3500, moleStaysUp: 3450 },
      4: { spawnEvery: 3000, moleStaysUp: 2950 },
      5: { spawnEvery: 2000, moleStaysUp: 1950 },
    };
    return table[level] || table[1];
  },

  // Score and progression towards the next level
  bandFor: function (level) {
    var bands = {
      1: { from: 0, to: 200, label: "Level 2" },
      2: { from: 200, to: 400, label: "Level 3" },
      3: { from: 400, to: 600, label: "Level 4" },
      4: { from: 600, to: 800, label: "Level 5" },
      5: { from: 800, to: 2000, label: "Win" },
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
