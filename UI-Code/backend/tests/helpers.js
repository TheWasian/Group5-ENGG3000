
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DIR = path.join(__dirname, "..");

let passed = 0;
let failed = 0;
let partialCount = 0;
const failures = [];
const partials = []; // { name, reason, week }
const perfRows = [];
const testRows = []; // every test: { section, name, ok, partial, week, ms, assertions, known }
const complexityProbes = [];
const crossArch = []; // { op, monolith, services } — ms/op, both architectures
const spaceProbes = []; // { path, loadKB, gameKB, deltaKB } measured heap
const pollLatencies = []; // SensorService poll timings (ns) for the report
let current = null; // test row currently running (for assertion counts)

function check(name, actual, expected) {
  if (current) current.assertions++;
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    if (current) current.ok = false;
    failures.push(name + " -> got " + JSON.stringify(actual) + ", wanted " + JSON.stringify(expected));
    if (current) current.failMsgs.push(name + " -> got " + JSON.stringify(actual) + ", wanted " + JSON.stringify(expected));
    console.log("  FAIL " + name + " -> got " + JSON.stringify(actual) + ", wanted " + JSON.stringify(expected));
  }
}

function checkClose(name, actual, expected, tolerance) {
  if (current) current.assertions++;
  if (Math.abs(actual - expected) <= tolerance) {
    passed++;
  } else {
    failed++;
    if (current) current.ok = false;
    failures.push(name + " -> got " + actual + ", wanted ~" + expected + " (+/-" + tolerance + ")");
    if (current) current.failMsgs.push(name + " -> got " + actual + ", wanted ~" + expected);
    console.log("  FAIL " + name + " -> got " + actual + ", wanted ~" + expected);
  }
}

// A gap we EXPECT to see (D7): recorded, shown in the report, never hidden,
// and never able to fail the run on its own.
function partial(name, reason) {
  partialCount++;
  const week = current && current.week ? current.week : 8;
  partials.push({ name, reason, week });
  if (current) current.partial = true;
  console.log("  PARTIAL " + name + " -- " + reason);
}

// opts.week = which week this test belongs to (D3). Default 8 (current week).
function test(section, name, fn, opts) {
  opts = opts || {};
  const started = Date.now();
  const row = {
    section,
    name,
    ok: true,
    partial: false,
    known: !!opts.known,
    week: opts.week || 8,
    ms: 0,
    assertions: 0,
    failMsgs: [],
  };
  current = row;
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log("PASS " + name);
      row.ms = Date.now() - started;
      testRows.push(row);
    })
    .catch((e) => {
      failed++;
      failures.push(name + " threw: " + e.message);
      console.log("FAIL " + name + " threw: " + e.message);
      row.ok = false;
      row.failMsgs.push(name + " threw: " + e.message);
      row.ms = Date.now() - started;
      testRows.push(row);
    })
    .then(() => {
      current = null;
    });
}

// ---------- timing (measured in ns, presented in ms — D8) ----------
const toMs = (ns) => ns / 1e6;

// Record a pre-measured timing (e.g. async poll latencies).
function perfRow(label, avgNs) {
  perfRows.push({
    label,
    avgNs: Math.round(avgNs),
    avgMs: toMs(avgNs),
    perSec: Math.round(1e9 / avgNs),
  });
}

// Time a function: reports average ns + ms + operations per second.
function perf(label, fn, runs) {
  const start = process.hrtime.bigint();
  for (let i = 0; i < runs; i++) fn(i);
  const ns = Number(process.hrtime.bigint() - start);
  const avgNs = ns / runs;
  perfRow(label, avgNs);
}

// Run one attempt = opsPerAttempt calls, return ns per single call.
function oneAttempt(run, input, opsPerAttempt) {
  const start = process.hrtime.bigint();
  for (let i = 0; i < opsPerAttempt; i++) run(input, i);
  return Number(process.hrtime.bigint() - start) / opsPerAttempt;
}

// 10 attempts of the same work -> best / worst / average.
// Use for work that SHOULD be constant: the numbers must come out flat.
function complexityFlat(label, run, opsPerAttempt, why) {
  const attempts = [];
  for (let a = 0; a < 10; a++) attempts.push(oneAttempt(run, null, opsPerAttempt));
  attempts.sort((x, y) => x - y);
  const avg = attempts.reduce((s, v) => s + v, 0) / 10;
  const row = {
    label,
    kind: "flat",
    sizes: [
      {
        n: "-",
        best: attempts[0],
        worst: attempts[9],
        avg,
        bestMs: toMs(attempts[0]),
        worstMs: toMs(attempts[9]),
        avgMs: toMs(avg),
        perThousandMs: toMs(avg) * 1000,
      },
    ],
    verdict: "flat across 10 attempts -> O(1)",
    why,
  };
  complexityProbes.push(row);
  return row;
}

// Same work at several input sizes, 10 attempts each.
// Flat numbers -> O(1). Numbers growing with the input -> O(n).
function complexityScales(label, unit, sizes, make, run, opsPerAttempt, why, interpret) {
  const rows = sizes.map((n) => {
    const input = make(n);
    run(input, 0); // warm up first (fair timing)
    const attempts = [];
    for (let a = 0; a < 10; a++) attempts.push(oneAttempt(run, input, opsPerAttempt));
    attempts.sort((x, y) => x - y);
    const avg = attempts.reduce((s, v) => s + v, 0) / 10;
    return {
      n,
      best: attempts[0],
      worst: attempts[9],
      avg,
      bestMs: toMs(attempts[0]),
      worstMs: toMs(attempts[9]),
      avgMs: toMs(avg),
      perThousandMs: toMs(avg) * 1000,
    };
  });
  const growth = rows[rows.length - 1].avg / rows[0].avg;
  const sizeRatio = rows[rows.length - 1].n / rows[0].n;
  let verdict;
  if (interpret) {
    verdict = interpret;
  } else if (growth < 2) {
    verdict = "stays flat (only " + growth.toFixed(2) + "x for " + sizeRatio + "x input) -> O(1)";
  } else {
    verdict = "grows " + growth.toFixed(1) + "x for " + sizeRatio + "x input -> O(" + unit + ")";
  }
  const probe = { label, kind: "scales", unit, sizes: rows, verdict, why };
  complexityProbes.push(probe);
  return probe;
}

function printProbe(probe) {
  console.log("-- " + probe.label + " --");
  console.log("input size | best (ms/op) | worst (ms/op) | average of 10 (ms/op)");
  for (const r of probe.sizes) {
    console.log(
      String(r.n).padEnd(10) +
        r.bestMs.toFixed(6).padEnd(15) +
        r.worstMs.toFixed(6).padEnd(16) +
        r.avgMs.toFixed(6)
    );
  }
  console.log("verdict: " + probe.verdict);
}

// Repeatable random numbers (so distribution tests never flake).
function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

// ---------- fake browser ----------
function makeEl() {
  const listeners = {};
  const el = {
    title: "",
    style: {},
    dataset: {},
    offsetWidth: 0,
    _classes: new Set(),
    classList: null, // set below (needs `this`)
    _listeners: listeners,
    textContent: "",
    addEventListener(type, fn) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    click() {
      (listeners.click || []).forEach((fn) => fn());
    },
    appendChild() {},
    insertBefore() {},
    removeAttribute() {},
    getBoundingClientRect() {
      return {};
    },
    querySelector() {
      return makeEl();
    },
  };
  // className and classList are the SAME storage in a real browser, so keep
  // them in sync here too — tests that read one and write the other (or vice
  // versa) then behave exactly like the page would.
  Object.defineProperty(el, "className", {
    get() {
      return Array.from(el._classes).join(" ");
    },
    set(v) {
      el._classes.clear();
      String(v)
        .split(/\s+/)
        .filter(Boolean)
        .forEach((c) => el._classes.add(c));
    },
  });
  return el;
}

function wireClassList(el) {
  el.classList = {
    add: (c) => el._classes.add(c),
    remove: (c) => el._classes.delete(c),
    toggle: (c, f) => (f === undefined ? (el._classes.has(c) ? el._classes.delete(c) : el._classes.add(c)) : f ? el._classes.add(c) : el._classes.delete(c)),
    contains: (c) => el._classes.has(c),
  };
  return el;
}

// A set of holes + a getElementById registry (used by the main harness AND,
// isolated, by the monolith vm sandbox).
function makeDom(holeCount) {
  const holes = [];
  for (let i = 0; i < holeCount; i++) {
    const h = wireClassList(makeEl());
    h.dataset.hole = String(i);
    const mole = wireClassList(makeEl());
    h.querySelector = () => mole;
    h._mole = mole;
    holes.push(h);
  }
  const byId = {};
  const getById = (id) => {
    if (!byId[id]) byId[id] = wireClassList(makeEl());
    return byId[id];
  };
  const document = {
    querySelectorAll: (sel) => {
      if (sel === ".hole") return holes;
      if (sel === ".restart-button" || sel === ".reward" || sel === ".player-marker") return [];
      return [];
    },
    querySelector: () => wireClassList(makeEl()),
    getElementById: getById,
    body: wireClassList(makeEl()),
  };
  return { holes, getById, document };
}

const mainDom = makeDom(6);
const holes = mainDom.holes;
const byId = mainDom.getById;

global.document = mainDom.document;
global.window = { location: { hostname: "localhost" }, addEventListener() {} };

// Fake timers: store callbacks, tests fire them by hand.
let timeoutFns = [];
let intervalFns = [];
let lastTimeoutMs = null; // delay of the most recent setTimeout (mole lifetime)
global.setTimeout = (fn, ms) => {
  lastTimeoutMs = ms;
  timeoutFns.push(fn);
  return timeoutFns.length - 1;
};
global.clearTimeout = (id) => {
  timeoutFns[id] = null;
};
global.setInterval = (fn) => {
  intervalFns.push(fn);
  return intervalFns.length - 1;
};
global.clearInterval = () => {};

function resetTimers() {
  timeoutFns = [];
  intervalFns = [];
  lastTimeoutMs = null;
}
function getLastTimeoutMs() {
  return lastTimeoutMs;
}
function fireNextTimeout() {
  const fn = timeoutFns.find((f) => f);
  if (!fn) return false;
  const id = timeoutFns.indexOf(fn);
  timeoutFns[id] = null;
  fn();
  return true;
}
function fireInterval(index) {
  const fn = intervalFns[index === undefined ? 0 : index];
  if (!fn) return false;
  fn();
  return true;
}

// Fake fetch for the sensor: a queue of responses (or errors).
let fetchQueue = [];
let fetchCalls = 0;
global.fetch = () => {
  fetchCalls++;
  const next = fetchQueue.length ? fetchQueue.shift() : { error: true };
  if (next.error) return Promise.reject(new Error("offline"));
  return Promise.resolve({ ok: true, json: () => Promise.resolve(next.body) });
};
function setFetchQueue(q) {
  fetchQueue = q;
}
function getFetchCalls() {
  return fetchCalls;
}
function resetFetchCalls() {
  fetchCalls = 0;
}
// Fake localStorage for the high score (a simple object that remembers strings).
global.localStorage = {
  _data: {},
  getItem(k) {
    return this._data[k] === undefined ? null : this._data[k];
  },
  setItem(k, v) {
    this._data[k] = String(v);
  },
  clear() {
    this._data = {};
  },
};
const flush = () => new Promise((r) => setImmediate(r));

// Load the real game files (services are plain browser scripts,
// so eval them into globals and test them like the real page would).
function loadServices() {
  for (const f of [
    "services/LevelingService.js",
    "services/MoleService.js",
    "services/EnvironmentService.js",
    "services/StreakService.js",
    "services/GameConditionService.js",
    "services/HighScoreService.js",
    "services/GameService.js",
    "GameView.js",
    "SensorService.js",
    "main.js",
  ]) {
    (0, eval)(fs.readFileSync(path.join(DIR, f), "utf8"));
  }
}

// ---------- the real page, parsed ----------
// makeDom() invents any id you ask for, so a missing element can never fail a
// test even though it throws in the browser. This builds the DOM from the
// index.html the page actually loads instead: getElementById returns null for
// anything the page does not contain, exactly like a browser does.
function loadRealDom() {
  let html = fs.readFileSync(path.join(DIR, "..", "index.html"), "utf8");
  html = html.replace(/<!--[\s\S]*?-->/g, ""); // comments are not elements

  const all = [];
  const byId = {};
  const stack = [];
  const voidTags = {
    img: 1, br: 1, hr: 1, input: 1, meta: 1, link: 1, source: 1,
    area: 1, base: 1, col: 1, embed: 1, track: 1, wbr: 1,
  };

  for (const tok of html.split(/(<[^>]*>)/g)) {
    if (!tok || tok.charAt(0) !== "<") continue;
    const second = tok.charAt(1);
    if (second === "/") {
      stack.pop();
      continue;
    }
    if (second === "!" || second === "?") continue;

    const m = tok.match(/^<([a-zA-Z][\w-]*)([^>]*)>$/);
    if (!m) continue;
    const tag = m[1].toLowerCase();
    const attrs = m[2];

    const el = wireClassList(makeEl());
    el.tagName = tag.toUpperCase();
    el._children = [];
    el.id = "";

    const classMatch = attrs.match(/\bclass="([^"]*)"/);
    if (classMatch) {
      classMatch[1].split(/\s+/).filter(Boolean).forEach((c) => el._classes.add(c));
    }
    const idMatch = attrs.match(/\bid="([^"]*)"/);
    if (idMatch) {
      el.id = idMatch[1];
      byId[idMatch[1]] = el;
    }
    const holeMatch = attrs.match(/\bdata-hole="([^"]*)"/);
    if (holeMatch) el.dataset.hole = holeMatch[1];

    const parent = stack[stack.length - 1];
    if (parent) parent._children.push(el);
    all.push(el);

    if (!voidTags[tag] && !/\/>$/.test(tok)) stack.push(el);
  }

  function descendants(el) {
    const out = [];
    for (const child of el._children) {
      out.push(child);
      out.push.apply(out, descendants(child));
    }
    return out;
  }
  function match(el, sel) {
    if (sel.charAt(0) === ".") return el._classes.has(sel.slice(1));
    if (sel.charAt(0) === "#") return el.id === sel.slice(1);
    return el.tagName === sel.toUpperCase();
  }
  all.forEach((el) => {
    el.querySelector = (sel) => descendants(el).find((d) => match(d, sel)) || null;
    el.querySelectorAll = (sel) => descendants(el).filter((d) => match(d, sel));
  });

  const body = wireClassList(makeEl());
  return {
    holes: all.filter((e) => e._classes.has("hole")),
    getById: (id) => byId[id] || null,
    document: {
      getElementById: (id) => byId[id] || null,
      querySelector: (sel) => all.find((e) => match(e, sel)) || null,
      querySelectorAll: (sel) => all.filter((e) => match(e, sel)),
      body,
      addEventListener() {},
    },
  };
}

// ---------- the live monolith, loaded in its own vm context ----------
// gameLogic.js is the frontend's reference implementation. It is loaded into
// an isolated vm context so its top-level `const`/`let` globals never collide
// with the modular services in this process. Timers are captured but never
// run, rAF is a no-op, and GameView/SensorService are stubbed (the monolith
// only uses GameView.setEnvironment).
//
// Pass { strictDom: true } to build the DOM from the real index.html, where a
// missing element comes back as null instead of being invented on the spot.
function loadMonolith(options) {
  const opts = options || {};
  const src = fs.readFileSync(path.join(DIR, "gameLogic.js"), "utf8");
  const dom = opts.strictDom ? loadRealDom() : makeDom(6);
  const timers = { timeouts: [], intervals: [], lastTimeoutMs: null };
  const raf = [];

  const GameViewStub = {
    holes: [],
    setEnvironment() {},
    showMole() {},
    hideAllMoles() {},
    setScore() {},
    setLevel() {},
    setTimer() {},
    setLives() {},
    setProgress() {},
    say() {},
    flashDamage() {},
    flashSensorHit() {},
    unlockReward() {},
    resetRewards() {},
    showWinScreen() {},
    showLoseScreen() {},
    hideEndScreens() {},
    setStartButtonText() {},
  };
  const SensorServiceStub = {
    init() {},
    start() {},
    notifyGameStart() {},
    onHit: null,
  };

  const sandbox = {
    console,
    document: dom.document,
    window: { location: { hostname: "localhost" }, addEventListener() {} },
    localStorage: global.localStorage,
    performance: { now: () => Number(process.hrtime.bigint()) / 1e6 },
    requestAnimationFrame(fn) {
      raf.push(fn);
      return raf.length - 1;
    },
    cancelAnimationFrame() {},
    setTimeout(fn, ms) {
      timers.lastTimeoutMs = ms;
      timers.timeouts.push(fn);
      return timers.timeouts.length - 1;
    },
    clearTimeout(id) {
      timers.timeouts[id] = null;
    },
    setInterval(fn, ms) {
      timers.intervals.push({ fn, ms });
      return timers.intervals.length - 1;
    },
    clearInterval(id) {
      if (id !== undefined) timers.intervals[id] = null;
    },
    fetch: () => Promise.reject(new Error("offline")),
    GameView: GameViewStub,
    SensorService: SensorServiceStub,
  };

  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: "gameLogic.js" });

  return {
    ctx,
    src,
    timers,
    dom,
    // Top-level const/let of the script live in the context's global lexical
    // environment, so a later script in the same context can read them.
    read: (expr) => vm.runInContext(expr, ctx),
    run: (code) => vm.runInContext(code, ctx),
  };
}

// CHUNK-MONOLITH

module.exports = {
  check,
  checkClose,
  partial,
  test,
  perf,
  perfRow,
  complexityFlat,
  complexityScales,
  printProbe,
  seededRandom,
  holes,
  getById: byId,
  resetTimers,
  getLastTimeoutMs,
  fireNextTimeout,
  fireInterval,
  setFetchQueue,
  getFetchCalls,
  resetFetchCalls,
  flush,
  loadServices,
  loadMonolith,
  loadRealDom,
  pollLatencies,
  crossArch,
  spaceProbes,
  toMs,
  stats: () => ({
    passed,
    failed,
    partialCount,
    failures,
    partials,
    perfRows,
    testRows,
    complexityProbes,
    crossArch,
    spaceProbes,
    tests: testRows.length,
    assertions: passed + failed,
  }),
};
