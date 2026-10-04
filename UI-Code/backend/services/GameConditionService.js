//Just a simple file used to check whether the player hit win or lose condition or if their still playing
var GameConditionService = {
  check: function (score, lives, timeLeft) {
    if (LevelingService.hasWon(score)) return "won";
    if (lives <= 0) return "lost";
    if (timeLeft <= 0) return "lost";
    return "playing";
  },
};
