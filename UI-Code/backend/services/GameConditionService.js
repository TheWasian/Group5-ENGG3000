//Just checking the player hasn't won yet
var GameConditionService = {
  checkGameCondition: function (score, lives, timeLeft) {
    if (LevelingService.levelingHasWon(score)) return "won";
    if (lives <= 0) return "lost";
    if (timeLeft <= 0) return "lost";
    return "playing";
  },
};
