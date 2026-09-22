//Streaks Logic
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
