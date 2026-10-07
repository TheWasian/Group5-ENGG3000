// GameView tests: rendering against the stub DOM.
// Method: direct calls, then read back the fake elements.
const h = require("./helpers");
const { check } = h;
const SECTION = "GameView";
const W7 = { week: 7 };
const W8 = { week: 8 };

async function run() {
  console.log("== GameView (stub DOM) ==");
  await h.test(SECTION, "renders mole types + score + environment", () => {
    GameView.showMole(2, "golden");
    check("hole active", h.holes[2]._classes.has("active"), true);
    check("mole class", h.holes[2]._mole.className, "mole mole-golden");
    check("mole face", h.holes[2]._mole.textContent, "🌟");
    GameView.setScore(150);
    check("score text", h.getById("score").textContent, 150);
    GameView.setLevel(3);
    check("level text", h.getById("level").textContent, 3);
    GameView.setTimer(42);
    check("timer text", h.getById("timer").textContent, 42);
    GameView.setLives(2);
    check("lives text", h.getById("lives").textContent, 2);
    GameView.setEnvironment("fire");
    check("env class", document.body._classes.has("env-fire"), true);
    GameView.say("hello");
    check("message text", h.getById("status-message").textContent, "hello");
    GameView.showWinScreen();
    check("win shown", h.getById("win-screen")._classes.has("hidden"), false);
    GameView.hideEndScreens();
    check("win hidden again", h.getById("win-screen")._classes.has("hidden"), true);
  }, W7);
  await h.test(SECTION, "old img markup still works (face on mole, img put back)", () => {
    // Legacy markup nests <img> art inside .mole; setting the emoji
    // must not delete it. Fake mole with just enough DOM for showMole.
    const realMole = GameView.moles[4];
    const img = { tagName: "IMG" };
    const fakeMole = {
      className: "",
      textContent: "",
      firstChild: null,
      _kept: null,
      querySelector: (sel) => (sel === "img" ? img : null),
      insertBefore: function (node) {
        this._kept = node;
      },
    };
    GameView.moles[4] = fakeMole;
    GameView.showMole(4, "dark");
    check("dark class", fakeMole.className, "mole mole-dark");
    check("dark face", fakeMole.textContent, "🌑");
    check("img put back", fakeMole._kept, img);
    GameView.moles[4] = realMole;
    GameView.hideAllMoles();
  }, W7);
  await h.test(SECTION, "css-mole art keeps its pieces (face inside art)", () => {
    // Redesign markup (.mole > .css-mole > .mole-nose): text directly in
    // .mole is clipped, so the face goes inside the art and the art's own
    // pieces must survive. Fake it with just enough DOM for showMole.
    const realMole = GameView.moles[5];
    const nose = { tagName: "DIV" };
    const art = {
      tagName: "DIV",
      textContent: "",
      childNodes: [nose],
      _appended: [],
      appendChild: function (node) {
        this._appended.push(node);
      },
    };
    const fakeMole = {
      className: "",
      textContent: "untouched",
      querySelector: (sel) => (sel === ".css-mole" ? art : null),
    };
    GameView.moles[5] = fakeMole;
    GameView.showMole(5, "toxic");
    check("toxic class", fakeMole.className, "mole mole-toxic");
    check("face inside art", art.textContent, "☠️");
    check("mole text untouched", fakeMole.textContent, "untouched");
    check("nose kept", art._appended.indexOf(nose) !== -1, true);
    GameView.moles[5] = realMole;
    GameView.hideAllMoles();
  }, W7);

  await h.test(SECTION, "level skin class lands on the mole and is cleared on hide", () => {
    GameView.showMole(1, "normal", "has-normal-ice");
    check("ice class present", h.holes[1]._mole._classes.has("has-normal-ice"), true);
    check("class string", h.holes[1]._mole.className, "mole mole-normal has-normal-ice");
    GameView.showMole(2, "bomb", "has-bomb-fire");
    check("new skin present", h.holes[2]._mole._classes.has("has-bomb-fire"), true);
    check("previous skin dropped", h.holes[1]._mole._classes.has("has-normal-ice"), false);
    GameView.hideAllMoles();
    check("hide clears every skin", h.holes[2]._mole._classes.has("has-bomb-fire"), false);
    check("hide clears the active hole", h.holes[2]._classes.has("active"), false);
    // A special mole keeps its own class.
    GameView.showMole(3, "frozen", "has-frozen");
    check("frozen class present", h.holes[3]._mole._classes.has("has-frozen"), true);
    GameView.hideAllMoles();
  }, W8);

  await h.test(SECTION, "timer shows the frozen state", () => {
    GameView.setTimer(120, true);
    check("frozen class added", h.getById("timer")._classes.has("frozen"), true);
    check("text still shows the clock", h.getById("timer").textContent, 120);
    GameView.setTimer(119, false);
    check("frozen class removed", h.getById("timer")._classes.has("frozen"), false);
    check("text updated", h.getById("timer").textContent, 119);
    GameView.setTimer(118);
    check("omitted frozen flag means not frozen", h.getById("timer")._classes.has("frozen"), false);
  }, W8);
}

module.exports = { run };
