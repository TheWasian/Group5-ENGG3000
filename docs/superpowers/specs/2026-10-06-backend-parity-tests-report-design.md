# Design: Backend parity, test suite evolution, and Week 5–8 progression report

Date: 2026-10-06
Status: approved (sections 1–4 presented and confirmed in session)
Repo: Group5-ENGG3000 · unit ENGG3000 · Whack-A-Mole

---

## 1. Context and problem

The repo has two backends for the same game:

- **Live path** — `UI-Code/index.html` loads `GameView.js`, `SensorService.js`, `gameLogic.js`. The frontend team (Shreenidhi, Fouad) evolved this monolith: new moles (bomb, freeze, golden), new scoring (+50 / +200), 3 levels (500/1000, win 2000), ice/fire mole variants, hammer elements, performance metrics.
- **Modular path** — `main.js` + `services/` (GameService, MoleService, LevelingService, StreakService, EnvironmentService, GameConditionService, HighScoreService) is the author's state-machine/microservice refactor. It is **not loaded by index.html** and still implements the *old* rules (normal/speedy/dark/toxic/golden, points 10/20/−15/30/50 with streak multiplier, 5 levels at 200-point bands).

A previous session built a 26-test / 145-assertion suite (`tests/helpers.js`, `run-tests.js`, nine `test-*.js`) plus `TEST-REPORT.md`, but the suite was moved to `~/.Trash/` on 2026-10-05, and a commit (`937ff37` — GameView `.css-mole` fix + `helpers.js`) is stuck in a paused rebase.

**Goal:** bring the modular backend to parity with the live frontend, restore and evolve the test suite (including tests for the new moles and the hammer), and produce a report showing gradual progression from Week 5 → Week 8 with time and space complexity comparing the monolithic and microservice architectures.

**Non-goals:** no ESP32 changes (its `ESP-32 Code/tests/game_backend_test.cjs` stays untouched); no edits to `index.html`, `styles.css`, or `gameLogic.js` (frontend-owned — gaps are reported, not fixed); no swapping the live path over to `main.js` + services.

---

## 2. Decisions (confirmed with user)

| # | Decision |
|---|---|
| D1 | **Scope** — update `services/` + `GameView.js` to parity with the live frontend. `index.html` keeps loading `gameLogic.js`; the frontend team stays in control of the live path. |
| D2 | **Deliverables** — `TEST-REPORT.md` (plain baseline) **and** `TEST-REPORT.html` (self-contained, embedded CSS, dark theme, HTML tables + CSS/SVG charts, no CDN so it works offline). |
| D3 | **Week mapping** — every legacy test keeps the week tag it had in the Sep-22 report (W5 core game logic · W6 mole behaviour & scoring · W7 frontend & rendering · W8 sensor service & performance), including tests that were only re-specced to the new rules; every brand-new test is attributed to **Week 8** (current week). Charts show growth 5 → 8. |
| D4 | **Space complexity** — measured: each path runs in a fresh Node child process with `--expose-gc`, reporting `heapUsed` delta after load and after a simulated game; plus an analytical table (state footprint, per-poll buffers, per-op allocations). |
| D5 | **Housekeeping** — finish the paused rebase (`pick 937ff37`), stashing the `Weekly Logs` deletion first and restoring it after; restore the suite from `~/.Trash/`. If the rebase cannot be finished cleanly, fall back to folding `937ff37`'s changes in by hand (user: "you can finish it … or leave it"). |
| D6 | **Old tests** — evolve in place; freeze the Sep-22 run as `tests/baseline/TEST-REPORT-2026-09-22.md` and quote it in the new report as the historical baseline. |
| D7 | **Scoring** — exact frontend parity (flat points, no streak multiplier applied). `StreakService.js` remains as a documented standalone module with its own unit tests, and an **integration test is expected to report a partial failure** because streaks are not processed by the current pipeline. Honest failures are desirable: they are evidence the tests work. |
| D8 | **Units** — team decision: **all frontend and backend performance is measured and reported in milliseconds (ms)**. ESP32 measurement is out of scope and keeps its own conventions. Internally the harness may still use `hrtime.bigint()` for precision; presentation converts to ms. |
| D9 | **Progress bar** — the services' progress bar must work like the live game (bands fixed as part of parity), and the report includes progress-bar style visuals showing growth against the baseline. |

---

## 3. Current-state facts (verified in repo)

- `index.html` links `environments.css` and `environments-fx.css`; **neither file exists anywhere** (styles were merged into `styles.css`). 404 on page load.
- `#hammer-cursor` markup exists in `index.html` but **no CSS rule and no JS** references it (removed by commit `df8fe44`). Dead markup.
- CSS classes `.mole.has-normal-ice`, `.has-bomb-ice`, `.has-normal-fire`, `.has-bomb-fire` exist in `styles.css`, but **nothing ever adds them** (`gameLogic.js` only adds `has-bomb`, `has-golden`, `has-frozen`).
- `SensorService.js` already handles both firmware protocols (AP v2 with `position`/`held`/`game_area`, and MVP event-only) and owns the `player-marker` (sensor hammer) placement.
- The live game has **no streak display** and no speedy/dark/toxic moles (legend entries commented out).
- Old suite results (archived): 26 tests, 145 assertions, 0 failed, with one informational "Partial FAIL" row (`golden pays +50 X streak → +50 but no streaks`).

---

## 4. Backend parity specification

### 4.1 Rules table (target behaviour — identical in both paths)

| Rule | Value |
|---|---|
| Normal mole | +50 points, flat |
| Bomb mole | −1 life, 0 points, streak irrelevant |
| Golden mole | +200 points, lifetime × 0.75 |
| Frozen mole | +50 points, freezes the countdown for 5 s |
| Escape (mole times out) | costs a life **only for `normal`**; bomb/golden/frozen expiry costs nothing |
| Spawn odds L1 / L2 / L3 | bomb 10% / 25% / 40%; golden 15%; frozen 8%; remainder normal |
| Levels | L1 0–499, L2 500–999, L3 1000–1999; win at 2000 |
| Spawn interval / mole lifetime | L1 3500/3200 ms, L2 2200/1800 ms, L3 1400/1100 ms |
| Environment theme | L1 grassland, L2 freezing, L3 fire |
| Progress bar bands | 0/500 → "Level 2", 500/1000 → "Level 3", 1000/2000 → "Win"; width = clamped `(score − from) / (to − from)` |
| Freeze semantics | each countdown tick is consumed while `freezeTicksLeft > 0`; clock does not drop; on expiry show "Freeze ended" |
| Round | 300 s, 3 starting lives, win/lose screens unchanged |

### 4.2 Ice / fire variant classes

Variant skin is derived from the level theme while the mole is on screen:

- L2 (freezing): `normal → has-normal-ice`, `bomb → has-bomb-ice`
- L3 (fire): `normal → has-normal-fire`, `bomb → has-bomb-fire`
- `golden`, `frozen` keep their own classes (`has-golden`, `has-frozen`)

This makes the services the first code that actually *uses* those CSS hooks; the report records that the live path never adds them (frontend gap).

### 4.3 Per-file changes

| File | Change |
|---|---|
| `services/MoleService.js` | `POINTS = { normal: 50, golden: 200, frozen: 50, bomb: 0 }`; `GOLDEN_LIFETIME_FACTOR = 0.75`, `FREEZE_SECONDS = 5`; per-level `SPAWN_CHANCES` from the odds table; `variantFor(type, level)` returning `has-*` class name; `pickType(level, rng)` keeps seeded-rng support for distribution tests. `speedy`/`dark`/`toxic` leave `POINTS` and `SPAWN_CHANCES`, and `SPEEDY_UPTIME`/`TOXIC_TIME_COST` are removed with them. |
| `services/GameService.js` | `whack()` dispatch: bomb → `loseLife("Boom!")`, golden → +200, frozen → +50 + `freezeTimer(5)`, normal → +50; scoring is flat (no `StreakService` multiply); `hitDark()`/`hitToxic()` are removed with their moles; `onMoleMissed()` only costs a life when the escaping mole was `normal`; a golden mole's own lifetime is `staysUp × GOLDEN_LIFETIME_FACTOR` (set when it spawns); `tickSecond()` consumes freeze ticks before decrementing the clock; `spawnMole()` applies variant classes via `GameView.showMole(hole, type, variant)`. |
| `services/LevelingService.js` | `MAX_LEVEL: 3`, `WIN_AT: 2000`; `getLevel` bands 0/500/1000; `getSettings` table 3500/3200, 2200/1800, 1400/1100; `bandFor`/`getProgressInBand` produce the progress-bar values above. |
| `services/EnvironmentService.js` | `themeFor` → 1 grassland, 2 freezing, 3 fire (toxic/void retained as unused hooks, documented). |
| `services/StreakService.js` | unchanged logic; header comment records it is a standalone optional module no longer wired into scoring (D7). |
| `GameView.js` | adopt the `937ff37` fix: write the face **inside** `.css-mole`, preserve the art's element children, keep the `<img>` fallback; `showMole(holeIndex, moleType, variantClass)` adds/removes `has-*` classes; `setTimer` exposes freeze state (`frozen` class) so the view can show it. |
| `main.js` | keep the occupancy guard; wire the freeze display; otherwise unchanged. |
| `services/HighScoreService.js`, `GameConditionService.js` | unchanged (win at 2000 already matches). |

Error handling stays as-is: services assume DOM elements exist (the test harness supplies fakes); no new throw paths are introduced; `HighScoreService` already tolerates blocked `localStorage`.

---

## 5. Test suite specification

### 5.1 Layout (restored + extended, all in `UI-Code/backend/tests/`)

```
tests/
  helpers.js              restored from 937ff37/Trash; ms reporting; week tags; heap helpers
  run-tests.js            restored; runs suites; writes TEST-REPORT.md + TEST-REPORT.html
  test-leveling.js        evolved (3 levels, progress bar bands, spawn table)
  test-mole.js            evolved (new roster, spawn odds, lifetimes, variant classes)
  test-streak.js          evolved (module unit tests PASS + integration partial FAIL)
  test-conditions.js      evolved (win 2000 / 0 lives / 0 s)
  test-game-service.js    evolved (start/reset, bomb/freeze/golden handling, escape rules)
  test-gameview.js        evolved (.css-mole face fix, has-* classes, img fallback)
  test-sensor.js          unchanged expectations (position parsing, both ESP32 formats)
  test-connection.js      unchanged expectations (fresh/duplicate/stale/busy/offline/reconnect)
  test-wiring.js          evolved (buttons/holes wired to GameService)
  test-parity.js          NEW: service rules == live gameLogic.js rules
  test-hammer.js          NEW: sensor hammer marker + whack wiring + hammer-cursor gap
  test-complexity.js      evolved: monolith vs services time probes (ms) + heap space probes
  baseline/TEST-REPORT-2026-09-22.md   frozen old run (D6)
  TEST-REPORT.md          generated
  TEST-REPORT.html        generated
  Example_from_Claude/    kept (format reference)
  Old_tests_pdf/          kept (old-report reference)
```

Run command (unchanged): `node tests/run-tests.js` from `UI-Code/backend`, no libraries.

### 5.2 New and changed tests (with week tag and expected status)

Week tags: **new = added now (Week 8)**; **evolved = pre-existing test re-specced to the new rules, keeps its original Sep-22 week tag**.

| Test | Week | Method | Expected |
|---|---|---|---|
| normal pays exactly +50 (no streak multiplier) | evolved W6 | simulated | PASS |
| bomb costs a life and pays nothing | new | simulated | PASS |
| bomb expiry costs nothing | new | simulated | PASS |
| golden pays +200 and lives 25% less | evolved W6 | simulated | PASS |
| frozen pays +50 and freezes the clock 5 s | new | simulated | PASS |
| frozen ticks consume freeze, not the clock | new | simulated | PASS |
| spawn odds per level (30k seeded picks) | evolved W6 | simulated | PASS |
| variant class per level (ice at L2, fire at L3) | new | simulated | PASS |
| level bands 0/500/1000 + win at 2000 | evolved W5 | direct | PASS |
| progress bar bands (0/500, 500/1000, 1000/2000) | new | direct | PASS |
| service rules == live gameLogic rules (`test-parity.js`) | new | simulated | PASS (drift ⇒ FAIL) |
| timer shows the frozen state (`GameView.setTimer`) | new | simulated | PASS |
| sensor hammer moves to detected hole / hides offline | evolved W8 | simulated | PASS |
| `#hammer-cursor` has styling + wiring | new | direct | **FAIL (known gap, frontend-owned)** |
| streak module maths | evolved W5 | direct | PASS |
| streak applied during play | new | simulated | **Partial FAIL — streaks not processed (D7)** |
| ice/fire classes added by the live path | new | direct | **Partial FAIL — only the services add them** |
| legacy suites (conditions, game-service, gameview, sensor, connection, wiring, bot game) | evolved W5–W8 | as before | PASS |
| O(1) probes: getLevel, pickType, whack pipeline (both paths) | evolved W8 | timed 10× | PASS |
| O(s) probe: `getPlayerPosition` scans s sensors | evolved W8 | timed 10× | PASS |
| heap: monolith path vs services path, load + game | new | child process | informational |

Failed/partial rows are **not** hidden — they are the honest evidence the suite detects real gaps (D7).

The parity test (`test-parity.js`) reads the monolith's own constants (`POINTS_PER_MOLE`, `GOLDEN_POINTS`, `GOLDEN_CHANCE`, `FROZEN_CHANCE`, `LEVEL_2_AT`, `LEVEL_3_AT`, `WIN_AT`, bomb-chance branches) out of the `gameLogic.js` vm context and asserts the services agree with them, so future frontend edits fail this test loudly instead of drifting silently.

### 5.3 Complexity measurement (D8: everything presented in ms)

**Time.** Each probe runs the same operation 10 times (best/worst/avg) on both paths where an equivalent exists:

| Operation | Monolith (`gameLogic.js`) | Services |
|---|---|---|
| score a normal hit | `whackHole()` | `GameService.whack()` |
| pick a mole type | inline spawn roll | `MoleService.pickType()` |
| compute level | inline `checkLevel()` | `LevelingService.getLevel()` |
| full poll cycle | shared `SensorService.check()` | shared `SensorService.check()` |

Input-size sweeps (2 / 20 / 200) produce the O() verdicts: flat ⇒ O(1), linear growth ⇒ O(s)/O(n).
Presentation: `ms/op` (4–6 decimals where sub-µs) and, for tiny ops, `ms per 1,000 ops` so the numbers are readable in ms units. Poll latency is shown as ms per poll against the 75 ms interval.

**Space.** A child process (`node --expose-gc`) loads one path, forces GC, records `heapUsed`; then runs a scripted 2000-point game, forces GC again, records `heapUsed`; reports the delta in KB for both paths, plus an analytical table:

| Aspect | Monolith | Services |
|---|---|---|
| game state | module-level globals | one `GameService.game` object |
| rules | inline closures/constants | service singletons (constant space) |
| per poll | shared `lastData` copy | shared `lastData` copy |
| per hit | temporaries in `whackHole` | temporaries in `whack()` |
| expected order | O(1) state, O(1) per op | O(1) state, O(1) per op |

The report states the honest conclusion: both architectures are O(1) in game state; the microservice split changes *constant* structure and isolation, not asymptotic order — with measured heap numbers to back it.

---

## 6. Report specification (D2, D3, D9)

`run-tests.js` writes:

1. **`TEST-REPORT.md`** — plain markdown, same section list, tables only (regression-friendly diff).
2. **`TEST-REPORT.html`** — single file, embedded `<style>`, dark theme matching the example screenshots, semantic `<table>`s, inline SVG/CSS charts, zero external requests.

Sections:

1. Summary banner — tests, assertions, pass/fail, date, run command, **"all frontend/backend timings reported in ms (ESP32 excluded)"** convention note.
2. Polling speed — best/avg/worst **ms** per poll, 75 ms interval, % of interval used, polls/sec.
3. Connection consistency — scripted fetch queue table (fresh / duplicate / stale / busy / offline / reconnect).
4. Unit tests per service — service · tests · assertions · failed; then the full table: test · method · n · result · **ms** · week.
5. Mole coverage matrix — new roster rows (normal, bomb, golden, frozen, ice/fire variants, hammer) + how tested + result.
6. **Week 5 → 8 progression** — CSS/SVG grouped bar chart (tests and assertions per week), cumulative line chart (81 → … → new total), per-week cards (topic · tests · assertions · status marks), and a **CSS progress bar** showing growth versus the Sep-22 baseline (145 assertions).
7. Speed — ms/op and ops/sec for each measured operation.
8. **Complexity** — time tables (monolith vs services, ms, 10 attempts, input-size sweeps) with O() verdicts; space tables (heap KB, before/after game, both paths) with the analytical table.
9. Architecture comparison — monolithic vs microservices/statemachine across: time per operation (measured ms), space (measured KB), change isolation, test granularity, failure isolation, wiring complexity.
10. Known gaps & failures — streak partial fail, hammer-cursor dead, `environments.css`/`environments-fx.css` 404, ice/fire classes unused live — each with owner (frontend) and suggested fix.
11. Appendix — the Sep-22 baseline table quoted verbatim for side-by-side comparison.

---

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Rebase conflicts when re-applying `937ff37` | Stash the `Weekly Logs` deletion first; resolve by keeping current `main.js` occupancy guard and taking the `937ff37` GameView/helper changes; fall back to manual fold-in (D5). |
| Trashed files change (macOS Trash purges) | Copy the suite out of `~/.Trash/` as the first implementation step. |
| Heap numbers are noisy across Node runs | Report best of 3 child-process runs, note variance, present deltas rather than absolutes. |
| Sub-microsecond timings unreadable in ms | Report ms/op with enough decimals and ms-per-1,000-ops alongside. |
| Parity tests become brittle if the frontend changes again | `test-parity.js` derives expectations from `gameLogic.js` constants where possible, so drift fails loudly — that is the point. |

---

## 8. Verification

1. `node tests/run-tests.js` (from `UI-Code/backend`) → exit code reflects failures; `TEST-REPORT.md` + `TEST-REPORT.html` written; summary printed.
2. `node "ESP-32 Code/tests/game_backend_test.cjs"` → still passes with the same result as before these changes (31/31 as of the last run; regression, file untouched).
3. Open `TEST-REPORT.html` in a browser → charts render offline, tables complete, no console/network errors.
4. Spot-check: parity table matches the rules in §4.1; week totals match D3; every timing column is in ms.
5. `git status` clean except intentionally untracked/new files; `Weekly Logs` deletion restored as the user left it.

---

## 9. Out of scope

- ESP32 firmware and `ESP-32 Code/tests/*` (no measurement changes, no protocol changes).
- Frontend files (`index.html`, `styles.css`, `gameLogic.js`) — their gaps are documented in report §10 instead.
- Switching the live page to the modular backend.
- Replacing `gameLogic.js` or deleting `StreakService`.
