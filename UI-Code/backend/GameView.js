// Draws everything on screen. One file owns this: no service touches HTML itself.
// Everything visible goes through here, so swapping renderers only replaces this file.
// Contract: keep these function names and the game logic never changes.
var GameView = {
  // Every `has-*` skin a mole can wear (level variants + special moles).
  MOLE_CLASSES: [
    "has-bomb",
    "has-golden",
    "has-frozen",
    "has-normal-ice",
    "has-bomb-ice",
    "has-normal-fire",
    "has-bomb-fire",
  ],

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

  // Show a mole (normal, bomb, golden, frozen) with an optional level skin.
  // variantClass comes from MoleService.variantFor(): has-golden, has-frozen,
  // has-normal-ice, has-bomb-ice, has-normal-fire, has-bomb-fire, or "".
  showMole: function (holeIndex, moleType, variantClass) {
    this.hideAllMoles();
    var hole = this.holes[holeIndex];
    if (!hole) return;
    hole.classList.add("active");
    // Drop the old mole colour, paint the new mole (temp solution until we have each one designed as a different image)
    // Type class is also the hook for frontend per-type rules (e.g. .mole-speedy .css-mole).
    var mole = this.moles[holeIndex];
    mole.className =
      "mole mole-" + moleType + (variantClass ? " " + variantClass : "");
    // Emoji faces for now will need to be replaced later
    var faces = {
      speedy: "⚡",
      dark: "🌑",
      toxic: "☠️",
      golden: "🌟",
      bomb: "💥",
      frozen: "❄️",
    };
    var face = faces[moleType] || "";
    // New CSS-art markup: the face goes inside .css-mole, because text placed
    // directly in .mole is clipped (fixed height + overflow). The art's own
    // pieces are moved after the face, so nothing is lost.
    var art = mole.querySelector ? mole.querySelector(".css-mole") : null;
    if (art && art.tagName) {
      var kept = [];
      var kids = art.childNodes || [];
      for (var k = 0; k < kids.length; k++) {
        if (kids[k].tagName) kept.push(kids[k]);
      }
      art.textContent = face;
      if (art.appendChild) {
        for (var j = 0; j < kept.length; j++) art.appendChild(kept[j]);
      }
    } else {
      // Old <img> markup (or no art): face on the .mole, art put back.
      var img = mole.querySelector ? mole.querySelector("img") : null;
      mole.textContent = face;
      if (img && img.tagName && mole.insertBefore) mole.insertBefore(img, mole.firstChild);
    }
  },

  hideAllMoles: function () {
    for (var i = 0; i < this.holes.length; i++) {
      this.holes[i].classList.remove("active");
      // A stale skin must never survive a hide (otherwise the next mole
      // inherits the previous one's ice/fire/special class).
      var mole = this.moles && this.moles[i];
      if (mole && mole.classList) {
        for (var c = 0; c < this.MOLE_CLASSES.length; c++) {
          mole.classList.remove(this.MOLE_CLASSES[c]);
        }
      }
    }
  },

  // Flash when the sensor registers a hit.
  flashSensorHit: function (holeIndex) {
    var hole = this.holes[holeIndex];
    if (!hole) return;
    hole.classList.remove("sensor-hit");
    hole.offsetWidth;
    hole.classList.add("sensor-hit");
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

  // frozen = the countdown is paused: shows the same frozen state as the
  // live game (timerDisplay.classList.toggle("frozen")).
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
  // Level 1: the plain body gradient IS grassland
  // NOTE: current CSS has no per-level rules yet, so these classes are hooks for the frontend
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
