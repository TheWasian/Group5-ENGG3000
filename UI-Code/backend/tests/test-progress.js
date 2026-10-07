// Score progress bar, read back through the REAL index.html DOM.
// Method: scripted play (forced normal moles so no bomb ends the run), then
// assert the bar's text and width at each level boundary.
//
// Unlike the other suites this uses loadMonolith({ strictDom: true }), where
// document.getElementById returns null for an id the page does not contain.
const h = require("./helpers");
const { check } = h;
const SECTION = "Progress bar";
const W7 = { week: 7 };

// One whack, the way a click does it: spawn, force normal, whack the active hole.
function whack(m) {
  m.run(
    "spawnMole();" +
      "activeMoleType = 'normal';" +
      "whackHole(Number(activeHole.dataset.hole), 'mouse');"
  );
}

function playTo(m, target) {
  let guard = 0;
  while (m.read("score") < target && guard++ < 500) whack(m);
  return m.read("score");
}

// What the bar must show at a given score, using the game's own bands.
function expectFor(score) {
  let start = 0;
  let end = 500;
  let label = "Level 2";
  if (score >= 1000) {
    start = 1000;
    end = 2000;
    label = "Win";
  } else if (score >= 500) {
    start = 500;
    end = 1000;
    label = "Level 3";
  }
  const range = end - start;
  const progress = Math.min(Math.max(score - start, 0), range);
  return {
    text: progress + " / " + range + " (" + label + ")",
    width: (progress / range) * 100 + "%",
    pct: Math.round(((progress / range) * 100) * 10) / 10 + "%",
  };
}

async function run() {
  console.log("== Progress bar (real index.html DOM) ==");
  await h.test(SECTION, "bar tracks the score across every level boundary", () => {
    const m = h.loadMonolith({ strictDom: true });
    m.run("startGame()");

    const targets = [0, 50, 450, 500, 950, 1000, 1500, 1950];
    for (const target of targets) {
      const score = playTo(m, target);
      const want = expectFor(score);
      const bar = m.dom.getById("progress-bar");
      const text = m.dom.getById("progress-text");
      const pct = m.dom.getById("progress-pct");

      check("score reached " + target, score, target);
      check(
        "text at score " + score,
        text && text.textContent,
        want.text
      );
      check(
        "width at score " + score,
        bar && bar.style.width,
        want.width
      );
      check(
        "percent at score " + score,
        pct && pct.textContent,
        want.pct
      );
    }
    check("game still running", m.read("gameActive"), true);

    // The strict DOM proves the bar is wired correctly, but it is still not a
    // browser: nothing here lays the page out or reads the computed width.
    // A manual check in a real browser on 2026-10-06 confirmed the bar moves;
    // the gap is that no automated test can redo that check.
    h.partial(
      "score progress bar walks 0 -> 1950 through the real page DOM",
      "text and width are asserted on the parsed index.html, and a manual " +
        "browser check on 2026-10-06 confirmed the bar moves, but no automated " +
        "test renders the page, so the visible bar cannot be re-checked by CI"
    );
  }, W7);

  await h.test(SECTION, "page has the elements the bar needs", () => {
    const dom = h.loadRealDom();
    check("progress-bar present", !!dom.getById("progress-bar"), true);
    check("progress-text present", !!dom.getById("progress-text"), true);
    check("progress-pct present", !!dom.getById("progress-pct"), true);
    check("progress-section present", !!dom.document.querySelector(".progress-section"), true);
    check("holes parsed", dom.holes.length, 6);
  }, W7);
}

module.exports = { run };
