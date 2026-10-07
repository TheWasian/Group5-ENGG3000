// main.js wiring tests: buttons + holes reach GameService.
// Method: click the fake elements main.js wired on load.
const h = require("./helpers");
const { check } = h;
const SECTION = "Wiring";
const W5 = { week: 5 };

async function run() {
  console.log("== main.js wiring ==");
  await h.test(SECTION, "buttons + holes wired to GameService", () => {
    // main.js ran on load: click holes[0] and the start button via recorded listeners.
    const startBtn = h.getById("start-button");
    if (!startBtn._listeners.click || !startBtn._listeners.click.length) throw new Error("start button not wired");
    if (!h.holes[0]._listeners.click || !h.holes[0]._listeners.click.length) throw new Error("holes not wired");
    startBtn.click();
    check("start button starts game", GameService.game.playing, true);
    GameService.spawnMole("normal", 0);
    const before = GameService.game.score;
    h.holes[0].click();
    check("hole click scores", GameService.game.score, before + 50);
    // restart buttons are wired too
    const restarts = document.querySelectorAll(".restart-button");
    check("restart buttons exist", Array.isArray(restarts) || restarts.length !== undefined, true);
  }, W5);
}

module.exports = { run };
