//main Orchestrator for the services, while calling the HTML through GameView

var GameService = {
  ROUND_TIME: 300,
  START_LIVES: 3,

  game: null,
  countdownTimer: null,
  moleTimer: null,
  moleLifetimeTimer: null,

  // default game state
  newGame: function () {
    return {
      score: 0,
      level: 1,
      maxLevel: 1, // level never drops, even when points are drained
      timeLeft: this.ROUND_TIME,
      lives: this.START_LIVES,
      streak: 0,
      multiplier: 1,
      mole: null, // mole class has (mole and type of mole) and if no mole shows up it is null
      playing: false,
    };
  },



//main game starting logic
  start: function () {
    this.game = this.newGame();
    this.game.playing = true;
    var g = this.game;

    this.clearTimers();
    GameView.hideAllMoles();
    GameView.resetRewards();
    GameView.setScore(0);
    GameView.setLevel(1);
    GameView.setLives(g.lives);
    GameView.setTimer(g.timeLeft);
    GameView.setEnvironment(EnvironmentService.themeFor(1));
    this.refreshProgress();
    GameView.say("Move to the physical hole containing the mole!");
    GameView.setStartButtonText("RESTART GAME");
    GameView.hideEndScreens();

    //this function ensures the mole spawn is done within this file while mole file has the actual type of moles
    var self = this;
    this.countdownTimer = setInterval(function () {
      self.tickSecond();
    }, 1000);
    this.spawnLoop();
  },

  // One game second passes
  tickSecond: function () {
    var g = this.game;
    if (!g || !g.playing) return;
    g.timeLeft -= 1;
    GameView.setTimer(g.timeLeft);
    this.checkEnd();
  },

  clearTimers: function () {
    clearInterval(this.countdownTimer);
    clearInterval(this.moleTimer);
    clearTimeout(this.moleLifetimeTimer);
    this.countdownTimer = null;
    this.moleTimer = null;
    this.moleLifetimeTimer = null;
  },

  // Mole logic:

  // Spawn one mole at a time, every few milliseconds (Still need to iron out what the best time is)
  spawnLoop: function () {
    clearInterval(this.moleTimer);
    var wait = LevelingService.getSettings(this.game.level).spawnEvery;
    var self = this;
    this.moleTimer = setInterval(function () {
      if (self.game.playing) self.spawnMole();
    }, wait);
    this.spawnMole();
  },

  //This is used to emulate mole spawning (do not remove it)
  spawnMole: function (forcedType, forcedHole) {
    var g = this.game;
    if (!g || !g.playing) return;
    var holeCount = GameView.holes.length;

    //if not used for testing it frees the holes
    var hole = forcedHole;
    if (hole === undefined) {
      var lastHole = -1;
      if (g.mole) lastHole = g.mole.hole;
      hole = this.freeHole(lastHole, holeCount);
    }
    // if not used for testing then it is meant to be a bit random
    var type = forcedType;
    if (!type) type = MoleService.pickType(g.level);

    g.mole = { hole: hole, type: type };
    GameView.showMole(hole, type);

    //Delayed response = mole escapes and user gets damage
    var staysUp = LevelingService.getSettings(g.level).moleStaysUp;
    if (type === "speedy") staysUp = Math.round(staysUp * MoleService.SPEEDY_UPTIME);
    clearTimeout(this.moleLifetimeTimer);
    var self = this;
    this.moleLifetimeTimer = setTimeout(function () {
      self.onMoleMissed();
    }, staysUp);
  },

  // A free hole, preferably not the same one twice in a row (will make it percentage based soon)
  freeHole: function (lastHole, holeCount) {
    if (holeCount > 1) {
      var hole = Math.floor(Math.random() * holeCount);
      if (hole === lastHole) hole = (hole + 1) % holeCount;
      return hole;
    }
    return 0;
  },

  // Mole escaped meaning streak resets, lose a life
  onMoleMissed: function () {
    var g = this.game;
    if (!g || !g.playing || !g.mole) return;
    g.mole = null;
    GameView.hideAllMoles();
    var reset = StreakService.miss();
    g.streak = reset.streak;
    g.multiplier = reset.multiplier;
    this.loseLife("Missed! ");
  },

  // Esp32 Recognising a Whacked mole

  whack: function (holeIndex, source) {
    var g = this.game;
    if (!g || !g.playing || !Number.isInteger(holeIndex)) return { hit: false };
    source = source || "mouse";

    // Wrong hole (or nothing up) then streak resets only if a mole was up
    if (!g.mole || g.mole.hole !== holeIndex) {
      if (g.mole) {
        var reset = StreakService.miss();
        g.streak = reset.streak;
        g.multiplier = reset.multiplier;
      }
      GameView.say(source === "sensor" ? "Hole " + (holeIndex + 1) + ": no mole there." : "Try the hole with the mole.");
      return { hit: false };
    }

    var type = g.mole.type;
    g.mole = null;
    GameView.hideAllMoles();
    clearTimeout(this.moleLifetimeTimer);

    if (type === "dark") return this.hitDark();
    if (type === "toxic") return this.hitToxic();
    return this.hitScoring(type);
  },

  // Scoring hit (normal/speedy/golden) then base points x streak multiplier
  hitScoring: function (type) {
    var g = this.game;
    var base = MoleService.POINTS[type] || MoleService.POINTS.normal;
    var hit = StreakService.hit(g.streak);
    g.streak = hit.streak;
    g.multiplier = hit.multiplier;
    var points = Math.round(base * hit.multiplier);
    g.score += points;

    var msg = "Whack! +" + points + " points";
    if (hit.multiplier > 1) msg += " (x" + hit.multiplier + " streak!)";
    if (hit.milestone) msg += " " + hit.milestone;
    GameView.say(msg);
    GameView.setScore(g.score);

    this.applyLevel();
    this.refreshProgress();
    this.checkEnd();
    return { hit: true, points: points };
  },

  // Dark: -15 points (never below 0), streak breaks
  hitDark: function () {
    var g = this.game;
    var loss = 15;
    if (loss > g.score) loss = g.score;
    g.score -= loss;
    var reset = StreakService.miss();
    g.streak = reset.streak;
    g.multiplier = reset.multiplier;
    GameView.setScore(g.score);
    GameView.say("Dark mole! -" + loss + " points.");
    this.refreshProgress();
    this.checkEnd();
    return { hit: true, dark: loss };
  },

  // Toxic: +30 x streak, but costs 5 seconds of clock
  hitToxic: function () {
    var g = this.game;
    var hit = StreakService.hit(g.streak);
    g.streak = hit.streak;
    g.multiplier = hit.multiplier;
    var points = Math.round(MoleService.POINTS.toxic * hit.multiplier);
    g.score += points;
    g.timeLeft -= MoleService.TOXIC_TIME_COST;
    if (g.timeLeft < 0) g.timeLeft = 0;
    GameView.setScore(g.score);
    GameView.setTimer(g.timeLeft);
    GameView.say("Toxic! +" + points + " points, -" + MoleService.TOXIC_TIME_COST + "s.");

    this.applyLevel();
    this.refreshProgress();
    this.checkEnd();
    return { hit: true, points: points };
  },

  // Leveling system
  applyLevel: function () {
    var g = this.game;
    var earned = LevelingService.getLevel(g.score);
    if (earned > g.maxLevel) {
      g.maxLevel = earned;
      g.level = earned;
      GameView.setLevel(earned);
      GameView.setEnvironment(EnvironmentService.themeFor(earned));
      GameView.say("Level " + earned + "! (" + EnvironmentService.themeFor(earned) + ")");
      this.spawnLoop(); // faster moles at higher levels
    }
    if (g.score >= 50) GameView.unlockReward("bronze-reward");
    if (g.score >= 250) GameView.unlockReward("silver-reward");
    if (g.score >= 500) GameView.unlockReward("gold-reward");
  },

  //Losing points is based on your level and never send you back
  refreshProgress: function () {
    var p = LevelingService.getProgressInBand(this.game.score, this.game.maxLevel);
    GameView.setProgress(p.done, p.total, p.label);
  },

  //lose life system
  loseLife: function (prefix) {
    var g = this.game;
    g.lives -= 1;
    GameView.setLives(g.lives);
    GameView.flashDamage();
    GameView.say(prefix + g.lives + (g.lives === 1 ? " life" : " lives") + " left.");
    this.checkEnd();
  },

  //end system
  checkEnd: function () {
    var g = this.game;
    var result = GameConditionService.check(g.score, g.lives, g.timeLeft);
    if (result === "playing") return result;
    g.playing = false;
    this.clearTimers();
    GameView.hideAllMoles();
    // Record best score; frontend draws it later.
    var record = HighScoreService.submit(g.score);
    g.best = record.best;
    g.isNewBest = record.isNewBest;
    if (result === "won") {
      GameView.say("You won!" + (record.isNewBest ? " New best: " + record.best + "!" : ""));
      GameView.showWinScreen();
    } else {
      GameView.say("Game over." + (record.isNewBest ? " New best: " + record.best + "!" : ""));
      GameView.showLoseScreen();
    }
    return result;
  },
};
