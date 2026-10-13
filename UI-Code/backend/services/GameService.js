//main Orchestrator for the services, while calling the HTML through GameView
// Rules are an exact copy of the live game (gameLogic.js): flat points,
// no streak multiplier (see StreakService.js), 3 levels, win at 2000.

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
      maxLevel: 1, // level never drops
      timeLeft: this.ROUND_TIME,
      lives: this.START_LIVES,
      streak: 0, // tracked only for the standalone StreakService module
      multiplier: 1, // scoring is flat: multiplier is never applied (D7)
      freezeTicksLeft: 0, // countdown ticks still to burn before the clock runs
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
    GameView.setTimer(g.timeLeft, false);
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

  // One game second passes. While frozen the tick is consumed by the freeze
  // and the clock does not drop (same as gameLogic.js tick()).
  tickSecond: function () {
    var g = this.game;
    if (!g || !g.playing) return;
    if (g.freezeTicksLeft > 0) {
      g.freezeTicksLeft -= 1;
      GameView.setTimer(g.timeLeft, g.freezeTicksLeft > 0);
      if (g.freezeTicksLeft <= 0) GameView.say("Freeze ended! Keep whacking!");
      return;
    }
    g.timeLeft -= 1;
    GameView.setTimer(g.timeLeft, false);
    this.checkEnd();
  },

  // Freeze the countdown for N ticks
  freezeTimer: function (seconds) {
    var g = this.game;
    if (!g) return;
    g.freezeTicksLeft += seconds;
    GameView.setTimer(g.timeLeft, true);
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

  // Spawn one mole at a time, every few milliseconds
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
    GameView.showMole(hole, type, MoleService.variantFor(type, g.level));

    //Delayed response = mole escapes and user gets damage
    var staysUp = MoleService.lifetimeFor(
      type,
      LevelingService.getSettings(g.level).moleStaysUp
    );
    clearTimeout(this.moleLifetimeTimer);
    var self = this;
    this.moleLifetimeTimer = setTimeout(function () {
      self.onMoleMissed();
    }, staysUp);
  },

  // A free hole, preferably not the same one twice in a row
  freeHole: function (lastHole, holeCount) {
    if (holeCount > 1) {
      var hole = Math.floor(Math.random() * holeCount);
      if (hole === lastHole) hole = (hole + 1) % holeCount;
      return hole;
    }
    return 0;
  },

  // Mole escaped: only a normal mole costs a life (live behaviour).
  onMoleMissed: function () {
    var g = this.game;
    if (!g || !g.playing || !g.mole) return { escaped: false };
    var type = g.mole.type;
    g.mole = null;
    GameView.hideAllMoles();
    clearTimeout(this.moleLifetimeTimer);
    if (type === "normal") this.loseLife("Too slow! You missed the mole!");
    return { escaped: true, type: type };
  },

  // Esp32 Recognising a Whacked mole

  whack: function (holeIndex, source) {
    var g = this.game;
    if (!g || !g.playing || !Number.isInteger(holeIndex)) return { hit: false };
    source = source || "mouse";

    // Wrong hole (or nothing up): no damage, no streak reset
    if (!g.mole || g.mole.hole !== holeIndex) {
      GameView.say(source === "sensor" ? "Hole " + (holeIndex + 1) + ": no mole there." : "Try the hole with the mole.");
      return { hit: false };
    }

    var type = g.mole.type;
    g.mole = null;
    GameView.hideAllMoles();
    clearTimeout(this.moleLifetimeTimer);

    if (type === "bomb") return this.hitBomb();
    if (type === "golden") return this.hitGolden();
    if (type === "frozen") return this.hitFrozen();
    return this.hitNormal();
  },

  // Normal: +50 flat (no streak multiplier anywhere in the pipeline)
  hitNormal: function () {
    var g = this.game;
    var points = MoleService.POINTS.normal;
    g.score += points;
    GameView.say("Whack! +" + points + " points");
    GameView.setScore(g.score);
    this.applyLevel();
    this.refreshProgress();
    this.checkEnd();
    return { hit: true, points: points };
  },

  // Bomb: -1 life, 0 points
  hitBomb: function () {
    this.loseLife("Boom! You hit a bomb!");
    return { hit: true, bomb: true, points: 0 };
  },

  // Golden: +200 flat
  hitGolden: function () {
    var g = this.game;
    var points = MoleService.POINTS.golden;
    g.score += points;
    GameView.say("Golden Mole! +" + points + " points! ");
    GameView.setScore(g.score);
    this.applyLevel();
    this.refreshProgress();
    this.checkEnd();
    return { hit: true, points: points };
  },

  // Frozen: +50 flat and the countdown freezes for 5s
  hitFrozen: function () {
    var g = this.game;
    var points = MoleService.POINTS.frozen;
    g.score += points;
    GameView.say(
      "Frozen Mole! +" + points + " points! Timer frozen for " + MoleService.FREEZE_SECONDS + "s! "
    );
    GameView.setScore(g.score);
    this.freezeTimer(MoleService.FREEZE_SECONDS);
    this.applyLevel();
    this.refreshProgress();
    this.checkEnd();
    return { hit: true, points: points, freezeTicks: g.freezeTicksLeft };
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

  //Progress bar: pinned to the highest level reached
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
    GameView.say(prefix + " " + g.lives + " " + (g.lives === 1 ? "life" : "lives") + " left.");
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
