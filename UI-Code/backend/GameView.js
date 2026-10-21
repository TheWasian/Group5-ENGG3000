//handles the overall process now
var GameView = {
  init: function () {
    this.holes = Array.from(document.querySelectorAll(".hole"));
    this.score = document.getElementById("score");
    this.level = document.getElementById("level");
    this.timer = document.getElementById("timer");
    this.lives = document.getElementById("lives");
    this.startBtn = document.getElementById("start-button");
    this.winScreen = document.getElementById("win-screen");
    this.loseScreen = document.getElementById("lose-screen");
    this.restartButtons = document.querySelectorAll(".restart-button");
    this.message = document.getElementById("status-message");
    this.progressBar = document.getElementById("progress-bar");
    this.progressText = document.getElementById("progress-text");
    this.damage = document.getElementById("damage-indicator");
    this.moles = this.holes.map(function (hole) {
      return hole.querySelector(".mole");
    });
  },

//Fixed a bit of the glow not working
  showMole: function (holeIndex, moleType, variantClass) {
    this.hideAllMoles();
    var hole = this.holes[holeIndex];
    if (!hole) return;
    hole.classList.add("active");
    var mole = this.moles[holeIndex];
    //the bomb mole now shows the bomb 
    var bombClass = moleType === "bomb" ? " has-bomb" : "";
    mole.className =
      "mole mole-" + moleType + bombClass + (variantClass ? " " + variantClass : "");
  },

  hideAllMoles: function () {
    for (var i = 0; i < this.holes.length; i++) {
      this.holes[i].classList.remove("active");
    }
  },

  // Flash when the sensor registers a hit
  flashSensorHit: function (holeIndex) {
    var hole = this.holes[holeIndex];
    if (!hole) return;
    hole.classList.remove("sensor-hit");
    hole.offsetWidth;
    hole.classList.add("sensor-hit");
  },

  // One short swing on a hit (hammer swing)
  swingHammer: function () {
    var marker = document.getElementById("player-marker");
    if (!marker || !marker.classList || marker.classList.contains("hidden")) return;
    marker.classList.remove("swinging");
    void marker.offsetWidth; // restart the animation
    marker.classList.add("swinging");
  },

  setScore: function (score) {
    this.score.textContent = score;
    this.score.classList.remove("score-pulse");
    this.score.offsetWidth;
    this.score.classList.add("score-pulse");
  },

  setLevel: function (level) {
    this.level.textContent = level;
  },

  // Frozen mole time buff
  setTimer: function (timeLeft, frozen) {
    this.timer.textContent = timeLeft;
    if (this.timer.classList) this.timer.classList.toggle("frozen", !!frozen);
  },

  setLives: function (lives) {
    this.lives.textContent = lives;
  },

  setProgress: function (done, total, label) {
    this.progressBar.style.width = (done / total) * 100 + "%";
    this.progressText.textContent = done + " / " + total + " (" + label + ")";
  },

  say: function (text) {
    this.message.textContent = text;
  },

  flashDamage: function () {
    this.damage.classList.remove("damage-flash");
    this.damage.getBoundingClientRect(); //restart the animation
    this.damage.classList.add("damage-flash");
  },

  // Level theme (freezing, fire, toxic, void)
  setEnvironment: function (envName) {
    document.body.classList.remove(
      "env-grassland", "env-freezing", "env-fire", "env-toxic", "env-void"
    );
    if (envName && envName !== "grassland") {
      document.body.classList.add("env-" + envName);
    }
  },

  unlockReward: function (id) {
    var reward = document.getElementById(id);
    if (reward && !reward.classList.contains("unlocked")) {
      reward.classList.remove("locked");
      reward.classList.add("unlocked");
    }
  },

  resetRewards: function () {
    document.querySelectorAll(".reward").forEach(function (reward) {
      reward.classList.remove("unlocked");
      reward.classList.add("locked");
    });
  },

  showWinScreen: function () {
    this.winScreen.classList.remove("hidden");
  },

  showLoseScreen: function () {
    this.loseScreen.classList.remove("hidden");
  },

  hideEndScreens: function () {
    this.winScreen.classList.add("hidden");
    this.loseScreen.classList.add("hidden");
  },

  setStartButtonText: function (text) {
    this.startBtn.textContent = text;
  },
};
