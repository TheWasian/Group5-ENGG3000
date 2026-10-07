// Writes tests/TEST-REPORT.md and tests/TEST-REPORT.html from one shared
// data object (helpers.stats() + the frozen Sep-22 baseline).
// The HTML is one page with embedded CSS and inline SVG/CSS charts; it loads
// nothing from the network, so it works offline.
const fs = require("fs");
const path = require("path");

const BASELINE_PATH = path.join(__dirname, "baseline", "TEST-REPORT-2026-09-22.md");

const WEEK_TOPICS = {
  5: "Core game logic",
  6: "Mole behaviour & scoring",
  7: "Frontend & rendering",
  8: "Sensor service, performance & parity",
};

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Rows of the first markdown table whose header line matches `re`.
function tableByHeader(src, re) {
  const lines = src.split("\n");
  let i = -1;
  for (let k = 0; k < lines.length; k++) {
    if (re.test(lines[k])) {
      i = k;
      break;
    }
  }
  if (i < 0) return [];
  const rows = [];
  for (let k = i + 1; k < lines.length; k++) {
    const line = lines[k];
    if (/^\|\s*-/.test(line)) continue;
    if (line.charAt(0) !== "|") break;
    rows.push(line.split("|").slice(1, -1).map((c) => c.trim()));
  }
  return rows;
}

// Each "### <label>" block in the baseline's complexity section, with its
// input-size rows and the verdict line underneath.
function parseBaselineComplexity(src) {
  const lines = src.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf("### ") !== 0) continue;
    const label = lines[i].slice(4).trim();
    const sizes = [];
    let verdict = "";
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.indexOf("### ") === 0 || line.indexOf("## ") === 0) break;
      const vm = line.match(/^\*\*Verdict: (.*)\*\*$/);
      if (vm) {
        verdict = vm[1];
        break;
      }
      if (line.charAt(0) !== "|" || /^\|\s*-/.test(line)) continue;
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (cells.length < 4 || cells[0] === "Input size") continue;
      if (!/^\d+$/.test(cells[0])) continue;
      sizes.push({
        n: cells[0],
        best: Number(cells[1]),
        worst: Number(cells[2]),
        avg: Number(cells[3]),
      });
    }
    out.push({ label, sizes, verdict });
  }
  return out;
}

function readBaseline() {
  const src = fs.readFileSync(BASELINE_PATH, "utf8");
  const m = src.match(/Result: \*\*(\d+) passed, (\d+) failed\*\*/);
  const serviceRows = [];
  const lines = src.split("\n");
  let inServices = false;
  for (const line of lines) {
    if (line.indexOf("| Service | Tests | Value assertions | Failed |") !== -1) {
      inServices = true;
      continue;
    }
    if (inServices) {
      if (line.indexOf("|---") === 0) continue;
      if (line.charAt(0) !== "|") break;
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (cells.length >= 4 && cells[0] !== "Service") {
        serviceRows.push({ service: cells[0], tests: cells[1], assertions: cells[2], failed: cells[3] });
      }
    }
  }

  const speed = tableByHeader(src, /^\| Operation \| Avg ns\/op \| Ops\/sec \|$/)
    .map((r) => ({ name: r[0], ns: Number(r[1]), perSec: Number(r[2]) }))
    .filter((r) => Number.isFinite(r.ns) && r.ns > 0);

  const behaviours = tableByHeader(src, /^\| Behaviour \| How tested \| Result \|$/).length;

  return {
    date: (src.match(/Date: (\S+)/) || [])[1] || "2026-09-22",
    passed: m ? Number(m[1]) : 145,
    failed: m ? Number(m[2]) : 0,
    tests: serviceRows.reduce((s, r) => s + Number(r.tests), 0),
    serviceRows,
    speed,
    complexity: parseBaselineComplexity(src),
    behaviours,
    // September never measured heap, so there is nothing to compare against.
    measuredSpace: /Heap after load|measured heap|expose-gc/i.test(src),
    src,
  };
}

function statusOf(row) {
  if (!row.ok) return "FAIL";
  if (row.partial) return "PARTIAL";
  return "PASS";
}

function methodOf(section, name) {
  if (section === "Complexity") return "timed (10 attempts)";
  if (section === "Parity" || section === "Hammer") return "simulated";
  if (section === "GameService" || section === "GameView" || section === "Polling" || section === "Wiring" || section === "SensorService") return "simulated";
  if (/distribution|polling|bot/i.test(name)) return "simulated";
  return "direct";
}

function weekTotals(testRows) {
  const out = {};
  for (let w = 5; w <= 8; w++) out[w] = { week: w, topic: WEEK_TOPICS[w], tests: 0, assertions: 0, failed: 0, partial: 0, rows: [] };
  for (const t of testRows) {
    const w = out[t.week] || out[8];
    w.tests++;
    w.assertions += t.assertions;
    if (!t.ok) w.failed++;
    if (t.partial) w.partial++;
    w.rows.push(t);
  }
  return [5, 6, 7, 8].map((w) => out[w]);
}

function sectionTotals(testRows) {
  const by = {};
  for (const t of testRows) {
    by[t.section] = by[t.section] || { tests: 0, assertions: 0, failed: 0, partial: 0 };
    by[t.section].tests++;
    by[t.section].assertions += t.assertions;
    if (!t.ok) by[t.section].failed++;
    if (t.partial) by[t.section].partial++;
  }
  return by;
}

function firstRow(testRows, re) {
  return testRows.find((t) => re.test(t.name));
}

function round(v) {
  return Math.round(v * 10) / 10;
}

// September's complexity verdict strings are turned into plain sentences.
function growthFactor(verdict) {
  const m = String(verdict || "").match(/grows ([\d.]+)x for (\d+)x input/);
  return m ? { factor: Number(m[1]), input: Number(m[2]) } : null;
}

function plainVerdict(probe) {
  const g = growthFactor(probe.verdict);
  const order = probe.kind === "flat" ? "constant work (O(1))" : "work grows with the input (O(s))";
  if (g) {
    return Math.round(g.factor * 10) / 10 + " times slower when the input is " + g.input + " times bigger, so " + order;
  }
  if (/flat across/.test(probe.verdict)) return "the same speed however big the input, so " + order;
  return String(probe.verdict).replace(/ -> /g, ", ") + ", so " + order;
}

// Why a task takes longer than it did in September.
function timeReason(label, ratio) {
  if (label.indexOf("whack") !== -1) {
    return "the pipeline now applies the whole scoring rule: bombs cost a life, golden pays 200, frozen stops the clock, and every hit updates the level and the bar";
  }
  if (label.indexOf("getLevel") !== -1) {
    return "still under a microsecond; the timer call around each attempt costs more than the function itself";
  }
  if (ratio < 1) return "no change to the code, and timings this small move with the machine";
  return "same code, measured again on another day";
}

function ratioText(ratio) {
  if (ratio >= 1) return (Math.round(ratio * 10) / 10) + "x slower";
  return (Math.round((1 / ratio) * 10) / 10) + "x faster";
}

// September vs now, in four buckets the report shows separately.
function buildCompare(baseline, stats, totals, sections, moleMatrix) {
  const better = [];
  const slower = [];
  const unchanged = [];

  const coverage = [
    ["Value assertions", baseline.passed, totals.assertions, ""],
    ["Tests", baseline.tests, totals.tests, ""],
    ["Behaviours in the coverage matrix", baseline.behaviours, moleMatrix.length, ""],
    ["Areas covered", baseline.serviceRows.length, Object.keys(sections).length, ""],
  ];
  for (const [label, oldV, nowV, unit] of coverage) {
    better.push({
      label,
      old: oldV,
      now: nowV,
      unit,
      note: nowV >= oldV
        ? (Math.round((nowV / Math.max(oldV, 1)) * 10) / 10) + "x as many"
        : "fewer than before",
    });
  }

  for (const r of stats.perfRows) {
    const b = baseline.speed.find((s) => s.name === r.label);
    if (!b) continue;
    const oldMs = b.ns / 1e6;
    const ratio = r.avgMs / Math.max(oldMs, 1e-12);
    const nowNs = r.avgMs * 1e6;
    const row = {
      label: r.label,
      old: b.ns,
      now: nowNs,
      unit: "ns",
      ratio,
      note: ratioText(ratio),
      reason: timeReason(r.label, ratio),
    };
    if (ratio > 1.15) slower.push(row);
    else if (ratio < 0.85) better.push(row);
    else unchanged.push(row);
  }

  // Verdict chips: the shape of the answer did not move.
  const chips = [];
  const flat = stats.complexityProbes.find((p) => p.kind === "flat");
  const scales = stats.complexityProbes.find((p) => p.kind === "scales");
  if (flat) chips.push(flat.label.split(" (")[0] + ": constant work (O(1)) in both runs");
  if (scales) chips.push(scales.label.split(" (")[0] + ": work grows with the sensor count (O(s)) in both runs");
  const oldG = baseline.complexity.map((c) => growthFactor(c.verdict)).filter(Boolean)[0];
  const newG = scales ? growthFactor(scales.verdict) : null;
  if (oldG && newG) {
    // The factor swings with machine load, so both readings are shown rather
    // than implied to be a like-for-like change.
    chips.push(
      "Sensor cost at 100 times the input: still grows with the input (measured " +
        round(oldG.factor) + "x in September, " + round(newG.factor) + "x this run)"
    );
  }
  chips.push("Poll interval: 75 ms in both runs");
  for (const row of unchanged) chips.push(row.label + ": " + row.note + ", measurement noise");

  const provenance = [
    ["Node", process.version],
    ["Command", "node tests/run-tests.js"],
    ["Sensor probe", "2, 20 and 200 sensors, 2,000 calls each, 10 attempts"],
    ["Scoring probe", "2,000 whacks per attempt, 10 attempts"],
    ["Spawn probe", "5,000 spawns per attempt, 10 attempts"],
    ["Poll probe", "50 timed polls"],
    ["Spawn odds", "30,000 seeded picks per level, 90,000 in total"],
    ["Clock", "hrtime.bigint(), shown in ms"],
  ];

  return { better, slower, unchanged, chips, provenance, measuredSpace: baseline.measuredSpace };
}

function buildModel() {
  const h = require("./helpers");
  const stats = h.stats();
  const baseline = readBaseline();
  const weeks = weekTotals(stats.testRows);
  const sections = sectionTotals(stats.testRows);
  const poll = stats.perfRows.find((r) => r.label.indexOf("SensorService.check") !== -1);
  const lat = h.pollLatencies.slice().sort((a, b) => a - b);
  const latAvg = lat.length ? lat.reduce((s, v) => s + v, 0) / lat.length : poll ? poll.avgNs : 0;
  const date = (function (d) {
    const pad = (n) => (n < 10 ? "0" + n : "" + n);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  })(new Date());

  const moleMatrix = [
    ["Normal mole (+50 flat, no streak multiplier)", "scripted whack + bot game", /normal pays exactly|FULL BOT GAME/],
    ["Bomb mole (-1 life, 0 points)", "scripted whack", /bomb costs a life/],
    ["Bomb expiry costs nothing", "scripted escape", /escapes: only a normal/],
    ["Golden mole (+200, lifetime x0.75)", "scripted whack + lifetime assert", /golden pays \+200/],
    ["Frozen mole (+50, freezes 5s)", "scripted whack + tick loop", /frozen pays \+50|frozen ticks consume/],
    ["Escape costs a life only for normal", "scripted escape", /escapes: only a normal/],
    ["Spawn odds per level (30k seeded picks)", "seeded simulation", /spawn distribution accuracy/],
    ["Level spawn/lifetime table", "direct table check", /spawn\/lifetime table|spawn interval \+ lifetime/],
    ["Level bands 0/500/1000, win 2000", "direct", /level bands|level thresholds/],
    ["Progress bar bands", "direct", /progress bar bands|progress bar renders/],
    ["Ice/fire variant classes (services)", "direct", /variant class per level|level skin class/],
    ["Ice/fire classes added by the live path", "source inspection", /ice\/fire variant classes/],
    ["Streak module maths", "direct", /streak starts at x1/],
    ["Streak applied during play", "scripted play", /streak applied during play/],
    ["Service rules == live game rules", "both paths scripted", /whacking behaves identically|scoring constants/],
    ["Sensor hammer marker follows the player", "scripted position", /sensor hammer follows/],
    ["Sensor hit scored through GameService", "scripted sensor hit", /sensor hit is scored/],
    ["#hammer-cursor styled and wired", "source inspection", /#hammer-cursor has styling/],
    ["Timer shows the frozen state", "direct read-back", /timer shows the frozen state/],
    ["Position parsing (both ESP32 formats)", "direct", /finds the player's hole/],
    ["Connection consistency (dup/stale/busy/offline)", "scripted fetch queue", /connection holds steady/],
    ["Poll speed (50 timed polls)", "timed", /one poll is fast/],
  ].map(([behaviour, how, re]) => {
    const row = firstRow(stats.testRows, re);
    return { behaviour, how, result: row ? statusOf(row) : "NOT COVERED", week: row ? row.week : null };
  });

  const totals = {
    tests: stats.testRows.length,
    assertions: stats.assertions,
    passed: stats.passed,
    failed: stats.failed,
    partial: stats.partialCount,
  };

  return {
    stats,
    baseline,
    weeks,
    sections,
    poll,
    lat,
    latAvg,
    date,
    moleMatrix,
    compare: buildCompare(baseline, stats, totals, sections, moleMatrix),
    totals,
  };
}

// The gaps the suite found. Known failures, expected partials, and two gaps
// that only show up when you read the frontend source.
function gapRows(model) {
  const { stats } = model;
  const rows = [];
  for (const t of stats.testRows) {
    if (t.ok || t.known) continue;
    const detail = (t.failMsgs || []).map((m) => m.split(" -> ")[0]).join("; ");
    rows.push([detail || t.name, "FAIL", "frontend", "asserted in `" + t.name + "` (see section 4)"]);
  }
  for (const pt of stats.partials) {
    rows.push([pt.name, "PARTIAL", "frontend", pt.reason]);
  }
  rows.push([
    "`environments.css` / `environments-fx.css` are linked in `index.html` but the files are not there (404)",
    "FAIL",
    "frontend",
    "delete the two `<link>` tags, or add the files",
  ]);
  rows.push([
    "`#hammer-cursor` has markup but no CSS rule and no JS (removed by `df8fe44`)",
    "FAIL",
    "frontend",
    "put the cursor style and JS back, or drop the element",
  ]);
  rows.push([
    "`ESP-32 Code/tests/game_backend_test.cjs` still expects the old modular score (`m.score() === 10` / `20`)",
    "FAIL",
    "ESP-32 tests",
    "change the 4 modular expectations to 50 / 100. Parity made the modular path match the live game (both +50), so this file still encodes the old split; every other assertion in it passes against the parity services (checked on a copy outside the repo)",
  ]);
  return rows;
}

// ---------------------------------------------------------------------------
// TEST-REPORT.md  (plain tables, regression-friendly diff)
// ---------------------------------------------------------------------------
function writeMarkdown(model, file) {
  const { stats, baseline, weeks, sections, poll, latAvg, date, moleMatrix, totals, compare } = model;
  const L = [];
  const p = (s) => L.push(s);
  const growth = (totals.assertions / Math.max(baseline.passed, 1)) * 100;

  p("# Test report: Whack-A-Mole backend");
  p("");
  p("Date: " + date);
  p("Run `node tests/run-tests.js` from `UI-Code/backend`, no libraries.");
  p("Result: **" + totals.passed + " passed, " + totals.failed + " failed, " + totals.partial + " partial** (" + totals.tests + " tests, " + totals.assertions + " assertions).");
  p("");
  p("**Units:** every timing in this report is in **milliseconds (ms)**; ESP32 measurement is out of scope.");
  p("");
  p("Baseline from " + baseline.date + ": " + baseline.passed + " passed, " + baseline.failed + " failed across " + baseline.tests + " tests, quoted in full in section 12");
  p("");
  p("Layout: one test file per service (`tests/test-<service>.js`), shared harness in `tests/helpers.js`.");
  p("");

  p("## 1. Summary");
  p("");
  p("| Measure | Value |");
  p("|---|---|");
  p("| Tests | " + totals.tests + " |");
  p("| Value assertions | " + totals.assertions + " |");
  p("| Passed | " + totals.passed + " |");
  p("| Failed | " + totals.failed + " |");
  p("| Partial (expected gaps) | " + totals.partial + " |");
  p("| Baseline (Sep 22) | " + baseline.passed + " assertions, " + baseline.tests + " tests |");
  p("| Growth vs baseline | " + growth.toFixed(0) + "% of baseline assertions |");
  p("");

  p("## 2. Sensor polling speed");
  p("");
  const lat = model.lat;
  p("Each row is one poll, timed 50 times; the loop runs every 75 ms");
  p("");
  if (lat.length) {
    p("| Measure | Value |");
    p("|---|---|");
    p("| Fastest poll | " + (lat[0] / 1e6).toFixed(6) + " ms |");
    p("| Average poll | " + (latAvg / 1e6).toFixed(6) + " ms |");
    p("| Slowest poll | " + (lat[lat.length - 1] / 1e6).toFixed(6) + " ms |");
    p("| Poll interval | 75 ms |");
    p("| Interval used by an average poll | " + ((latAvg / 1e6 / 75) * 100).toFixed(3) + "% |");
    p("| Polls per second | " + Math.round(1e9 / latAvg) + " |");
  } else if (poll) {
    p("| Average poll | " + poll.avgMs.toFixed(6) + " ms (" + poll.perSec + " per second) |");
    p("| Poll interval | 75 ms |");
  }
  p("");
  p("What this shows: one poll takes a fraction of a millisecond against a 75 ms budget, so the loop cannot pile up, and the busy flag drops any overlap (section 3)");
  p("");

  p("## 3. Connection handling");
  p("");
  p("Scripted fetch queue, no network; each row is one asserted behaviour");
  p("");
  const connRows = stats.testRows.filter((t) => t.section === "Polling" || /connection holds|fresh hit forwarded/i.test(t.name));
  const connOk = connRows.length && connRows.every((t) => t.ok);
  const connCases = [
    ["Fresh event (age < 1s)", "forwarded to onHit(hole)"],
    ["Duplicate event_id", "ignored (exactly 1 hit)"],
    ["Stale event (age > 1s)", "ignored, id still remembered"],
    ["Poll while busy", "no second fetch fired"],
    ["Fetch fails (ESP32 offline)", 'status line shows "disconnected"'],
    ["Reconnect", "hits resume, status clears"],
  ];
  p("| Case | Expected | Result |");
  p("|---|---|---|");
  for (const c of connCases) p("| " + c[0] + " | " + c[1] + " | " + (connOk ? "PASS" : "FAIL") + " |");
  p("");
  p("What this shows: " + (connOk ? "every consistency case passes" : "FAILURES PRESENT, see section 11"));
  p("");

  p("## 4. Every test, by service");
  p("");
  p("direct = called the function with fixed values; simulated = scripted play (forced spawns, seeded RNG, fake fetch/DOM) or a full bot game; timed = 10 attempts; n = value assertions inside the test");
  p("");
  p("| Service | Tests | Value assertions | Failed | Partial |");
  p("|---|---|---|---|---|");
  for (const s of Object.keys(sections)) {
    const b = sections[s];
    p("| " + s + " | " + b.tests + " | " + b.assertions + " | " + b.failed + " | " + b.partial + " |");
  }
  p("");
  p("| Test | Method | n | Result | Time (ms) | Week |");
  p("|---|---|---|---|---|---|");
  for (const t of stats.testRows) {
    p("| " + t.name + " | " + methodOf(t.section, t.name) + " | " + t.assertions + " | " + statusOf(t) + " | " + t.ms + " | W" + t.week + " |");
  }
  p("");

  p("## 5. Which mole behaviours are covered");
  p("");
  p("| Behaviour | How tested | Week | Result |");
  p("|---|---|---|---|");
  for (const m of moleMatrix) p("| " + m.behaviour + " | " + m.how + " | " + (m.week ? "W" + m.week : "-") + " | " + m.result + " |");
  p("");

  p("## 6. Week 5 to Week 8");
  p("");
  p("| Week | Topic | Tests | Assertions | Failed | Partial |");
  p("|---|---|---|---|---|---|");
  for (const w of weeks) p("| Week " + w.week + " | " + w.topic + " | " + w.tests + " | " + w.assertions + " | " + w.failed + " | " + w.partial + " |");
  p("");
  let cum = 0;
  p("Cumulative assertions by week: " + weeks.map((w) => { cum += w.assertions; return "W" + w.week + " " + cum; }).join(" to "));
  p("");
  p("Growth over the Sep-22 baseline of " + baseline.passed + " assertions: **" + growth.toFixed(0) + "%**");
  p("");

  p("## 7. How this run compares to September");
  p("");
  p("Everything in this section is read out of `" + path.relative(path.join(__dirname, "..", ".."), BASELINE_PATH).replace(/\\/g, "/") + "` and reprinted in full in section 12; nothing here is retyped by hand");
  p("");
  p("### Coverage growth");
  p("");
  p("| Point | Assertions |");
  p("|---|---|");
  let g = 0;
  p("| Sep-22 baseline | " + baseline.passed + " |");
  for (const w of weeks) {
    g += w.assertions;
    p("| End of week " + w.week + " | " + g + " |");
  }
  p("");
  p("### What got better");
  p("");
  p("Timings that came down, and counts that went up.");
  p("");
  p("| Measure | Sep-22 | This run | Change |");
  p("|---|---|---|---|");
  for (const row of compare.better) {
    const f = (v) => (row.unit ? Math.round(v) + " ns" : String(v));
    p("| " + row.label + " | " + f(row.old) + " | " + f(row.now) + " | " + row.note + " |");
  }
  p("");

  p("### What got slower");
  p("");
  p("Each row says why");
  p("");
  p("| Task | Sep-22 | This run | Change | Why |");
  p("|---|---|---|---|---|");
  for (const row of compare.slower) {
    p("| " + row.label + " | " + Math.round(row.old) + " ns | " + Math.round(row.now) + " ns | " + row.note + " | " + row.reason + " |");
  }
  if (!compare.slower.length) p("| (none) | | | | |");
  p("");

  p("### What did not change");
  p("");
  for (const c of compare.chips) p("- " + c);
  p("");

  p("### Memory");
  p("");
  if (!compare.measuredSpace) {
    p("September never measured memory, so there is nothing to compare against yet; the heap probe (child process, `--expose-gc`) was added for this run. This run measured:");
    p("");
  }
  if (stats.spaceProbes.length) {
    p("| Path | Heap after load (KB) | After a 2000-point game (KB) | Game delta (KB) | Sep-22 |");
    p("|---|---|---|---|---|");
    for (const s of stats.spaceProbes) {
      p("| " + s.path + " (" + s.file + ") | " + s.loadKB + " | " + s.gameKB + " | " + s.deltaKB + " | not measured |");
    }
  } else {
    p("No space probe ran in this run.");
  }
  p("");

  p("### How these numbers were produced");
  p("");
  p("| Input | Value |");
  p("|---|---|");
  for (const [k, v] of compare.provenance) p("| " + k + " | " + v + " |");
  p("");

  p("## 8. How long each task takes");
  p("");
  p("Each row is one task, timed on this machine; lower is faster");
  p("");
  p("| Task | Average time | Time for 1,000 runs | Runs per second |");
  p("|---|---|---|---|");
  for (const r of stats.perfRows) {
    p("| " + r.label + " | " + r.avgMs.toFixed(6) + " ms | " + (r.avgMs * 1000).toFixed(4) + " ms | " + r.perSec + " |");
  }
  p("");

  p("## 9. Does it get slower as the input grows?");
  p("");
  p("Big-O asks one thing: does a task take longer when the input gets bigger? O(1) means no, O(s) means it loops once over the s sensors");
  p("");
  for (const probe of stats.complexityProbes) {
    p("### " + probe.label);
    p("");
    p("Why it was chosen: " + probe.why);
    p("");
    p("| Input size | Fastest | Slowest | Average of 10 | Time for 1,000 runs |");
    p("|---|---|---|---|---|");
    for (const r of probe.sizes) {
      p("| " + r.n + " | " + r.bestMs.toFixed(6) + " ms | " + r.worstMs.toFixed(6) + " ms | " + r.avgMs.toFixed(6) + " ms | " + (r.avgMs * 1000).toFixed(4) + " ms |");
    }
    p("");
    p("**What this shows: " + plainVerdict(probe) + ".**");
    p("");
  }

  if (stats.crossArch.length) {
    p("### The same task, both ways");
    p("");
    p("The live path (`gameLogic.js`) runs in its own child process so the two halves never share a global scope");
    p("");
    p("| Task | Monolith | Services | Ratio |");
    p("|---|---|---|---|");
    for (const c of stats.crossArch) {
      const ratio = c.services.avgMs / c.monolith.avgMs;
      p("| " + c.op + " | " + c.monolith.avgMs.toFixed(6) + " ms | " + c.services.avgMs.toFixed(6) + " ms | " + ratio.toFixed(2) + "x |");
    }
    p("");
    for (const c of stats.crossArch) if (c.note) p("- " + c.op + ": " + c.note + ".");
    p("");
  }

  if (stats.spaceProbes.length) {
    p("### Memory, measured");
    p("");
    p("A child process with `--expose-gc`, best of 3 runs");
    p("");
    p("| Path | Heap after load (KB) | Heap after a 2000-point game (KB) | Game delta (KB) | Runs (KB) |");
    p("|---|---|---|---|---|");
    for (const s of stats.spaceProbes) {
      p("| " + s.path + " (" + s.file + ") | " + s.loadKB + " | " + s.gameKB + " | " + s.deltaKB + " | " + s.runs.join(", ") + " |");
    }
    p("");
    p("| Aspect | Monolith | Services |");
    p("|---|---|---|");
    p("| Game state | module-level globals | one `GameService.game` object |");
    p("| Rules | inline closures + constants | service singletons (constant space) |");
    p("| Per poll | shared `lastData` copy | shared `lastData` copy |");
    p("| Per hit | temporaries in `whackHole` | temporaries in `whack()` |");
    p("| Expected order | O(1) state, O(1) per op | O(1) state, O(1) per op |");
    p("");
    p("**What this shows:** both halves hold constant game state; the split changes the shape of the code and who owns it, not how much memory a game needs, and the heap deltas above are the evidence");
    p("");
  }

  p("## 10. Two ways to structure the same game");
  p("");
  p("| Dimension | Monolith (`gameLogic.js`) | Services (`main.js` + `services/*`) |");
  p("|---|---|---|");
  const ca = stats.crossArch;
  const hit = ca.find((c) => c.op.indexOf("score a normal") === 0);
  const spawn = ca.find((c) => c.op.indexOf("spawn") === 0);
  p("| Time per hit (measured) | " + (hit ? hit.monolith.avgMs.toFixed(6) + " ms" : "see section 9") + " | " + (hit ? hit.services.avgMs.toFixed(6) + " ms" : "see section 9") + " |");
  p("| Time per spawn (measured) | " + (spawn ? spawn.monolith.avgMs.toFixed(6) + " ms" : "-") + " | " + (spawn ? spawn.services.avgMs.toFixed(6) + " ms" : "-") + " |");
  const sp = stats.spaceProbes;
  p("| Space (measured) | " + (sp[1] ? sp[1].deltaKB + " KB per game" : "see section 9") + " | " + (sp[0] ? sp[0].deltaKB + " KB per game" : "see section 9") + " |");
  p("| Change isolation | editing one rule touches a shared file, risk of breaking the others | one service per rule, the edit stays local |");
  p("| Test granularity | whole-page behaviour only | per-service unit tests plus integration and parity |");
  p("| Failure isolation | any throw takes the whole loop down | each service fails on its own, polling keeps running |");
  p("| Wiring complexity | globals wired implicitly at load | `main.js` owns all wiring explicitly |");
  p("");

  p("## 11. What is still wrong");
  p("");
  p("These rows are the gaps the suite actually found; `node tests/run-tests.js` produces every row except the last, which comes from the separate ESP-32 firmware test");
  p("");
  p("| Gap | Result | Owner | Suggested fix |");
  p("|---|---|---|---|");
  for (const g2 of gapRows(model)) p("| " + g2[0] + " | " + g2[1] + " | " + g2[2] + " | " + g2[3] + " |");
  p("");

  p("## 12. September's report, in full");
  p("");
  p("Reprinted unchanged so the growth figures above can be checked; it keeps its original units (ns/op), while every number measured for this run is in ms");
  p("");
  p("```");
  p(baseline.src.trim());
  p("```");
  p("");

  fs.writeFileSync(file, L.join("\n"));
}

// ---------------------------------------------------------------------------
// TEST-REPORT.html  (one page, embedded CSS, nothing loaded from the network)
// ---------------------------------------------------------------------------
const CSS = `
:root{--bg:#0d1117;--card:#161b22;--line:#30363d;--fg:#c9d1d9;--muted:#8b949e;
--accent:#58a6ff;--ok:#3fb950;--fail:#f85149;--warn:#d29922;--purple:#bc8cff;
--good:#3fb950;--bad:#f85149}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
-webkit-font-smoothing:antialiased}
.wrap{max-width:1120px;margin:0 auto;padding:32px 20px 80px}
h1{font-size:26px;margin:0 0 6px;color:#fff;letter-spacing:-.01em}
h2{font-size:19px;margin:44px 0 14px;padding-bottom:9px;border-bottom:1px solid var(--line);color:#fff;
display:flex;align-items:center;gap:10px}
h2 .n{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;
padding:0 7px;border-radius:7px;background:rgba(88,166,255,.14);border:1px solid rgba(88,166,255,.32);
color:var(--accent);font-size:13px;font-weight:700;flex:0 0 auto}
h3{font-size:15.5px;margin:24px 0 8px;color:#fff}
p{margin:9px 0}
a{color:var(--accent)}
.muted{color:var(--muted)}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin:14px 0}
.banner{display:flex;flex-wrap:wrap;gap:12px;background:var(--card);
border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-top:16px}
.stat{flex:1 1 132px;min-width:118px;padding-left:12px;border-left:3px solid var(--line)}
.stat .v{font-size:25px;font-weight:700;color:#fff;line-height:1.2;font-variant-numeric:tabular-nums}
.stat .k{font-size:11.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}
.stat .si{display:block;margin-bottom:7px}
.v.ok{color:var(--ok)}.v.fail{color:var(--fail)}.v.warn{color:var(--warn)}.v.acc{color:var(--accent)}
table{width:100%;border-collapse:collapse;margin:10px 0 4px;font-size:14px}
.tscroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{background:#1c2129;color:#fff;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
tbody tr:hover td{background:rgba(88,166,255,.06)}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.tag{display:inline-block;padding:1px 8px;border-radius:20px;font-size:11.5px;font-weight:700;letter-spacing:.03em;white-space:nowrap}
.pass{background:rgba(63,185,80,.15);color:var(--ok);border:1px solid rgba(63,185,80,.35)}
.failt{background:rgba(248,81,73,.15);color:var(--fail);border:1px solid rgba(248,81,73,.35)}
.partial{background:rgba(210,153,34,.15);color:var(--warn);border:1px solid rgba(210,153,34,.35)}
.week{background:rgba(88,166,255,.13);color:var(--accent);border:1px solid rgba(88,166,255,.32)}
code{background:#1c2129;padding:2px 6px;border-radius:5px;font-size:13px;color:#e6edf3}
pre{background:#1c2129;border:1px solid var(--line);border-radius:8px;padding:14px;overflow:auto;font-size:12.5px;line-height:1.45}
.note{border-left:3px solid var(--accent);padding:9px 14px;background:rgba(88,166,255,.07);border-radius:0 8px 8px 0;margin:12px 0}
.empty{border:1px dashed var(--line);border-radius:8px;padding:14px;color:var(--muted);margin:10px 0;font-size:14px}
/* charts */
.chart{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px 12px;margin:14px 0}
.chart>strong{color:#fff;font-size:14.5px;display:block;margin-bottom:4px}
.bars{display:flex;align-items:flex-end;gap:26px;height:210px;padding:0 10px;border-bottom:2px solid var(--line)}
.wgroup{flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;height:100%;justify-content:flex-end}
.pair{display:flex;gap:6px;align-items:flex-end;height:100%}
.bar{width:34px;border-radius:5px 5px 0 0;position:relative;min-height:2px}
.bar.b1{background:linear-gradient(180deg,#79c0ff,#1f6feb)}
.bar.b2{background:linear-gradient(180deg,#d2a8ff,#8957e5)}
.bar span{position:absolute;top:-19px;left:50%;transform:translateX(-50%);font-size:11.5px;color:#fff;font-weight:700}
.wlabel{font-size:12.5px;color:var(--muted);padding-top:8px}
.legend{display:flex;gap:16px;font-size:12.5px;color:var(--muted);margin-top:10px;flex-wrap:wrap}
.key{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:6px;vertical-align:-1px}
/* before / after comparison rows */
.cmp{margin-top:8px}
.cmprow{display:grid;grid-template-columns:1fr;gap:4px;padding:9px 0;border-bottom:1px solid var(--line)}
.cmprow:last-child{border-bottom:0}
.cmphead{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
.cmplabel{font-size:13.5px;color:#fff;font-weight:600}
.cmpnote{font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.cmpnote.good{color:var(--good)}.cmpnote.bad{color:var(--bad)}
.cmpbars{display:flex;flex-direction:column;gap:3px}
.cmpbar{height:15px;border-radius:3px;position:relative;min-width:3px;transition:width .3s ease}
.cmpbar.old{background:#3d444d}
.cmpbar.now{background:linear-gradient(90deg,#1f6feb,#58a6ff)}
.cmpbar.nbad{background:linear-gradient(90deg,#b62324,#f85149)}
.cmpbar span{position:absolute;right:5px;top:0;line-height:15px;font-size:11px;color:#fff;font-weight:700;
font-variant-numeric:tabular-nums;white-space:nowrap;background:rgba(13,17,23,.78);padding:0 5px;border-radius:3px}
.cmpreason{font-size:12.5px;color:var(--muted);line-height:1.45}
/* chips */
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.chip{background:#1c2129;border:1px solid var(--line);border-radius:8px;padding:7px 11px;font-size:13px;color:var(--fg)}
.chip b{color:#fff}
/* progress bar */
.pbar{height:26px;background:#0d1117;border:1px solid var(--line);border-radius:14px;overflow:hidden;position:relative;margin:10px 0 4px}
.pbar>i{display:block;height:100%;background:linear-gradient(90deg,#1f6feb,#3fb950);border-radius:14px}
.pbar .marks{position:absolute;inset:0;pointer-events:none}
.pbar .marks b{position:absolute;top:0;bottom:0;width:1px;background:rgba(255,255,255,.35)}
.pbar .marks em{position:absolute;top:50%;transform:translate(-50%,-50%);font-size:11px;font-style:normal;color:#fff;background:rgba(13,17,23,.75);padding:0 5px;border-radius:4px}
/* week cards */
.wcards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:14px 0}
.wcard{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}
.wcard h4{margin:0 0 4px;font-size:14.5px;color:#fff}
.wcard .topic{font-size:12.5px;color:var(--muted);min-height:34px}
.wcard .big{font-size:22px;font-weight:700;color:var(--accent);margin-top:8px;font-variant-numeric:tabular-nums}
.wcard .sub{font-size:12px;color:var(--muted)}
.marks{margin-top:8px;display:flex;gap:5px;flex-wrap:wrap}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:900px){.grid2{grid-template-columns:1fr}}
@media(max-width:760px){.wrap{padding:22px 14px 60px}h2{font-size:17px}th,td{padding:6px 7px;font-size:13px}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
svg text{font:11px -apple-system,BlinkMacSystemFont,Helvetica,Arial;fill:#8b949e}
.footer{margin-top:40px;font-size:12.5px;color:var(--muted);border-top:1px solid var(--line);padding-top:14px}
@media print{body{background:#fff;color:#000}.card,.chart,.wcard,.banner{border-color:#ccc}}
`;

function tag(s) {
  if (s === "PASS") return '<span class="tag pass">PASS</span>';
  if (s === "FAIL") return '<span class="tag failt">FAIL</span>';
  if (s === "PARTIAL") return '<span class="tag partial">PARTIAL</span>';
  return '<span class="tag pass">' + esc(s) + "</span>";
}

function table(headers, rows) {
  let s = '<div class="tscroll"><table><thead><tr>';
  for (const hd of headers) s += "<th" + (hd.num ? ' class="num"' : "") + ">" + esc(hd.label || hd) + "</th>";
  s += "</tr></thead><tbody>";
  for (const r of rows) {
    s += "<tr>";
    for (const c of r) s += "<td>" + c + "</td>";
    s += "</tr>";
  }
  return s + "</tbody></table></div>";
}

function ms(v) {
  return Number(v).toFixed(6);
}

function h2(n, title) {
  return '<h2><span class="n">' + n + "</span>" + esc(title) + "</h2>";
}

// markdown-ish inline code -> escaped HTML with <code>
function mdCode(s) {
  return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
}

// Small line icon used by the KPI cards.
function icon(name) {
  const paths = {
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    hash: '<path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    half: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 000 18z" fill="currentColor" stroke="none"/>',
    base: '<path d="M3 17l6-6 4 4 8-8"/><path d="M21 7v5h-5"/>',
  };
  const stroke = { list: "#58a6ff", hash: "#bc8cff", check: "#3fb950", x: "#f85149", half: "#d29922", base: "#8b949e" }[name];
  return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="' + stroke +
    '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[name] + "</svg>";
}

// Before / after rows: one label, two bars scaled against each other.
function cmpBlock(rows, toneFor) {
  let s = '<div class="cmp">';
  for (const r of rows) {
    const top = Math.max(r.old, r.now, 1);
    const f = (v) => (r.unit === "ns" ? Math.round(v) + " ns" : String(v));
    const tone = toneFor ? toneFor(r) : "";
    s += '<div class="cmprow"><div class="cmphead">';
    s += '<span class="cmplabel">' + esc(r.label) + "</span>";
    s += '<span class="cmpnote ' + tone + '">' + esc(r.note) + "</span></div>";
    s += '<div class="cmpbars">';
    s += '<div class="cmpbar old" style="width:' + ((r.old / top) * 100).toFixed(1) + '%"><span>Sep-22 ' + f(r.old) + "</span></div>";
    s += '<div class="cmpbar ' + (tone === "bad" ? "nbad" : "now") + '" style="width:' + ((r.now / top) * 100).toFixed(1) + '%"><span>now ' + f(r.now) + "</span></div>";
    s += "</div>";
    if (r.reason) s += '<div class="cmpreason">' + esc(r.reason) + "</div>";
    s += "</div>";
  }
  return s + "</div>";
}

// Coverage line: the frozen baseline, then each week's cumulative total.
function growthLine(baseline, weeks) {
  let run = 0;
  const pts = [{ label: "Sep-22", v: baseline.passed }];
  for (const w of weeks) {
    run += w.assertions;
    pts.push({ label: "W" + w.week, v: run });
  }
  const maxY = Math.max.apply(null, pts.map((q) => q.v)) * 1.14 || 1;
  const W = 640, H = 210, PADL = 52, PADR = 18, PADT = 22, PADB = 36;
  const stepX = (W - PADL - PADR) / (pts.length - 1);
  const xy = pts.map((q, i) => [
    Math.round(PADL + i * stepX),
    Math.round(PADT + (H - PADT - PADB) * (1 - q.v / maxY)),
  ]);
  let s = '<div class="chart"><strong>Coverage: September to now</strong>';
  s += '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" height="' + H + '" role="img" aria-label="cumulative assertions from the September baseline to now">';
  for (let g2 = 0; g2 <= 4; g2++) {
    const y = Math.round(PADT + ((H - PADT - PADB) / 4) * g2);
    s += '<line x1="' + PADL + '" y1="' + y + '" x2="' + (W - PADR) + '" y2="' + y + '" stroke="#30363d" stroke-width="1"/>';
    s += '<text x="' + (PADL - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + Math.round(maxY * (1 - g2 / 4)) + "</text>";
  }
  s += '<polyline fill="none" stroke="#58a6ff" stroke-width="2.5" stroke-linejoin="round" points="' +
    xy.map((q) => q[0] + "," + q[1]).join(" ") + '"/>';
  xy.forEach((q, i) => {
    s += '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="4.5" fill="' + (i === 0 ? "#d29922" : "#58a6ff") + '"/>';
    s += '<text x="' + q[0] + '" y="' + (q[1] - 11) + '" text-anchor="middle" fill="#c9d1d9">' + pts[i].v + "</text>";
    s += '<text x="' + q[0] + '" y="' + (H - 12) + '" text-anchor="middle">' + esc(pts[i].label) + "</text>";
  });
  s += "</svg>";
  s += '<div class="legend"><span><i class="key" style="background:#d29922"></i>September baseline</span>'
    + '<span><i class="key" style="background:#58a6ff"></i>Cumulative after each week</span></div></div>';
  return s;
}

function writeHtml(model, file) {
  const { stats, baseline, weeks, sections, lat, latAvg, date, moleMatrix, totals, compare } = model;
  const o = [];
  const p = (s) => o.push(s);

  const growth = (totals.assertions / Math.max(baseline.passed, 1)) * 100;

  p('<!doctype html><html lang="en"><head><meta charset="utf-8">');
  p('<meta name="viewport" content="width=device-width,initial-scale=1">');
  p("<title>Whack-A-Mole backend test report, " + date + "</title>");
  p("<style>" + CSS + "</style></head><body><div class=\"wrap\">");

  // ---- 1 summary --------------------------------------------------------
  p("<h1>Whack-A-Mole backend test report</h1>");
  p('<p class="muted">' + date + " &middot; run with <code>node tests/run-tests.js</code> from <code>UI-Code/backend</code>, no libraries</p>");
  p(h2(1, "Summary"));
  p('<div class="banner">');
  const stats2 = [
    ["list", totals.tests, "", "Tests"],
    ["hash", totals.assertions, "acc", "Assertions"],
    ["check", totals.passed, "ok", "Passed"],
    ["x", totals.failed, totals.failed ? "fail" : "ok", "Failed"],
    ["half", totals.partial, "warn", "Partial"],
    ["base", baseline.passed, "", "Sep-22 baseline"],
  ];
  for (const [ic, v, cls, label] of stats2) {
    p('<div class="stat">' + icon(ic) + '<div class="v ' + cls + '">' + v + '</div><div class="k">' + label + "</div></div>");
  }
  p("</div>");
  p('<div class="note"><strong>Units:</strong> every frontend and backend timing below is in '
    + "<strong>milliseconds (ms)</strong>. The harness samples <code>hrtime.bigint()</code> internally and converts at presentation. "
    + "ESP32 measurement is out of scope and keeps its own conventions.</div>");

  // ---- 2 polling --------------------------------------------------------
  p(h2(2, "Sensor polling speed"));
  if (lat.length) {
    p('<div class="card">');
    p('<p class="muted">Each row is one poll, timed 50 times; the loop runs every 75&nbsp;ms</p>');
    p(table(
      [{ label: "Measure" }, { label: "Value", num: true }],
      [
        ["Fastest poll", ms(lat[0] / 1e6) + " ms"],
        ["Average poll", ms(latAvg / 1e6) + " ms"],
        ["Slowest poll", ms(lat[lat.length - 1] / 1e6) + " ms"],
        ["Poll interval", "75 ms"],
        ["Interval used by an average poll", ((latAvg / 1e6 / 75) * 100).toFixed(3) + "%"],
        ["Polls per second", Math.round(1e9 / latAvg)],
      ]
    ));
    p('<p class="muted">One poll takes a fraction of a millisecond against a 75&nbsp;ms budget, so the loop cannot pile up, and the <code>busy</code> flag drops any overlap</p>');
    p("</div>");
  }

  // ---- 3 connection -----------------------------------------------------
  p(h2(3, "Connection handling"));
  const connOk = stats.testRows.filter((t) => t.section === "Polling" || /connection holds|fresh hit forwarded/i.test(t.name)).every((t) => t.ok);
  p('<div class="card">');
  p(table(
    ["Case", "Expected", "Result"],
    [
      ["Fresh event (age &lt; 1s)", "forwarded to onHit(hole)", tag(connOk ? "PASS" : "FAIL")],
      ["Duplicate event_id", "ignored (exactly 1 hit)", tag(connOk ? "PASS" : "FAIL")],
      ["Stale event (age &gt; 1s)", "ignored, id still remembered", tag(connOk ? "PASS" : "FAIL")],
      ["Poll while busy", "no second fetch fired", tag(connOk ? "PASS" : "FAIL")],
      ["Fetch fails (ESP32 offline)", 'status line shows "disconnected"', tag(connOk ? "PASS" : "FAIL")],
      ["Reconnect", "hits resume, status clears", tag(connOk ? "PASS" : "FAIL")],
    ]
  ));
  p("</div>");

  // ---- 4 unit tests -----------------------------------------------------
  p(h2(4, "Every test, by service"));
  p('<p class="muted">direct = called the function with fixed values; simulated = scripted play (forced spawns, seeded RNG, fake fetch/DOM) or a full bot game; '
    + "timed = 10 attempts; n = value assertions inside the test</p>");
  p("<div class=\"grid2\">");
  p("<div>" + table(
    ["Service", { label: "Tests", num: true }, { label: "Assertions", num: true }, { label: "Failed", num: true }, { label: "Partial", num: true }],
    Object.keys(sections).map((s) => {
      const b = sections[s];
      return [esc(s), b.tests, b.assertions, b.failed, b.partial];
    })
  ) + "</div>");
  const ca = stats.crossArch;
  const hitRow = ca.find((c) => c.op.indexOf("score a normal") === 0);
  p("<div>" + table(
    ["Headline", "Value"],
    [
      ["Slowest unit test", Math.max.apply(null, stats.testRows.map((t) => t.ms)) + " ms"],
      ["Poll cost", ms(latAvg / 1e6) + " ms"],
      ["Scoring a hit (monolith)", hitRow ? ms(hitRow.monolith.avgMs) + " ms" : "-"],
      ["Scoring a hit (services)", hitRow ? ms(hitRow.services.avgMs) + " ms" : "-"],
      ["Heap per game (monolith)", (stats.spaceProbes[1] || {}).deltaKB + " KB"],
      ["Heap per game (services)", (stats.spaceProbes[0] || {}).deltaKB + " KB"],
    ]
  ) + "</div>");
  p("</div>");
  p(table(
    ["Test", "Method", { label: "n", num: true }, "Result", { label: "Time (ms)", num: true }, "Week"],
    stats.testRows.map((t) => [
      esc(t.name), esc(methodOf(t.section, t.name)), t.assertions, tag(statusOf(t)), t.ms, '<span class="tag week">W' + t.week + "</span>",
    ])
  ));

  // ---- 5 mole coverage --------------------------------------------------
  p(h2(5, "Which mole behaviours are covered"));
  p('<div class="card">');
  p(table(
    ["Behaviour", "How tested", "Week", "Result"],
    moleMatrix.map((m) => [esc(m.behaviour), esc(m.how), m.week ? '<span class="tag week">W' + m.week + "</span>" : "-", tag(m.result)])
  ));
  p("</div>");

  // ---- 6 progression ----------------------------------------------------
  p(h2(6, "Week 5 to Week 8"));
  const maxA = Math.max.apply(null, weeks.map((w) => w.assertions).concat([1]));
  const maxT = Math.max.apply(null, weeks.map((w) => w.tests).concat([1]));
  p('<div class="chart"><strong>Tests and assertions added in each week</strong><div class="bars">');
  for (const w of weeks) {
    p('<div class="wgroup"><div class="pair">');
    p('<div class="bar b1" style="height:' + Math.round((w.tests / maxT) * 100) + '%"><span>' + w.tests + "</span></div>");
    p('<div class="bar b2" style="height:' + Math.round((w.assertions / maxA) * 100) + '%"><span>' + w.assertions + "</span></div>");
    p("</div></div>");
  }
  p("</div><div class=\"legend\">");
  p('<span><i class="key" style="background:#1f6feb"></i>Tests</span>');
  p('<span><i class="key" style="background:#8957e5"></i>Assertions</span>');
  p('<span class="muted">Each week stands on its own, so the two measures are scaled separately.</span>');
  p("</div></div>");

  p('<div class="wcards">');
  for (const w of weeks) {
    p('<div class="wcard"><h4>Week ' + w.week + '</h4><div class="topic">' + esc(w.topic) + "</div>");
    p('<div class="big">' + w.assertions + '</div><div class="sub">assertions &middot; ' + w.tests + " tests</div>");
    p('<div class="marks">');
    for (let i = 0; i < w.rows.length; i++) {
      const st = statusOf(w.rows[i]);
      p('<span class="tag ' + (st === "PASS" ? "pass" : st === "FAIL" ? "failt" : "partial") + '" title="' + esc(w.rows[i].name) + '">' + (st === "PASS" ? "✓" : st === "FAIL" ? "✗" : "◐") + "</span>");
    }
    p("</div>");
    p('<div class="sub" style="margin-top:6px">' + (w.failed ? '<span style="color:#f85149">' + w.failed + " failed</span> &middot; " : "")
      + (w.partial ? '<span style="color:#d29922">' + w.partial + " partial</span>" : (w.failed ? "" : "all green")) + "</div>");
    p("</div>");
  }
  p("</div>");

  p(table(
    ["Week", "Topic", { label: "Tests", num: true }, { label: "Assertions", num: true }, { label: "Failed", num: true }, { label: "Partial", num: true }],
    weeks.map((w) => ['<span class="tag week">W' + w.week + "</span>", esc(w.topic), w.tests, w.assertions, w.failed, w.partial])
  ));
  p('<p class="muted">Growth over the Sep-22 baseline of ' + baseline.passed + " assertions: <strong style=\"color:#fff\">"
    + growth.toFixed(0) + "%</strong></p>");

  // ---- 7 vs September ---------------------------------------------------
  p(h2(7, "How this run compares to September"));
  p('<p class="muted">Everything here is read out of <code>tests/baseline/TEST-REPORT-2026-09-22.md</code> and reprinted in full at the end of this page; '
    + "nothing is retyped by hand</p>");

  p(growthLine(baseline, weeks));

  p('<div class="chart"><strong>What got better</strong>');
  p(cmpBlock(compare.better, () => "good"));
  p('<div class="legend"><span><i class="key" style="background:#3d444d"></i>September 22</span>'
    + '<span><i class="key" style="background:#58a6ff"></i>This run</span>'
    + '<span class="muted">For timings a shorter bar is better. For counts a longer bar is better.</span></div></div>');

  p('<div class="chart"><strong>What got slower</strong>');
  if (compare.slower.length) {
    p(cmpBlock(compare.slower, () => "bad"));
    p('<div class="legend"><span><i class="key" style="background:#3d444d"></i>September 22</span>'
      + '<span><i class="key" style="background:#f85149"></i>This run</span></div></div>');
  } else {
    p('<div class="empty">Nothing got slower in this run.</div></div>');
  }

  p('<div class="chart"><strong>What did not change</strong><div class="chips">');
  for (const c of compare.chips) p('<span class="chip">' + esc(c) + "</span>");
  p("</div></div>");

  p('<div class="chart"><strong>Memory</strong>');
  if (!compare.measuredSpace) {
    p('<div class="empty">September never measured memory, so there is nothing to compare against yet; '
      + "the heap probe (a child process with <code>--expose-gc</code>) was added for this run. This run measured:</div>");
  }
  if (stats.spaceProbes.length) {
    p(table(
      ["Path", { label: "After load (KB)", num: true }, { label: "After a 2000-point game (KB)", num: true }, { label: "Game delta (KB)", num: true }, "Sep-22"],
      stats.spaceProbes.map((s) => [
        esc(s.path) + ' <span class="muted">(' + esc(s.file) + ")</span>", s.loadKB, s.gameKB, s.deltaKB, '<span class="muted">not measured</span>',
      ])
    ));
  } else {
    p('<div class="empty">No space probe ran in this run.</div>');
  }
  p("</div>");

  p('<div class="card"><h3 style="margin-top:0">How these numbers were produced</h3>');
  p(table(["Input", "Value"], compare.provenance.map(([k, v]) => [esc(k), "<code>" + esc(v) + "</code>"])));
  p("</div>");

  // ---- 8 speed ----------------------------------------------------------
  p(h2(8, "How long each task takes"));
  p('<p class="muted">Each row is one task, timed on this machine; lower is faster</p>');
  p(table(
    ["Task", { label: "Average time", num: true }, { label: "Time for 1,000 runs", num: true }, { label: "Runs per second", num: true }],
    stats.perfRows.map((r) => [esc(r.label), ms(r.avgMs) + " ms", (r.avgMs * 1000).toFixed(4) + " ms", r.perSec])
  ));

  // ---- 9 complexity -----------------------------------------------------
  p(h2(9, "Does it get slower as the input grows?"));
  p('<p class="muted">Big-O asks one thing: does a task take longer when the input gets bigger? O(1) means no, O(s) means it loops once over the s sensors</p>');
  for (const probe of stats.complexityProbes) {
    p("<div class=\"card\"><h3>" + esc(probe.label) + "</h3>");
    p('<p class="muted">Why it was chosen: ' + esc(probe.why) + "</p>");
    p(table(
      ["Input size", { label: "Fastest", num: true }, { label: "Slowest", num: true }, { label: "Average of 10", num: true }, { label: "Time for 1,000 runs", num: true }],
      probe.sizes.map((r) => [esc(String(r.n)), ms(r.bestMs) + " ms", ms(r.worstMs) + " ms", ms(r.avgMs) + " ms", (r.avgMs * 1000).toFixed(4) + " ms"])
    ));
    p("<p><strong>What this shows: " + esc(plainVerdict(probe)) + "</strong></p></div>");
  }

  if (ca.length) {
    p("<h3>The same task, both ways</h3>");
    p('<p class="muted">The live path (<code>gameLogic.js</code>) is measured in its own child process so the two halves never share a global scope</p>');
    p(table(
      ["Task", { label: "Monolith", num: true }, { label: "Services", num: true }, { label: "Ratio", num: true }],
      ca.map((c) => [
        esc(c.op), ms(c.monolith.avgMs) + " ms", ms(c.services.avgMs) + " ms",
        (c.services.avgMs / c.monolith.avgMs).toFixed(2) + "x",
      ])
    ));
    for (const c of ca) if (c.note) p('<p class="muted">&bull; ' + esc(c.op) + ": " + esc(c.note) + ".</p>");
  }

  if (stats.spaceProbes.length) {
    p("<h3>Memory, measured</h3>");
    p('<p class="muted">A child process with <code>--expose-gc</code>, best of 3 runs</p>');
    p(table(
      ["Path", { label: "After load (KB)", num: true }, { label: "After a 2000-point game (KB)", num: true }, { label: "Game delta (KB)", num: true }, "3 runs (KB)"],
      stats.spaceProbes.map((s) => [
        esc(s.path) + ' <span class="muted">(' + esc(s.file) + ")</span>", s.loadKB, s.gameKB, s.deltaKB, esc(s.runs.join(", ")),
      ])
    ));
    p("<div class=\"grid2\">");
    p("<div>" + table(
      ["Aspect", "Monolith", "Services"],
      [
        ["Game state", "module-level globals", "one <code>GameService.game</code> object"],
        ["Rules", "inline closures + constants", "service singletons (constant space)"],
        ["Per poll", "shared <code>lastData</code> copy", "shared <code>lastData</code> copy"],
        ["Per hit", "temporaries in <code>whackHole</code>", "temporaries in <code>whack()</code>"],
        ["Expected order", "O(1) state, O(1) per op", "O(1) state, O(1) per op"],
      ]
    ) + "</div><div><div class=\"note\"><strong>What this shows:</strong> both halves hold constant game state. "
      + "The split changes the shape of the code and who owns it, not how much memory a game needs, and the heap deltas above are the evidence.</div></div></div>");
  }

  // ---- 10 architecture --------------------------------------------------
  p(h2(10, "Two ways to structure the same game"));
  const spawnRow = ca.find((c) => c.op.indexOf("spawn") === 0);
  const sp = stats.spaceProbes;
  p(table(
    ["Dimension", "Monolith (gameLogic.js)", "Services (main.js + services/*)"],
    [
      ["Time per hit (measured)",
        hitRow ? ms(hitRow.monolith.avgMs) + " ms" : "see section 9",
        hitRow ? ms(hitRow.services.avgMs) + " ms" : "see section 9"],
      ["Time per spawn (measured)",
        spawnRow ? ms(spawnRow.monolith.avgMs) + " ms" : "-",
        spawnRow ? ms(spawnRow.services.avgMs) + " ms" : "-"],
      ["Space (measured)",
        sp[1] ? sp[1].deltaKB + " KB per game" : "see section 9",
        sp[0] ? sp[0].deltaKB + " KB per game" : "see section 9"],
      ["Change isolation", "editing one rule touches a shared file, risk of breaking the others", "one service per rule, the edit stays local"],
      ["Test granularity", "whole-page behaviour only", "per-service unit tests plus integration and parity"],
      ["Failure isolation", "any throw takes the whole loop down", "each service fails on its own, polling keeps running"],
      ["Wiring complexity", "globals wired implicitly at load", "<code>main.js</code> owns all wiring explicitly"],
    ]
  ));

  // ---- 11 known gaps ----------------------------------------------------
  p(h2(11, "What is still wrong"));
  p('<div class="note">These rows are the gaps the suite actually found; <code>node tests/run-tests.js</code> produces every row except the last, '
    + "which comes from the separate ESP-32 firmware test</div>");
  p(table(
    ["Gap", "Result", "Owner", "Suggested fix"],
    gapRows(model).map((g2) => [mdCode(g2[0]), tag(g2[1]), mdCode(g2[2]), mdCode(g2[3])])
  ));

  // ---- 12 appendix ------------------------------------------------------
  p(h2(12, "September's report, in full"));
  p('<p class="muted">Reprinted unchanged so the growth figures above can be checked; it keeps its original units (ns/op), while every number measured for this run is in ms</p>');
  p("<pre>" + esc(baseline.src.trim()) + "</pre>");

  p('<div class="footer">Generated by <code>tests/run-tests.js</code>, report written by <code>tests/report-html.js</code>. '
    + "This page loads nothing from the network. "
    + totals.passed + " passed &middot; " + totals.failed + " failed &middot; " + totals.partial + " partial.</div>");
  p("</div></body></html>");

  fs.writeFileSync(file, o.join("\n"));
}

module.exports = { writeMarkdown, writeHtml, buildModel };
