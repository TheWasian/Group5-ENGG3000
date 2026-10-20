// frontend metrics for data/testing
const frontendMetrics = {
    pageLoadTime: null,
    moleRenderTimes: [],
    whackResponseTimes: [],
    levelTransitionTimes: [],
    fpsSamples: [],

    normalWhackResponseTimes: [],
    frozenWhackResponseTimes: [],
    goldenWhackResponseTimes: [],
    freezeDurations: [],
    goldenLifetimeSamples: [],

    goldenHits: 0,
    frozenHits: 0
};

let lastFrameTime = performance.now();
let fpsUpdateTime = performance.now();
let fpsFrameCount = 0;


// measure frames per sec, frontend metric data
function measureFPS(currentTime) {
    fpsFrameCount++;

    const elapsed = currentTime - fpsUpdateTime;

    if (elapsed >= 1000) {
        const fps = (fpsFrameCount * 1000) / elapsed;

        frontendMetrics.fpsSamples.push(fps);

        const fpsDisplay = document.getElementById("fps");

        if (fpsDisplay) {
            fpsDisplay.textContent = fps.toFixed(1);
        }

        fpsFrameCount = 0;
        fpsUpdateTime = currentTime;
    }

    lastFrameTime = currentTime;

    requestAnimationFrame(measureFPS);
}

requestAnimationFrame(measureFPS);


// frontend metric, load time for page
window.addEventListener("load", () => {
    frontendMetrics.pageLoadTime = performance.now();

    const loadTimeDisplay = document.getElementById("load-time");

    if (loadTimeDisplay) {
        loadTimeDisplay.textContent =
            frontendMetrics.pageLoadTime.toFixed(2);
    }
});


const holes = Array.from(document.querySelectorAll(".hole"));
const scoreDisplay = document.getElementById("score");
const levelDisplay = document.getElementById("level");
const timerDisplay = document.getElementById("timer");
const startBtn = document.getElementById("start-button");
const winScreen = document.getElementById("win-screen");
const loseScreen = document.getElementById("lose-screen");
const restartButtons = document.querySelectorAll(".restart-button");
const statusMessage = document.getElementById("status-message");
const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");
const livesDisplay = document.getElementById("lives");
const damageIndicator = document.getElementById("damage-indicator"); //changed to show the damage (red screen)
const streakPanel = document.getElementById("streak-panel");
const streakCountDisplay = document.getElementById("streak-count");
const comboBadge = document.getElementById("combo-badge");
const comboMultiplierDisplay = document.getElementById("combo-multiplier");
const streakNextDisplay = document.getElementById("streak-next");
const streakProgressBar = document.getElementById("streak-progress-bar");
const comboAnnouncement = document.getElementById("combo-announcement");



const POINTS_PER_MOLE = 50;
const GOLDEN_POINTS = 200;
const GOLDEN_CHANCE = 0.15;
const FROZEN_CHANCE = 0.15;
const FREEZE_SECONDS = 5;
const GOLDEN_LIFETIME_FACTOR = 0.75;
let SPAWN_INTERVAL = 3500;
let MOLE_LIFETIME = 3200; 
const ROUND_TIME = 300;
const LEVEL_2_AT = 500;
const LEVEL_3_AT = 1000;
const WIN_AT = 2000;
const STARTING_LIVES = 3;

let score = 0;
let level = 1;
let timeLeft = ROUND_TIME;
let lives = STARTING_LIVES;
let gameActive = false;
let moleTimer = null;
let moleLifetimeTimer = null;
let countdownTimer = null;
let activeHole = null;
let lastHole = null;
let activeMoleType = "normal"; 
let freezeTicksLeft = 0;
let moleSpawnTime = null;
let comboAnnouncementTimer = null;
let hitStreak = 0;
let streakMultiplier = 1;
startBtn.addEventListener("click", startGame);
restartButtons.forEach((button) => button.addEventListener("click", startGame));

function getStreakMultiplier(streak){
  if(streak >= 15) return 4;
  if(streak >= 10) return 3;
  if(streak >= 5) return 2;
  return 1;
}

function updateStreakDisplay(){
  streakCountDisplay.textContent = hitStreak;
  comboMultiplierDisplay.textContent = `×${streakMultiplier}`;

  streakPanel.classList.toggle("combo-active", hitStreak >= 3);
  streakPanel.classList.toggle("combo-fire", hitStreak >= 5);

  comboBadge.classList.remove(
    "combo-tier-2",
    "combo-tier-3",
    "combo-tier-4"
  );

  if(streakMultiplier >= 2){
    comboBadge.classList.add(`combo-tier-${streakMultiplier}`);
  }

  const milestones = [5, 10, 15, 20];
  const nextMilestone = milestones.find((milestone) => milestone > hitStreak);

  if(nextMilestone != undefined){
    const previousMilestone = milestones
      .filter((milestone) => milestone <= hitStreak)
      .pop() ?? 0;

    const progress =
      ((hitStreak - previousMilestone) /
        (nextMilestone - previousMilestone)) * 100;

    streakProgressBar.style.width = `${progress}%`;

    const nextMultiplier = getStreakMultiplier(nextMilestone);

    streakNextDisplay.textContent =
      `Next: ${nextMilestone} hits → ×${nextMultiplier}`;
  } else {
    streakProgressBar.style.width = "100%";
    streakNextDisplay.textContent = "20 hits! You're unstoppable!";
  }
  }function showComboAnnouncement(message, lost = false) {
  clearTimeout(comboAnnouncementTimer);

  comboAnnouncement.classList.remove("show", "streak-lost");
  void comboAnnouncement.offsetWidth;

  comboAnnouncement.textContent = message;

  if (lost) {
    comboAnnouncement.classList.add("streak-lost");
  }

  comboAnnouncement.classList.add("show");

  comboAnnouncementTimer = setTimeout(() => {
    comboAnnouncement.classList.remove("show", "streak-lost");
  }, 1200);
}

function registerSuccessfulHit(basePoints) {
  const previousMultiplier = streakMultiplier;

  hitStreak++;
  streakMultiplier = getStreakMultiplier(hitStreak);

  updateStreakDisplay();

  if (hitStreak === 20) {
    showComboAnnouncement("UNSTOPPABLE!");
  } else if (streakMultiplier > previousMultiplier) {
    showComboAnnouncement(`×${streakMultiplier} COMBO!`);

    streakPanel.classList.remove("combo-tier-up");
    comboBadge.classList.remove("combo-pulse");

    void streakPanel.offsetWidth;
    void comboBadge.offsetWidth;

    streakPanel.classList.add("combo-tier-up");
    comboBadge.classList.add("combo-pulse");
  } else if (hitStreak === 3) {
    showComboAnnouncement("3 HIT STREAK!");
  }
  
  if (STREAK_MILESTONES.includes(hitStreak)) {
    playStreakFill();
  }
  const awardedPoints = basePoints * streakMultiplier;

  addScore(awardedPoints);

  return awardedPoints;
}

function resetStreak() {
  clearStreakFill();
  hitStreak = 0;
  streakMultiplier = 1;

  streakPanel.classList.remove(
    "combo-active",
    "combo-tier-up",
    "streak-break"
  );

  comboBadge.classList.remove("combo-pulse");

  clearTimeout(comboAnnouncementTimer);
  comboAnnouncement.classList.remove("show", "streak-lost");

  updateStreakDisplay();
}

function breakStreak() {
  if (hitStreak === 0) return;
  clearStreakFill();

  hitStreak = 0;
  streakMultiplier = 1;

  updateStreakDisplay();

  streakPanel.classList.remove("combo-tier-up");
  streakPanel.classList.remove("streak-break");
  void streakPanel.offsetWidth;
  streakPanel.classList.add("streak-break");

  showComboAnnouncement("STREAK LOST!", true);

  setTimeout(() => {
    streakPanel.classList.remove("streak-break");
  }, 400);
}

const streakTrack = document.querySelector(".streak-progress-track");
const STREAK_MILESTONES = [5, 10, 15, 20];
let streakFillTimer = null;

function clearStreakFill() {
  clearTimeout(streakFillTimer);
  streakProgressBar.classList.remove("bar-fire");
  streakTrack.classList.remove("track-fire");
  streakPanel.classList.remove("streak-burst");
}

function playStreakFill() {
  clearStreakFill();
  streakProgressBar.style.width = "100%";
  void streakPanel.offsetWidth;
  streakProgressBar.classList.add("bar-fire");
  streakTrack.classList.add("track-fire");
  streakPanel.classList.add("streak-burst");

  streakFillTimer = setTimeout(() => {
    clearStreakFill();
    updateStreakDisplay();
  }, 800);
}

function startGame() {
  score = 0;
  level = 1;
  timeLeft = ROUND_TIME;
  lives = STARTING_LIVES;
  gameActive = true;
  lastHole = null;
  
  clearFreeze();
  clearGameTimers();
  resetStreak();
  clearMole();
  resetRewards();
  updateScore();
  updateLevel();
  updateLives();
  updateProgress();
  timerDisplay.textContent = timeLeft;
  statusMessage.textContent = "Move to the physical hole containing the mole!";
  startBtn.textContent = "RESTART GAME";

  winScreen.classList.add("hidden");
  loseScreen.classList.add("hidden");

  SensorService.notifyGameStart();

  countdownTimer = setInterval(tick, 1000);
  moleTimer = setInterval(spawnMole, SPAWN_INTERVAL);
  spawnMole();
}

function clearGameTimers() {
  clearInterval(moleTimer);
  clearInterval(countdownTimer);
  clearTimeout(moleLifetimeTimer);
  moleTimer = null;
  countdownTimer = null;
  moleLifetimeTimer = null;
}
function clearFreeze() {
  freezeTicksLeft = 0;
  timerDisplay.classList.remove("frozen");
}

function freezeTimer(seconds) {
   const freezeStart = performance.now();
  freezeTicksLeft += seconds;
  timerDisplay.classList.add("frozen");
  setTimeout(() => {
    const freezeDuration = performance.now() - freezeStart;

    frontendMetrics.freezeDurations.push(freezeDuration);

    const display =
      document.getElementById("freeze-duration");

    if (display) {
      display.textContent = freezeDuration.toFixed(2);
    }
  }, seconds * 1000);
}

function tick() {
   if (freezeTicksLeft > 0) {
    freezeTicksLeft--;

    if (freezeTicksLeft <= 0) {
      timerDisplay.classList.remove("frozen");
      statusMessage.textContent = "Freeze ended! Keep whacking!";
    }

    return;
  }
  timeLeft--;
  timerDisplay.textContent = timeLeft;
  if (timeLeft <= 0) endGame(false);
}

function clearMole() {
  if (activeHole) {
    activeHole.classList.remove("active");
    
    const moleWrapper = activeHole.querySelector(".mole");
    if (moleWrapper) moleWrapper.classList.remove("has-bomb", "has-golden", "has-frozen");
  }
  activeHole = null;
  activeMoleType = "normal";
  clearTimeout(moleLifetimeTimer);
  moleLifetimeTimer = null;
}

function spawnMole() {
  if (!gameActive) return;

  clearMole();
  const availableHoles = holes.filter((hole) => hole !== lastHole);
  activeHole = availableHoles[Math.floor(Math.random() * availableHoles.length)];
  lastHole = activeHole;
  
  // bomb spawn rate
 let bombChance = 0;

if (level === 1) {
  bombChance = 0.10;
} else if (level === 2) {
  bombChance = 0.25;
} else if (level === 3) {
  bombChance = 0.40;
}

const random = Math.random();

if (random < bombChance) {
  activeMoleType = "bomb";
} else if (random < bombChance + GOLDEN_CHANCE) {
  activeMoleType = "golden";
} else if (
  random < bombChance + GOLDEN_CHANCE + FROZEN_CHANCE
) {
  activeMoleType = "frozen";
} else {
  activeMoleType = "normal";
}

const moleWrapper = activeHole.querySelector(".mole");

if (moleWrapper) {
  moleWrapper.classList.remove(
    "has-bomb",
    "has-golden",
    "has-frozen"
  );

  // for diff types of moles
  if (activeMoleType === "bomb") {
    moleWrapper.classList.add("has-bomb");
  }

  if (activeMoleType === "golden") {
    moleWrapper.classList.add("has-golden");
  }

  if (activeMoleType === "frozen") {
    moleWrapper.classList.add("has-frozen");
  }
  
}
const renderStart = performance.now();

activeHole.classList.add("active");

moleSpawnTime = performance.now();

requestAnimationFrame(() => {
    const renderTime = performance.now() - renderStart;

    frontendMetrics.moleRenderTimes.push(renderTime);

    const display = document.getElementById("mole-render-time");

    if (display) {
        display.textContent = renderTime.toFixed(2);
    }
});

 const moleLifetime =
  activeMoleType === "golden"
    ? MOLE_LIFETIME * GOLDEN_LIFETIME_FACTOR
    : MOLE_LIFETIME;

moleLifetimeTimer = setTimeout(() => {
   const expiredType = activeMoleType;

  if (moleSpawnTime !== null) {
    const lifetime = performance.now() - moleSpawnTime;

    if (expiredType === "golden") {
      frontendMetrics.goldenLifetimeSamples.push(lifetime);

      const display =
        document.getElementById("golden-lifetime");

      if (display) {
        display.textContent = lifetime.toFixed(2);
      }
    }
  }

  clearMole();

  if (expiredType === "normal") {
    breakStreak();
    loseLife("Too slow! You missed the mole!");
  }

}, moleLifetime);

}

function whackHole(holeIndex, source = "mouse") {
  if (!gameActive || !Number.isInteger(holeIndex)) return false;
   const whackStart = performance.now();

  const hole = holes.find((item) => Number(item.dataset.hole) === holeIndex);
  if (!hole) return false;

  if (source === "sensor") {
    hole.classList.remove("sensor-hit");
    void hole.offsetWidth;
    hole.classList.add("sensor-hit");
  }

  if (hole !== activeHole || !hole.classList.contains("active")) {
    statusMessage.textContent =
      source === "sensor"
        ? `Hole ${holeIndex + 1}: no mole there.`
        : "Try the hole with the mole.";
    return false;
  }

  const hitType = activeMoleType;
  clearMole();
  
  if (hitType === "bomb") {
  breakStreak();
  loseLife("Boom! You hit a bomb!");

} else if (hitType === "golden") {
    if (moleSpawnTime !== null) {
    const lifetime = performance.now() - moleSpawnTime;

    frontendMetrics.goldenLifetimeSamples.push(lifetime);

    const lifetimeDisplay =
      document.getElementById("golden-lifetime");

    if (lifetimeDisplay) {
      lifetimeDisplay.textContent =
        lifetime.toFixed(2);
    }
  }
  
   const pts = registerSuccessfulHit(GOLDEN_POINTS);

  statusMessage.textContent =
    `Golden Mole! +${GOLDEN_POINTS} points!`;

} else if (hitType === "frozen") {

  const pts = registerSuccessfulHit(POINTS_PER_MOLE);

  freezeTimer(FREEZE_SECONDS);

  statusMessage.textContent =
    `Frozen Mole! +${POINTS_PER_MOLE} points! Timer frozen for ${FREEZE_SECONDS}s! `;

} else {
  const pts = registerSuccessfulHit(POINTS_PER_MOLE);

   statusMessage.textContent =
    `Whack! +${pts} points`;
}
  
  const responseTime = performance.now() - whackStart;

  frontendMetrics.whackResponseTimes.push(responseTime);
  const whackDisplay =
  document.getElementById("whack-response-time");

if (whackDisplay) {
  whackDisplay.textContent = responseTime.toFixed(2);
}
 if (hitType === "frozen") {

  frontendMetrics.frozenWhackResponseTimes.push(responseTime);
  frontendMetrics.frozenHits++;

  const display =
    document.getElementById("frozen-response-time");

  if (display) {
    display.textContent = responseTime.toFixed(2);
  }

  const countDisplay =
    document.getElementById("frozen-hit-count");

  if (countDisplay) {
    countDisplay.textContent =
      `${frontendMetrics.frozenHits}/10`;
  }

} else if (hitType === "golden") {

  frontendMetrics.goldenWhackResponseTimes.push(responseTime);
  frontendMetrics.goldenHits++;

  const display =
    document.getElementById("golden-response-time");

  if (display) {
    display.textContent = responseTime.toFixed(2);
  }

  const countDisplay =
    document.getElementById("golden-hit-count");

  if (countDisplay) {
    countDisplay.textContent =
      `${frontendMetrics.goldenHits}/10`;
  }

} else if (hitType === "normal") {

  frontendMetrics.normalWhackResponseTimes.push(responseTime);

  const display =
    document.getElementById("normal-response-time");

  if (display) {
    display.textContent = responseTime.toFixed(2);
  }
}
}
function addScore(points) {
  score += points;
  updateScore();
  checkLevel();

  scoreDisplay.classList.remove("score-pulse");
  void scoreDisplay.offsetWidth;
  scoreDisplay.classList.add("score-pulse");
}

function updateScore() {
  scoreDisplay.textContent = score;
}

function updateLevel() {
  levelDisplay.textContent = level;
  const transitionStart = performance.now();
    if(level === 1){
      SPAWN_INTERVAL = 3500;
      MOLE_LIFETIME = 3200;
      GameView.setEnvironment("grassland");
    }

    if (level === 2){
      SPAWN_INTERVAL = 2200;
      MOLE_LIFETIME = 1800;
      GameView.setEnvironment("freezing");
  }

    if (level === 3){
      SPAWN_INTERVAL = 1400;
      MOLE_LIFETIME = 1100;
      GameView.setEnvironment("fire");
  }
  requestAnimationFrame(() => {
    const transitionTime =
      performance.now() - transitionStart;

    frontendMetrics.levelTransitionTimes.push(transitionTime);

    const display =
      document.getElementById("level-transition-time");

    if (display) {
      display.textContent =
        transitionTime.toFixed(2);
    }
  });

  if (gameActive) {
    clearInterval(moleTimer);
    moleTimer = setInterval(spawnMole, SPAWN_INTERVAL);
  }
}

function updateLives() {
  livesDisplay.textContent = lives;
}

function loseLife(messagePrefix = "Missed!") {
  lives--;
  updateLives();
  damageIndicator.classList.remove("damage-flash");
  damageIndicator.getBoundingClientRect();
  damageIndicator.classList.add("damage-flash");
  statusMessage.textContent = `${messagePrefix} ${lives} ${lives === 1 ? "life" : "lives"} left.`;
  if (lives <= 0) endGame(false);
}

function updateProgress() {
  let progressStart;
  let progressEnd;
  let levelLabel;

  if (level === 1) {
    progressStart = 0;
    progressEnd = LEVEL_2_AT;
    levelLabel = "Level 2";
  } else if (level === 2) {
    progressStart = LEVEL_2_AT;
    progressEnd = LEVEL_3_AT;
    levelLabel = "Level 3";
  } else {
    progressStart = LEVEL_3_AT;
    progressEnd = WIN_AT;
    levelLabel = "Win";
  }

  const levelProgress = Math.max(
    0,
    Math.min(score - progressStart, progressEnd - progressStart),
  );
  const levelRange = progressEnd - progressStart;
  progressBar.style.width = `${(levelProgress / levelRange) * 100}%`;
  progressText.textContent = `${levelProgress} / ${levelRange} (${levelLabel})`;
}

function checkLevel() {
  unlockReward("bronze-reward", 50);
  unlockReward("silver-reward", 250);
  unlockReward("gold-reward", 500);

  if (score >= WIN_AT) {
    endGame(true);
    return;
  }
  
  var previousLevel = level;

  if (score >= LEVEL_3_AT) level = 3;
  else if (score >= LEVEL_2_AT) level = 2;
  else level = 1;
  
  if(level !== previousLevel){
  updateLevel();
  }

  updateProgress();
}


function unlockReward(id, threshold) {
  if (score < threshold) return;
  const reward = document.getElementById(id);
  if (!reward.classList.contains("unlocked")) {
    reward.classList.remove("locked");
    reward.classList.add("unlocked");
  }
}

function resetRewards() {
  document.querySelectorAll(".reward").forEach((reward) => {
    reward.classList.remove("unlocked");
    reward.classList.add("locked");
  });
}

function endGame(won) {
  gameActive = false;
  clearGameTimers();
  clearMole();
  statusMessage.textContent = won ? "You won!" : "Game over.";

  if (won) winScreen.classList.remove("hidden");
  else loseScreen.classList.remove("hidden");
}

// The current game and modular backend share the same sensor adapter.
SensorService.init();
SensorService.onHit = (holeIndex, kind) => {
  if (kind === "occupancy" && (!gameActive || !activeHole || Number(activeHole.dataset.hole) !== holeIndex)) return;
  whackHole(holeIndex, "sensor");
};

holes.forEach((hole) => {
  hole.addEventListener("click", () =>
    whackHole(Number(hole.dataset.hole), "mouse"),
  );
});

SensorService.start();


