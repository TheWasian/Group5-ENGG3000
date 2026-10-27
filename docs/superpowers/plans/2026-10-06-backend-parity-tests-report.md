# Backend Parity + Test Suite + Week 5–8 Report — Implementation Plan

> **For agentic workers:** execute task-by-task with `executing-plans`. Steps use `- [ ]` checkboxes.
> Plan approved by the owner in-session (2026-10-06, "finish it … I will do that after your done").

**Goal:** bring `UI-Code/backend/services/` + `GameView.js` to parity with the live frontend game, restore and evolve the trashed test suite (new moles, hammer, parity, complexity), and generate `TEST-REPORT.md` + `TEST-REPORT.html` showing Week 5 → Week 8 progression with time/space complexity comparing monolith vs microservices.

**Architecture:** the live page (`index.html` → `gameLogic.js`) stays untouched and remains the reference implementation; the modular backend (`main.js` + `services/*`) is updated to implement exactly the same rules and is verified by a Node test harness that loads the real browser scripts into a fake DOM. The monolith is loaded into an isolated `vm` context so the two architectures never share globals.

**Tech stack:** Node.js only (no npm dependencies), plain browser scripts under test via `eval`/`vm`, fake DOM in `tests/helpers.js`, child processes for monolith timing/heap probes, Markdown + self-contained HTML report.

**Spec:** `docs/superpowers/specs/2026-10-06-backend-parity-tests-report-design.md` (source of truth for rules, decisions D1–D9, report sections).

## Global Constraints

- **NEVER run `git commit`, `git add`, or any history-writing command.** The owner commits everything. Allowed git: `git rebase --quit` (Task 1) and read-only commands (`status`, `diff`, `log`, `show`).
- **Do not touch `ESP-32 Code/`** — not firmware, not its tests. `node "ESP-32 Code/tests/game_backend_test.cjs"` runs only as a read-only regression check.
- **Do not edit frontend-owned files**: `UI-Code/index.html`, `UI-Code/styles.css`, `UI-Code/backend/gameLogic.js`. Their gaps are *reported*, not fixed.
- All timings presented in **ms** (D8); internal `hrtime.bigint()` allowed, converted at presentation.
- Some tests are **expected to fail/partial** (D7): `#hammer-cursor`, streak integration, ice/fire live-path. Never hide them.
- Weekly Logs deletions in `git status` are the owner's; leave untouched.

## File Structure (after this plan)

```
UI-Code/backend/
  services/{LevelingService,MoleService,GameService,StreakService,EnvironmentService}.js  edited
  GameView.js                                 edited (.css-mole fix, variant class, frozen timer)
  main.js                                     unchanged (occupancy guard kept)
  tests/
    helpers.js            restored + upgraded (week tags, ms, partial, vm monolith loader)
    run-tests.js          rewritten (suits + writes .md and .html)
    report-html.js        NEW self-contained dark HTML report
    bench-monolith.js     NEW child process: monolith timing probes (ms)
    bench-space.js        NEW child process --expose-gc: heap probes
    test-leveling.js test-mole.js test-streak.js test-conditions.js
    test-game-service.js test-gameview.js test-sensor.js test-connection.js
    test-wiring.js        restored + evolved (new rules, week tags)
    test-parity.js        NEW service rules == gameLogic.js rules
    test-hammer.js        NEW sensor hammer + hammer-cursor gap
    test-complexity.js    evolved (ms, monolith vs services, heap)
    baseline/TEST-REPORT-2026-09-22.md   frozen Sep-22 run (D6)
    TEST-REPORT.md  TEST-REPORT.html     generated
docs/superpowers/specs/…-design.md        already written
docs/superpowers/plans/…-report.md        this file
```

---

## Task 1 — Restore suite + housekeeping

- [ ] Copy from `~/.Trash/` into `UI-Code/backend/tests/`: `helpers.js`, `run-tests.js`, `test-*.js` (10 files), `TEST-REPORT.md`.
- [ ] `mkdir -p tests/baseline` and move the copied `TEST-REPORT.md` → `tests/baseline/TEST-REPORT-2026-09-22.md` (D6).
- [ ] `git rebase --quit` — clears the paused `pick 937ff37` todo **without committing** (D5). Re-check `git status`: nothing staged, no new commits, `HEAD` still `99fb373`.
- [ ] Apply `937ff37`'s GameView `.css-mole` fix **by hand in Task 6** (its `helpers.js` copy is restored from Trash; its `main.js` hunk is already in current `main.js`).
- [ ] Verify `git status` still shows only the owner's deletions + untracked `tests/` and `docs/`.

## Task 2 — Upgrade `tests/helpers.js`

- [ ] `test(section, name, fn, opts)` → `opts.week` (number) recorded on the row; default `8`.
- [ ] `h.partial(name, reason)` → increments `partial`, logs `PARTIAL`, pushes `{name, reason}`; the running row is flagged `partial: true` but still counts as passed (row result column prints `PARTIAL`).
- [ ] `stats()` also returns `partials` and totals `{tests, assertions}` for the report banner.
- [ ] All timing helpers gain ms fields: `perf()` rows get `avgMs = avgNs / 1e6`; `complexityFlat`/`complexityScales` rows get `bestMs/worstMs/avgMs` per size (ns ÷ 1e6).
- [ ] `loadMonolith()` → `vm` sandbox with **fresh** fake holes/elements, fake `performance`, no-op `requestAnimationFrame`, captured-but-unrun timers, stub `GameView`/`SensorService`, `window.addEventListener`; returns `{ ctx, src, read(expr) }` where `read` = `vm.runInContext(expr, ctx)` (script-level `const`/`let` are visible to later scripts in the same context).
- [ ] Export everything the new suites need; keep the existing fake DOM/timers/fetch/localStorage untouched.

## Task 3 — `LevelingService` parity + `test-leveling.js`

`services/LevelingService.js`:

- [ ] `MAX_LEVEL: 3`, `WIN_AT: 2000`.
- [ ] `getLevel`: `>=1000 → 3`, `>=500 → 2`, else `1`.
- [ ] `minScoreForLevel`: `{1:0, 2:500, 3:1000}`.
- [ ] `getSettings`: `1:{3500,3200}`, `2:{2200,1800}`, `3:{1400,1100}` (`spawnEvery`/`moleStaysUp`).
- [ ] `bandFor`: `1:{0,500,"Level 2"}`, `2:{500,1000,"Level 3"}`, `3:{1000,2000,"Win"}`.
- [ ] `getProgress`/`getProgressInBand` unchanged in shape (clamped `done`, `total`, `label`) — they now naturally match the live `updateProgress()`.

`tests/test-leveling.js` — re-spec to the 3-level table, `{week: 5}`:
- level bands `0/499/500/999/1000/1999`, win at 2000 not 1999;
- spawn/lifetime table per level (assert all three levels);
- progress bar bands: `getProgress(150).total === 500`, `(900).label === "Level 3"` wait — L2 band label is "Level 3", `(1500).label === "Win"`, `total 1000`; clamping below band pins `done` to 0;
- `h.perf("LevelingService.getLevel", …, ms)` kept.

## Task 4 — `MoleService` parity + `test-mole.js`

`services/MoleService.js`:

- [ ] `POINTS = { normal: 50, bomb: 0, golden: 200, frozen: 50 }`.
- [ ] `GOLDEN_LIFETIME_FACTOR = 0.75`, `FREEZE_SECONDS = 5`.
- [ ] `SPAWN_CHANCES` (odds sum to 1, from spec §4.1):

  | level | bomb | golden | frozen | normal |
  |---|---|---|---|---|
  | 1 | 0.10 | 0.15 | 0.08 | 0.67 |
  | 2 | 0.25 | 0.15 | 0.08 | 0.52 |
  | 3 | 0.40 | 0.15 | 0.08 | 0.37 |

- [ ] Remove `speedy`/`dark`/`toxic`, `SPEEDY_UPTIME`, `TOXIC_TIME_COST`.
- [ ] `variantFor(type, level)` → `has-golden` / `has-frozen`; L2 `normal→has-normal-ice`, `bomb→has-bomb-ice`; L3 `normal→has-normal-fire`, `bomb→has-bomb-fire`; otherwise `""` (L1 keeps the plain type class only).
- [ ] `pickType(level, rng)` unchanged mechanism (seeded rng supported).

`tests/test-mole.js` — `{week: 6}`:
- legend table checks for the new roster (50/0/200/50, factor 0.75, freeze 5s, absence of speedy/dark/toxic);
- every level's odds sum to 1;
- seeded 30k-pick distribution per level within ±0.015 (bomb 0.10/0.25/0.40, golden 0.15, frozen 0.08);
- `variantFor` matrix for L1/L2/L3 × normal/bomb/golden/frozen.

## Task 5 — `GameService` parity + `test-game-service.js` / `test-conditions.js`

`services/GameService.js`:

- [ ] `newGame()` gains `freezeTicksLeft: 0` (keep `streak`/`multiplier` fields, documented as unused by scoring per D7).
- [ ] `spawnMole(forcedType, forcedHole)`:
  - golden lifetime `staysUp × MoleService.GOLDEN_LIFETIME_FACTOR`;
  - `GameView.showMole(hole, type, MoleService.variantFor(type, g.level))`;
  - drop the `speedy` uptime branch.
- [ ] `whack()` dispatch: `bomb → hitBomb()`, `golden → hitGolden()`, `frozen → hitFrozen()`, else `hitNormal()`. No `StreakService` multiply anywhere; remove `hitDark`/`hitToxic`/`hitScoring`.
  - `hitNormal`: `+MoleService.POINTS.normal`, message `"Whack! +50 points"`;
  - `hitBomb`: `loseLife("Boom!")`, points 0;
  - `hitGolden`: `+200`, message `"Golden Mole! +200 points!"`;
  - `hitFrozen`: `+50` then `this.freezeTimer(MoleService.FREEZE_SECONDS)`, message `"Frozen Mole! +50 points! Timer frozen for 5s!"`;
  - each returns `{hit:true, points}` (bomb `{hit:true, bomb:true}`) and runs `applyLevel/refreshProgress/checkEnd` where the live path does.
- [ ] `freezeTimer(seconds)`: `g.freezeTicksLeft += seconds`, `GameView.setTimer(g.timeLeft, true)`.
- [ ] `tickSecond()`: if `freezeTicksLeft > 0` → decrement it, `GameView.setTimer(timeLeft, freezeTicksLeft > 0)`, on reaching 0 `GameView.say("Freeze ended! Keep whacking!")`, **return without touching the clock or `checkEnd()`** (matches live `tick()`); else decrement clock, `setTimer(timeLeft, false)`, `checkEnd()`.
- [ ] `onMoleMissed()`: read `type` first; hide; **lose a life only when `type === "normal"`** (`"Too slow! You missed the mole!"`); bomb/golden/frozen expiry is free. No streak calls.
- [ ] `whack()` wrong-hole branch: no `StreakService.miss()`; just the existing message.
- [ ] `start()`/`reset` path resets `freezeTicksLeft` and calls `GameView.setTimer(t, false)`.

`tests/test-game-service.js` — `{week: 6}`:
- start/reset, scoring matrix (normal +50 flat ×3 hits stays +150, no multiplier), bomb −1 life/0 pts, golden +200, frozen +50 + freeze, escapes (normal costs a life, bomb/golden/frozen do not), golden short lifetime (`getLastTimeoutMs() === 2400` at L1, `1350` at L2), win at 2000, lose at 0 lives, freeze tick consumption.

`tests/test-conditions.js` — `{week: 5}`:
- theme table now `1 grassland / 2 freezing / 3 fire`, unknown → grassland (toxic/void kept as unused hooks);
- win/lose/timeout/playing unchanged; high-score block unchanged.

## Task 6 — `GameView` parity + `test-gameview.js`

`GameView.js`:

- [ ] Apply `937ff37`'s fix: face is written **inside** `.css-mole`, the art's element children are preserved and re-appended, `<img>` fallback still works (exact code from `git show 937ff37`).
- [ ] `showMole(holeIndex, moleType, variantClass)` → `mole.className = "mole mole-" + moleType + (variantClass ? " " + variantClass : "")`.
- [ ] `hideAllMoles()` also strips `has-bomb has-golden has-frozen has-normal-ice has-bomb-ice has-normal-fire has-bomb-fire` from each mole so a stale skin can't survive a hide.
- [ ] `setTimer(timeLeft, frozen)` → text + `this.timer.classList.toggle("frozen", !!frozen)`.
- [ ] Face map updated for the new roster: `{ bomb: "💥", golden: "🌟", frozen: "❄️" }` (normal → `""`).

`tests/test-gameview.js` — `{week: 7}`:
- restored legacy tests (img fallback, css-mole keeps pieces) — they must now pass against the fixed `showMole`;
- new: variant class lands on the mole (`showMole(2,"normal","has-normal-ice")` → className contains it; `hideAllMoles` clears it);
- new: `setTimer(42, true)` adds `frozen`, `setTimer(41, false)` removes it.

## Task 7 — `StreakService` docs + `test-streak.js` (expected partial)

- [ ] `services/StreakService.js`: keep logic; header comment records it is a **standalone optional module, not wired into scoring** (D7) — the live game has no streaks.
- [ ] `tests/test-streak.js` — `{week: 5}`: keep the unit maths tests (they PASS) and **add one integration test**:
  - start a game, land 5 forced `spawnMole("normal", …)` + `whack` hits, assert `GameService.game.streak === 5` → it will not be tracked, so call `h.partial("streak tracked during play", "streaks not processed — services score flat (D7), frontend has no streak")`.
  - Result column reads `PARTIAL`; exit code unaffected (partial ≠ failed).

## Task 8 — NEW `test-parity.js` + `test-hammer.js` (week 8)

`tests/test-parity.js` — asserts services ≡ `gameLogic.js`:
- [ ] Load the monolith once via `h.loadMonolith()`; read constants with `read("POINTS_PER_MOLE")` etc. and `check` each against `MoleService`/`LevelingService`/`GameService` values: `POINTS_PER_MOLE↔POINTS.normal`, `GOLDEN_POINTS`, `GOLDEN_CHANCE↔SPAWN_CHANCES[l].golden`, `FROZEN_CHANCE`, `FREEZE_SECONDS↔MoleService.FREEZE_SECONDS`, `GOLDEN_LIFETIME_FACTOR`, `LEVEL_2_AT/LEVEL_3_AT/WIN_AT`, `ROUND_TIME`, `STARTING_LIVES`.
- [ ] Bomb chance per level: regex-extract `bombChance = 0.xx` triples from the source (they are `let`-assigned inside `spawnMole`, not top-level constants) and compare with `SPAWN_CHANCES[l].bomb`.
- [ ] Per-level spawn/lifetime: `read("SPAWN_INTERVAL")` at load (3500) then `read("(function(){ score=500; checkLevel(); updateLevel(); return SPAWN_INTERVAL })()")` for L2 and again at 1000 for L3 — assert against `LevelingService.getSettings`. (Needs `GameView` stub already injected by `loadMonolith`.)
- [ ] Scoring behaviour: in the sandbox force a spawn and a whack, read `score`, assert +50 flat / +200 golden / bomb `lives−1`.
- [ ] A trailing `h.partial("ice/fire variant classes added by the live path", "only the services add them — frontend gap")` row: grep `gameLogic.js` for `has-normal-ice|has-bomb-ice|has-normal-fire|has-bomb-fire` → absent ⇒ partial, recorded as a known gap.

`tests/test-hammer.js` — `{week: 8}`:
- [ ] Sensor hammer: `SensorService` receives a fresh `held` hit and moves the `player-marker` to that hole; offline hides it (restore/evolve the existing sensor-marker expectations).
- [ ] Whack wiring: `SensorService.onHit(hole, "mouse")`-style call scores through `GameService.whack(…, "sensor")`.
- [ ] `check("hammer-cursor styled and wired", …)` reading `UI-Code/styles.css` + `gameLogic.js` for `#hammer-cursor` → **expected FAIL**, marked `known: true` so the report lists it under Known gaps (frontend-owned, removed by `df8fe44`).

## Task 9 — Complexity (ms) + heap probes

`tests/test-complexity.js` — `{week: 8}`, restored probes kept, all reported in ms:
- [ ] O(1) probes (10 attempts): `LevelingService.getLevel`, `MoleService.pickType`, `StreakService.hit`, `HighScoreService.get`, `GameService.whack` pipeline — flat verdict.
- [ ] O(s) probe: `SensorService.getPlayerPosition` at sizes 2/20/200.
- [ ] **Cross-architecture timing**: spawn `bench-monolith.js` in a child process, parse its JSON, compare with the same probes run in-process on the services:
  | operation | monolith | services |
  |---|---|---|
  | score a normal hit | `whackHole()` | `GameService.whack()` |
  | pick a mole type | inline spawn roll (`spawnMole`) | `MoleService.pickType()` |
  | compute level | `checkLevel()` | `LevelingService.getLevel()` |
  Reported as `ms/op` (and `ms per 1,000 ops` for sub-µs work), best/avg/worst of 10.
- [ ] **Space**: spawn `bench-space.js --expose-gc <monolith|services>` (best of 3 runs) → `{loadKB, gameKB, deltaKB}` after load + after a scripted 2000-point game; plus the analytical table (state footprint, per-poll buffer, per-op temporaries) written into the report by Task 10.
- [ ] Verdict text: both architectures are O(1) in game state; the split changes constant structure and isolation, not asymptotic order.

`tests/bench-monolith.js` (child): builds the `vm` sandbox (same code path as `h.loadMonolith`), times the three operations 10×, prints one JSON object to stdout.
`tests/bench-space.js` (child, `--expose-gc`): loads one path, `gc()`, records `heapUsed`; runs the scripted game; `gc()`; records again; prints JSON. Services path reuses `require("./helpers").loadServices()`.

## Task 10 — Runner + `TEST-REPORT.md` + `TEST-REPORT.html`

`tests/run-tests.js` — rewritten:
- [ ] Suite list (order = week order): `test-leveling`(5), `test-streak`(5), `test-conditions`(5), `test-wiring`(5), `test-mole`(6), `test-game-service`(6), `test-gameview`(7), `test-sensor`(8), `test-connection`(8), `test-hammer`(8), `test-parity`(8), `test-complexity`(8).
- [ ] Calls `writeMarkdown()` and `writeHtml()` from `report-html.js`, prints the summary, `process.exit(failed ? 1 : 0)` (partials do not fail the run).
- [ ] Console output stays greppable: `PASS …`, `FAIL …`, `PARTIAL …`.

`tests/report-html.js` — exports `{ writeMarkdown, writeHtml }`, both built from one shared data object (`h.stats()` + baseline file):

1. **`TEST-REPORT.md`** — plain markdown, the 11 spec §6 sections, tables only.
2. **`TEST-REPORT.html`** — single file, `<style>` embedded, dark theme (bg `#0d1117`, card `#161b22`, accent `#58a6ff`, ok `#3fb950`, fail `#f85149`, warn `#d29922`), zero external requests:
   - summary banner: date, run command, tests/assertions/pass/fail/partial, and the note *"all frontend/backend timings are in milliseconds (ESP32 measurement excluded)"*;
   - §2 polling: best/avg/worst **ms**, 75 ms interval, % of interval, polls/sec;
   - §3 connection matrix; §4 per-service table (service · tests · assertions · failed) then the full test table (test · method · n · result · **ms** · week);
   - §5 mole coverage matrix incl. bomb/golden/frozen/ice/fire/hammer rows;
   - §6 **Week 5 → 8 progression**: CSS grouped bar chart (tests + assertions per week), cumulative line (SVG polyline from the Sep-22 baseline 145 assertions → new total), per-week cards, and a CSS **progress bar** vs baseline;
   - §7 speed (ms/op, ops/sec); §8 complexity (time tables monolith vs services + O() verdicts, space tables heap KB + analytical); §9 architecture comparison table (time · space · change isolation · test granularity · failure isolation · wiring complexity); §10 known gaps (streak partial, hammer-cursor, `environments*.css` 404, ice/fire unused live) each with owner + suggested fix; §11 Sep-22 baseline quoted verbatim.
- [ ] Charts are inline SVG + CSS only (no JS libraries); tables are semantic `<table>`.

## Task 11 — Verification

- [ ] `node tests/run-tests.js` from `UI-Code/backend` → prints summary, writes both reports; expected honest outcome: majority PASS, ≥1 `PARTIAL` (streak, ice/fire live-path), exactly 1 FAIL (`#hammer-cursor`, known).
- [ ] `node "ESP-32 Code/tests/game_backend_test.cjs"` → same result as before these changes (31/31).
- [ ] `open tests/TEST-REPORT.html` renders offline, no console/network errors.
- [ ] Spot-check: parity table matches spec §4.1; week totals follow D3; every timing column labelled ms.
- [ ] `git status` — only the owner's Weekly Logs deletions, `.DS_Store`, plus untracked `UI-Code/backend/tests/` and `docs/`. **Nothing staged, no commits.**

## Risks

| Risk | Mitigation |
|---|---|
| `937ff37` rebase conflicts | `git rebase --quit` first; GameView fix re-applied by hand in Task 6 from `git show`. |
| Trash files purged by macOS | Copy out of `~/.Trash/` as the very first action (Task 1). |
| Heap numbers noisy | Best of 3 child runs, deltas reported, variance noted. |
| Sub-µs timings unreadable in ms | Show ms/op with decimals **and** ms per 1,000 ops. |
| Parity test brittle to frontend edits | Derives expectations from `gameLogic.js` itself — drift must fail loudly. |
| Monolith `vm` load runs top-level side effects | Sandbox timers are captured-not-run, `requestAnimationFrame` no-op, `SensorService`/`GameView` stubbed. |

