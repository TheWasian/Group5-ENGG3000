//Streaks Logic
// STANDALONE / NOT WIRED IN (decision D7): the live game has no streak
// display and scores flat (+50 / +200), so GameService does not call this
// module. It is kept as an optional, unit-tested feature module — see
// tests/test-streak.js, which reports a PARTIAL for "streak applied during
// play" until a decision is made to reintroduce streaks.
var StreakService = {
  MAX_MULTIPLIER: 3,

  // Streak 0 (no hits yet) is also x1
  multiplierFor: function (streak) {
    if (streak <= 1) return 1;
    var m = 1 + (streak - 1) * 0.01;
    if (m > this.MAX_MULTIPLIER) m = this.MAX_MULTIPLIER;
    return Math.round(m * 100) / 100;
  },

  // If hit then a new streak + multiplier + milestone message
  hit: function (streak) {
    var next = streak + 1;
    var milestones = { 10: "Heating Up!", 25: "On Fire!", 50: "Unstoppable!", 100: "LEGENDARY!" };
    var milestone = null;
    if (milestones[next]) milestone = milestones[next];
    return { streak: next, multiplier: this.multiplierFor(next), milestone: milestone };
  },

  // Miss means streak back to zero
  miss: function () {
    return { streak: 0, multiplier: 1 };
  },
};
