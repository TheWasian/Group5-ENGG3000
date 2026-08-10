const holes = document.querySelectorAll('.hole');
const scoreDisplay = document.getElementById('score');
const levelDisplay = document.getElementById('level');
const timerDisplay = document.getElementById('timer');
const startBtn = document.getElementById('start-btn');
const winScreen = document.getElementById('win-screen');
const loseScreen = document.getElementById('lose-screen');

const POINTS_PER_MOLE = 50;
const SPAWN_INTERVAL = 700;
const MOLE_LIFETIME = 600;
const ROUND_TIME = 60;
const LEVEL_2_AT = 500;
const LEVEL_3_AT = 1000;
const WIN_AT = 2000;

let score = 0;
let level = 1;
let timeLeft = ROUND_TIME;
let gameActive = false;
let moleTimer;
let countdownTimer;

startBtn.addEventListener('click', startGame);

function startGame() {
    score = 0;
    level = 1;
    timeLeft = ROUND_TIME;
    gameActive = true;

    clearInterval(moleTimer);
    clearInterval(countdownTimer);

    updateScore();
    updateLevel();
    timerDisplay.textContent = timeLeft;
    startBtn.textContent = 'Restart';

    winScreen.classList.add('hidden');
    loseScreen.classList.add('hidden');
    holes.forEach(h => h.classList.remove('mole'));

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
    hole.classList.add('mole');

    setTimeout(() => {
        hole.classList.remove('mole');
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

//Simple leveling system, need to add speed increase and health
function checkLevel() {
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
    holes.forEach(h => h.classList.remove('mole'));

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
        if (hole.classList.contains('mole')) {
            hole.classList.remove('mole');
            addScore(POINTS_PER_MOLE);
        }
    });
});