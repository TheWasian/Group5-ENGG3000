//handles the overall process now
var GameView = {
  pendingSwings: 0,
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
    var marker = document.getElementById("player-marker");
    if (marker) {
      var self = this;
      var finishSwing = function (event) {
        if (event.animationName !== "hammerSwing") return;
        marker.classList.remove("swinging");
        if (event.type === "animationend" && self.pendingSwings > 0) {
          self.pendingSwings -= 1;
          self.swingHammer();
        } else {
          self.pendingSwings = 0;
        }
      };
      marker.addEventListener("animationend", finishSwing);
      marker.addEventListener("animationcancel", finishSwing);
    }
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
    if (typeof window !== "undefined" && window.MoleBoard3D) {
      window.MoleBoard3D.show(holeIndex, moleType, variantClass || "");
    }
  },

  hideAllMoles: function () {
    for (var i = 0; i < this.holes.length; i++) {
      this.holes[i].classList.remove("active");
    }
    if (typeof window !== "undefined" && window.MoleBoard3D) {
      window.MoleBoard3D.hideAll();
    }
  },

  // Flash when the sensor registers a hit
  flashSensorHit: function (holeIndex) {
    var hole = this.holes[holeIndex];
    if (!hole) return;
    hole.classList.remove("sensor-hit");
    hole.offsetWidth;
    hole.classList.add("sensor-hit");
    if (typeof window !== "undefined" && window.MoleBoard3D) {
      window.MoleBoard3D.flash(holeIndex);
    }
  },

  // One short swing on a hit (hammer swing)
  swingHammer: function () {
    var marker = document.getElementById("player-marker");
    if (!marker || !marker.classList || marker.classList.contains("hidden")) return;
    // If another hit comes in, finish this swing then do the next one
    if (marker.classList.contains("swinging")) {
      this.pendingSwings += 1;
      return;
    }
    void marker.offsetWidth; // Lets the next swing start properly
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
    if (typeof window !== "undefined" && window.MoleBoard3D) {
      window.MoleBoard3D.setEnvironment(envName || "grassland");
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
