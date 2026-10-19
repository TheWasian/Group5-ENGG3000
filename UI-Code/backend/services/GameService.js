// GameService handles the rules and states and calls other services
var GameService = {
  ROUND_TIME: 300,
  START_LIVES: 3,

  game: null,
  countdownTimer: null,
  moleTimer: null,
  moleLifetimeTimer: null,
  freezeStartedAt: 0,
  moleSpawnedAt: 0,

  // Default game state
  newGameState: function () {
    return {
      score: 0,
      level: 1,
      maxLevel: 1, // level never drops
      timeLeft: this.ROUND_TIME,
      lives: this.START_LIVES,
      streak: 0, // tracked only for the standalone StreakService module
      multiplier: 1, // scoring is flat: multiplier is never applied (D7)
      freezeTicksLeft: 0, // countdown ticks still to burn before the clock runs
      mole: null, // { hole, type }, or null when no mole is up
      playing: false,
    };
  },

  // Start (or restart) a game
  startGame: function () {
    this.game = this.newGameState();
    this.game.playing = true;
    var g = this.game;

    this.clearGameTimers();
    GameView.hideAllMoles();
    GameView.resetRewards();
    GameView.setScore(0);
    GameView.setLevel(1);
    GameView.setLives(g.lives);
    GameView.setTimer(g.timeLeft, false);
    GameView.setEnvironment(EnvironmentService.environmentForLevel(1));
    this.renderProgress();
    GameView.say("Move to the physical hole containing the mole!");
    GameView.setStartButtonText("RESTART GAME");
    GameView.hideEndScreens();

    var self = this;
    this.countdownTimer = setInterval(function () {
      self.tickClock();
    }, 1000);
    this.startMoleSpawner();
  },

  // One game second; a freeze eats the tick
  tickClock: function () {
    var g = this.game;
    if (!g || !g.playing) return;
    if (g.freezeTicksLeft > 0) {
      g.freezeTicksLeft -= 1;
      GameView.setTimer(g.timeLeft, g.freezeTicksLeft > 0);
      if (g.freezeTicksLeft <= 0) {
        this.recordFreezeEnded();
        GameView.say("Freeze ended! Keep whacking!");
      }
      return;
    }
    g.timeLeft -= 1;
    GameView.setTimer(g.timeLeft, false);
    this.checkGameOver();
  },

  // Freeze the countdown (freeze mole)
  freezeClock: function (seconds) {
    var g = this.game;
    if (!g) return;
    g.freezeTicksLeft += seconds;
    this.freezeStartedAt = performance.now();
    GameView.setTimer(g.timeLeft, true);
  },

  // Report how long the clock stayed frozen (frontend metrics panel)
  recordFreezeEnded: function () {
    if (this.freezeStartedAt && typeof FrontendMetrics !== "undefined") {
      FrontendMetrics.recordFreeze(performance.now() - this.freezeStartedAt);
      this.freezeStartedAt = 0;
    }
  },

  clearGameTimers: function () {
    clearInterval(this.countdownTimer);
    clearInterval(this.moleTimer);
    clearTimeout(this.moleLifetimeTimer);
    this.countdownTimer = null;
    this.moleTimer = null;
    this.moleLifetimeTimer = null;
  },

  // Spawn one mole at a time, every levelingSpeed(level) milliseconds
  startMoleSpawner: function () {
    clearInterval(this.moleTimer);
    var wait = LevelingService.levelingSpeed(this.game.level);
    var self = this;
    this.moleTimer = setInterval(function () {
      if (self.game.playing) self.spawnMole();
    }, wait);
    this.spawnMole();
  },

  // Show one mole. forcedType/forcedHole are for tests; omit them for play.
  spawnMole: function (forcedType, forcedHole) {
    var g = this.game;
    if (!g || !g.playing) return;
    var holeCount = GameView.holes.length;

    var hole = forcedHole;
    if (hole === undefined) {
      var lastHole = -1;
      if (g.mole) lastHole = g.mole.hole;
      hole = this.pickFreeHole(lastHole, holeCount);
    }
    var type = forcedType;
    if (!type) type = MoleService.pickMoleType(g.level);

    g.mole = { hole: hole, type: type };
    this.moleSpawnedAt = performance.now();

    var renderStart = performance.now();
    GameView.showMole(hole, type, MoleService.moleVariant(type, g.level));
    if (typeof FrontendMetrics !== "undefined") {
      FrontendMetrics.recordMoleRender(performance.now() - renderStart);
    }

    // Escaped: only a normal mole costs a life
    var staysUp = MoleService.moleLifetime(
      type,
      LevelingService.levelingLifetime(g.level)
    );
    clearTimeout(this.moleLifetimeTimer);
    var self = this;
    this.moleLifetimeTimer = setTimeout(function () {
      self.moleEscaped();
    }, staysUp);
  },

  // A free hole, preferably not the same one twice in a row
  pickFreeHole: function (lastHole, holeCount) {
    if (holeCount > 1) {
      var hole = Math.floor(Math.random() * holeCount);
      if (hole === lastHole) hole = (hole + 1) % holeCount;
      return hole;
    }
    return 0;
  },

  // Mole escaped: only a normal mole costs a life (live behaviour)
  moleEscaped: function () {
    var g = this.game;
    if (!g || !g.playing || !g.mole) return { escaped: false };
    var type = g.mole.type;
    var lifetime = performance.now() - this.moleSpawnedAt;
    g.mole = null;
    GameView.hideAllMoles();
    clearTimeout(this.moleLifetimeTimer);
    if (type === "golden" && typeof FrontendMetrics !== "undefined") {
      FrontendMetrics.recordGoldenLifetime(lifetime);
    }
    if (type === "normal") this.loseLife("Too slow! You missed the mole!");
    return { escaped: true, type: type };
  },

  // Whack at a hole.
  whackHole: function (holeIndex, source) {
    var g = this.game;
    if (!g || !g.playing || !Number.isInteger(holeIndex)) return { hit: false };
    var started = performance.now();
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

    var result;
    if (type === "bomb") result = this.bombMole();
    else if (type === "golden") result = this.goldenMole();
    else if (type === "frozen") result = this.frozenMole();
    else result = this.normalMole();

    if (typeof FrontendMetrics !== "undefined") {
      FrontendMetrics.recordWhack(performance.now() - started, type);
    }
    return result;
  },

  // Normal mole: +50 flat (no streak multiplier anywhere in the pipeline)
  normalMole: function () {
    var g = this.game;
    var points = MoleService.MOLE_POINTS.normal;
    g.score += points;
    GameView.say("Whack! +" + points + " points");
    GameView.setScore(g.score);
    this.levelingApply();
    this.renderProgress();
    this.checkGameOver();
    return { hit: true, points: points };
  },

  // Bomb: -1 life, 0 points
  bombMole: function () {
    this.loseLife("Boom! You hit a bomb!");
    return { hit: true, bomb: true, points: 0 };
  },

  // Golden mole: +200 flat
  goldenMole: function () {
    var g = this.game;
    var points = MoleService.MOLE_POINTS.golden;
    g.score += points;
    GameView.say("Golden Mole! +" + points + " points! ");
    GameView.setScore(g.score);
    this.levelingApply();
    this.renderProgress();
    this.checkGameOver();
    return { hit: true, points: points };
  },

  // Frozen mole: +50 flat and the countdown freezes for 5s
  frozenMole: function () {
    var g = this.game;
    var points = MoleService.MOLE_POINTS.frozen;
    g.score += points;
    GameView.say(
      "Frozen Mole! +" + points + " points! Timer frozen for " + MoleService.FREEZE_SECONDS + "s! "
    );
    GameView.setScore(g.score);
    this.freezeClock(MoleService.FREEZE_SECONDS);
    this.levelingApply();
    this.renderProgress();
    this.checkGameOver();
    return { hit: true, points: points, freezeTicks: g.freezeTicksLeft };
  },

  // Score -> level, then speed + theme
  levelingApply: function () {
    var g = this.game;
    var started = performance.now();
    var earned = LevelingService.levelingLevelForScore(g.score);
    if (earned > g.maxLevel) {
      g.maxLevel = earned;
      g.level = earned;
      GameView.setLevel(earned);
      GameView.setEnvironment(EnvironmentService.environmentForLevel(earned));
      GameView.say("Level " + earned + "! (" + EnvironmentService.environmentForLevel(earned) + ")");
      this.startMoleSpawner(); // faster moles at higher levels
    }
    if (g.score >= 50) GameView.unlockReward("bronze-reward");
    if (g.score >= 250) GameView.unlockReward("silver-reward");
    if (g.score >= 500) GameView.unlockReward("gold-reward");
    if (typeof FrontendMetrics !== "undefined") {
      FrontendMetrics.recordLevelTransition(performance.now() - started);
    }
  },

  // Progress bar stays on the highest level
  renderProgress: function () {
    var p = LevelingService.levelingProgressInBand(this.game.score, this.game.maxLevel);
    GameView.setProgress(p.done, p.total, p.label);
  },

  // Lose a life
  loseLife: function (prefix) {
    var g = this.game;
    g.lives -= 1;
    GameView.setLives(g.lives);
    GameView.flashDamage();
    GameView.say(prefix + " " + g.lives + " " + (g.lives === 1 ? "life" : "lives") + " left.");
    this.checkGameOver();
  },

  // Win / lose / still playing
  checkGameOver: function () {
    var g = this.game;
    var result = GameConditionService.checkGameCondition(g.score, g.lives, g.timeLeft);
    if (result === "playing") return result;
    g.playing = false;
    this.clearGameTimers();
    GameView.hideAllMoles();
    // Record best score and frontend draws it later (leaderboard still not working yet)
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
