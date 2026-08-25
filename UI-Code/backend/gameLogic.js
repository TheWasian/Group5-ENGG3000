const holes = Array.from(document.querySelectorAll(".hole"));
const scoreDisplay = document.getElementById("score");
const levelDisplay = document.getElementById("level");
const timerDisplay = document.getElementById("timer");
const startBtn = document.getElementById("start-button");
const winScreen = document.getElementById("win-screen");
const loseScreen = document.getElementById("lose-screen");
const restartButtons = document.querySelectorAll(".restart-button");
const statusMessage = document.getElementById("status-message");
const sensorStatus = document.getElementById("sensor-status");
const playerMarker = document.getElementById("player-marker");
const debugSensorDisplays = [
  document.getElementById("debug-sensor-1"),
  document.getElementById("debug-sensor-2"),
];
const debugLastEvent = document.getElementById("debug-last-event");
const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");
const livesDisplay = document.getElementById("lives");
const damageIndicator = document.getElementById("damage-indicator"); //changed to show the damage (red screen)

const POINTS_PER_MOLE = 50;
let SPAWN_INTERVAL = 5000;
let MOLE_LIFETIME = 4950;
const ROUND_TIME = 300;
const LEVEL_2_AT = 500;
const LEVEL_3_AT = 1000;
const WIN_AT = 2000;
const STARTING_LIVES = 3;

// When this page is opened from the ESP32, a relative URL is enough. When it
// is opened locally or from a development server, requests go to the ESP32 AP.
const SENSOR_API_BASE =
  window.location.hostname === "192.168.4.1" ? "" : "http://192.168.4.1";
const SENSOR_POLL_INTERVAL = 75;
const MAX_EVENT_AGE_MS = 1000;

let score = 0;
let level = 1;
let timeLeft = ROUND_TIME;
let lives = STARTING_LIVES;
let gameActive = false;
let moleTimer = null;
let moleLifetimeTimer = null;
let countdownTimer = null;
let activeHole = null;
let lastSensorEventId = null;
let sensorPollTimer = null;
let sensorRequestInProgress = false;

startBtn.addEventListener("click", startGame);
restartButtons.forEach((button) => button.addEventListener("click", startGame));

function startGame() {
  score = 0;
  level = 1;
  timeLeft = ROUND_TIME;
  lives = STARTING_LIVES;
  gameActive = true;

  clearGameTimers();
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

  // Re-arm both ESP32 lanes, including if a player is already in range.
  fetch(`${SENSOR_API_BASE}/api/game/start`, { method: "POST" }).catch(() => {
    // Mouse input remains usable when developing without the ESP32.
  });

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

function tick() {
  timeLeft--;
  timerDisplay.textContent = timeLeft;
  if (timeLeft <= 0) endGame(false);
}

function clearMole() {
  if (activeHole) activeHole.classList.remove("active");
  activeHole = null;
  clearTimeout(moleLifetimeTimer);
  moleLifetimeTimer = null;
}

function spawnMole() {
  if (!gameActive) return;

  const previousHole = activeHole;
  clearMole();
  const availableHoles = holes.filter((hole) => hole !== previousHole);
  activeHole =
    availableHoles[Math.floor(Math.random() * availableHoles.length)];
  activeHole.classList.add("active");

  moleLifetimeTimer = setTimeout(() => {
    if (!gameActive || !activeHole) return;
    clearMole();
    loseLife();
  }, MOLE_LIFETIME);
}

function whackHole(holeIndex, source = "mouse") {
  if (!gameActive || !Number.isInteger(holeIndex)) return false;

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

  clearMole();
  addScore(POINTS_PER_MOLE);
  statusMessage.textContent = `Whack! +${POINTS_PER_MOLE} points`;
  return true;
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
    if (level === 2){
      SPAWN_INTERVAL = 4000;
      MOLE_LIFETIME = 3950;
  }

    if (level === 3){
      SPAWN_INTERVAL = 3000;
      MOLE_LIFETIME = 2950;
  }
}

function updateLives() {
  livesDisplay.textContent = lives;
}

function loseLife() {
  lives--;
  updateLives();
  damageIndicator.classList.remove("damage-flash");
  damageIndicator.getBoundingClientRect();
  damageIndicator.classList.add("damage-flash");
  statusMessage.textContent = `Missed! ${lives} ${lives === 1 ? "life" : "lives"} left.`;
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

  if (score >= LEVEL_3_AT) level = 3;
  else if (score >= LEVEL_2_AT) level = 2;
  else level = 1;

  updateLevel();
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

function getPlayerPosition(data) {
  if (!Array.isArray(data?.sensors)) return null;

  const validSensorIndexes = data.sensors
    .map((sensor, index) =>
      sensor.valid && Number.isInteger(Number(sensor.hole)) ? index : -1,
    )
    .filter((index) => index >= 0);

  if (validSensorIndexes.length === 0) return null;

  // If both beams see the player, prefer the sensor that most recently
  // produced a movement event. Otherwise use the only valid sensor.
  const latestSensorIndex = Number(data.sensor) - 1;
  const sensorIndex = validSensorIndexes.includes(latestSensorIndex)
    ? latestSensorIndex
    : validSensorIndexes[0];
  const holeIndex = Number(data.sensors[sensorIndex].hole);

  if (
    !Number.isInteger(holeIndex) ||
    holeIndex < 0 ||
    holeIndex >= holes.length
  ) {
    return null;
  }

  return {
    sensorIndex,
    holeIndex,
    distanceCm: data.sensors[sensorIndex].distance_cm,
  };
}

function displayPlayerPosition(data) {
  const position = getPlayerPosition(data);

  if (!position) {
    playerMarker.classList.add("hidden");
    playerMarker.removeAttribute("title");
    return null;
  }

  const targetHole = holes.find(
    (hole) => Number(hole.dataset.hole) === position.holeIndex,
  );
  targetHole.appendChild(playerMarker);
  playerMarker.classList.remove("hidden");
  playerMarker.title = `Player: hole ${position.holeIndex + 1}, sensor ${position.sensorIndex + 1}`;
  return position;
}

function updateDebugPanel(data = null) {
  debugSensorDisplays.forEach((display, index) => {
    const sensor = data?.sensors?.[index];
    if (!sensor) {
      display.textContent = "Disconnected";
      return;
    }

    const distance =
      sensor.distance_cm === null ? "No echo" : `Avg ${sensor.distance_cm} cm`;
    const hole =
      sensor.valid && Number(sensor.hole) >= 0
        ? `Hole ${Number(sensor.hole) + 1}`
        : "No player";
    display.textContent = `${distance} | ${hole}`;
  });

  if (!data) {
    debugLastEvent.textContent = "Disconnected";
  } else if (Number(data.event_id) === 0) {
    debugLastEvent.textContent = "None";
  } else {
    debugLastEvent.textContent = `#${data.event_id} | S${data.sensor} | Hole ${Number(data.hole) + 1} | ${data.distance_cm} cm`;
  }
}

function updateSensorStatus(connected, data = null) {
  sensorStatus.classList.toggle("connected", connected);
  sensorStatus.classList.toggle("disconnected", !connected);

  if (!connected) {
    playerMarker.classList.add("hidden");
    updateDebugPanel();
    sensorStatus.textContent =
      "Sensor controller: disconnected (mouse testing is available)";
    return;
  }

  updateDebugPanel(data);
  const playerPosition = displayPlayerPosition(data);
  const activeSensors = data.sensors
    .map((sensor, index) =>
      sensor.valid ? `S${index + 1}: ${sensor.distance_cm} cm` : null,
    )
    .filter(Boolean);
  sensorStatus.textContent = activeSensors.length
    ? `Player: ${playerPosition ? `hole ${playerPosition.holeIndex + 1}` : "position unknown"} — ${activeSensors.join(" | ")}`
    : "Sensor controller: connected — waiting for player";
}

async function pollSensors() {
  if (sensorRequestInProgress) return;
  sensorRequestInProgress = true;

  try {
    const response = await fetch(`${SENSOR_API_BASE}/api/hits`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Sensor HTTP ${response.status}`);
    const data = await response.json();
    updateSensorStatus(true, data);

    if (lastSensorEventId === null) {
      lastSensorEventId = data.event_id;
    } else if (data.event_id !== lastSensorEventId) {
      lastSensorEventId = data.event_id;
      if (data.event_age_ms <= MAX_EVENT_AGE_MS) {
        whackHole(Number(data.hole), "sensor");
      }
    }
  } catch (error) {
    updateSensorStatus(false);
  } finally {
    sensorRequestInProgress = false;
  }
}

function startSensorPolling() {
  clearInterval(sensorPollTimer);
  pollSensors();
  sensorPollTimer = setInterval(pollSensors, SENSOR_POLL_INTERVAL);
}

holes.forEach((hole) => {
  hole.addEventListener("click", () =>
    whackHole(Number(hole.dataset.hole), "mouse"),
  );
});

startSensorPolling();
