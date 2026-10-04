//Score caching system
var HighScoreService = {
  KEY: "whackamole_best",

  // Best score logic
  get: function () {
    try {
      var raw = localStorage.getItem(this.KEY);
      var best = Number(raw);
      if (!Number.isFinite(best) || best < 0) return 0;
      return Math.floor(best);
    } catch (e) {
      return 0; // no storage then play without it
    }
  },

  // Offer a finished game's score, True = new record
  submit: function (score) {
    var best = this.get();
    if (score > best) {
      try {
        localStorage.setItem(this.KEY, String(Math.floor(score)));
      } catch (e) {
        // storage blocked: the record still counts for this session
      }
      return { best: Math.floor(score), isNewBest: true };
    }
    return { best: best, isNewBest: false };
  },
};
