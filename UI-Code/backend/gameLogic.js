const holes = document.querySelectorAll('.hole');
const scoreDisplay = document.getElementById('score');
const levelDisplay = document.getElementById('level');
const timerDisplay = document.getElementById('timer');
const startBtn = document.getElementById('start-button');
const winScreen = document.getElementById('win-screen');
const loseScreen = document.getElementById('lose-screen');

const statusMessage = document.getElementById('status-message');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const livesDisplay = document.getElementById('lives');

const POINTS_PER_MOLE = 50;
const SPAWN_INTERVAL = 800;
const MOLE_LIFETIME = 700;
const ROUND_TIME = 60;
const LEVEL_2_AT = 500;
const LEVEL_3_AT = 1000;
const WIN_AT = 2000;
const STARTING_LIVES = 3;

let score = 0;
let level = 1;
let timeLeft = ROUND_TIME;
let lives = STARTING_LIVES;
let gameActive = false;
let moleTimer;
let countdownTimer;

startBtn.addEventListener('click', startGame);

function startGame() {
    score = 0;
    level = 1;
    timeLeft = ROUND_TIME;
    lives = STARTING_LIVES;
    gameActive = true;

    clearInterval(moleTimer);
    clearInterval(countdownTimer);

    updateScore();
    updateLevel();
    updateLives();
    timerDisplay.textContent = timeLeft;
    startBtn.textContent = 'Restart';

    winScreen.classList.add('hidden');
    loseScreen.classList.add('hidden');
    holes.forEach(h => h.classList.remove('active'));

    countdownTimer = setInterval(tick, 1000);
    moleTimer = setInterval(spawnMole, SPAWN_INTERVAL);
}

function tick() {
    timeLeft--;
    timerDisplay.textContent = timeLeft;
    if (timeLeft <= 0) {
        endGame(false);
    }
}

function spawnMole() {
    if (!gameActive) return;

    const hole = holes[Math.floor(Math.random() * holes.length)];
    hole.classList.add('active');

    setTimeout(() => {
        if (hole.classList.contains('active')) {
            hole.classList.remove('active');
            loseLife();
        }
    }, MOLE_LIFETIME);
}

function addScore(points) {
    score += points;
    updateScore();
    checkLevel();
}

function updateScore() {
    scoreDisplay.textContent = score;
}

function updateLevel() {
    levelDisplay.textContent = level;
}

function updateLives() {
    livesDisplay.textContent = lives;
}

function loseLife() {
    lives--;
    updateLives();
    if (lives <= 0) {
        endGame(false);
    }
}

//levels system
function checkLevel() {
    let progressStart, progressEnd, levelLabel;
    
    if (level === 1) {
        progressStart = 0;
        progressEnd = LEVEL_2_AT;
        levelLabel = 'Level 2';
    } else if (level === 2) {
        progressStart = LEVEL_2_AT;
        progressEnd = LEVEL_3_AT;
        levelLabel = 'Level 3';
    } else {
        progressStart = LEVEL_3_AT;
        progressEnd = WIN_AT;
        levelLabel = 'Win';
    }

    // calculate progress bar
    const levelProgress = Math.min(score - progressStart, progressEnd - progressStart);
    const levelRange = progressEnd - progressStart;
    const progressPercent = (levelProgress / levelRange) * 100;
    
    progressBar.style.width = progressPercent + '%';
    progressText.textContent = levelProgress + ' / ' + levelRange + ' (' + levelLabel + ')';

    //check and unlock rewards
    if (score >= 50 && !document.getElementById('bronze-reward').classList.contains('unlocked')) {
        document.getElementById('bronze-reward').classList.remove('locked');
        document.getElementById('bronze-reward').classList.add('unlocked');
    }
    if (score >= 250 && !document.getElementById('silver-reward').classList.contains('unlocked')) {
        document.getElementById('silver-reward').classList.remove('locked');
        document.getElementById('silver-reward').classList.add('unlocked');
    }
    if (score >= 500 && !document.getElementById('gold-reward').classList.contains('unlocked')) {
        document.getElementById('gold-reward').classList.remove('locked');
        document.getElementById('gold-reward').classList.add('unlocked');
    }

    if (score >= WIN_AT) {
        endGame(true);
    } else if (score >= LEVEL_3_AT && level < 3) {
        level = 3;
        updateLevel();
    } else if (score >= LEVEL_2_AT && level < 2) {
        level = 2;
        updateLevel();
    }
}

//Currently limiting to 60 seconds (timer) and 2K point
function endGame(won) {
    gameActive = false;
    clearInterval(moleTimer);
    clearInterval(countdownTimer);
    holes.forEach(h => h.classList.remove('active'));

    if (won) {
        winScreen.classList.remove('hidden');
    } else {
        loseScreen.classList.remove('hidden');
    }
}

//Will need to change the even from click to every time you step on box but good enough for now
holes.forEach(hole => {
    hole.addEventListener('click', function () {
        if (!gameActive) return;
        if (hole.classList.contains('active')) {
            hole.classList.remove('active');
            addScore(POINTS_PER_MOLE);
        }
    });
});