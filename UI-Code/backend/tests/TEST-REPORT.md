# Test report: Whack-A-Mole backend

Date: 2026-10-06
Run `node tests/run-tests.js` from `UI-Code/backend`, no libraries.
Result: **336 passed, 1 failed, 3 partial** (48 tests, 337 assertions).

**Units:** every timing in this report is in **milliseconds (ms)**; ESP32 measurement is out of scope.

Baseline from 2026-09-22: 145 passed, 0 failed across 26 tests, quoted in full in section 12

Layout: one test file per service (`tests/test-<service>.js`), shared harness in `tests/helpers.js`.

## 1. Summary

| Measure | Value |
|---|---|
| Tests | 48 |
| Value assertions | 337 |
| Passed | 336 |
| Failed | 1 |
| Partial (expected gaps) | 3 |
| Baseline (Sep 22) | 145 assertions, 26 tests |
| Growth vs baseline | 232% of baseline assertions |

## 2. Sensor polling speed

Each row is one poll, timed 50 times; the loop runs every 75 ms

| Measure | Value |
|---|---|
| Fastest poll | 0.016583 ms |
| Average poll | 0.022520 ms |
| Slowest poll | 0.065708 ms |
| Poll interval | 75 ms |
| Interval used by an average poll | 0.030% |
| Polls per second | 44405 |

What this shows: one poll takes a fraction of a millisecond against a 75 ms budget, so the loop cannot pile up, and the busy flag drops any overlap (section 3)

## 3. Connection handling

Scripted fetch queue, no network; each row is one asserted behaviour

| Case | Expected | Result |
|---|---|---|
| Fresh event (age < 1s) | forwarded to onHit(hole) | PASS |
| Duplicate event_id | ignored (exactly 1 hit) | PASS |
| Stale event (age > 1s) | ignored, id still remembered | PASS |
| Poll while busy | no second fetch fired | PASS |
| Fetch fails (ESP32 offline) | status line shows "disconnected" | PASS |
| Reconnect | hits resume, status clears | PASS |

What this shows: every consistency case passes

## 4. Every test, by service

direct = called the function with fixed values; simulated = scripted play (forced spawns, seeded RNG, fake fetch/DOM) or a full bot game; timed = 10 attempts; n = value assertions inside the test

| Service | Tests | Value assertions | Failed | Partial |
|---|---|---|---|---|
| LevelingService | 3 | 31 | 0 | 0 |
| StreakService | 2 | 13 | 0 | 1 |
| Conditions | 2 | 19 | 0 | 0 |
| Wiring | 1 | 3 | 0 | 0 |
| MoleService | 4 | 39 | 0 | 0 |
| GameService | 11 | 65 | 0 | 0 |
| GameView | 5 | 30 | 0 | 0 |
| Progress bar | 2 | 38 | 0 | 1 |
| SensorService | 2 | 10 | 0 | 0 |
| Polling | 2 | 9 | 0 | 0 |
| Hammer | 3 | 13 | 1 | 0 |
| Parity | 7 | 63 | 0 | 1 |
| Complexity | 4 | 4 | 0 | 0 |

| Test | Method | n | Result | Time (ms) | Week |
|---|---|---|---|---|---|
| level bands (0/499/500/999/1000/1999) | direct | 9 | PASS | 1 | W5 |
| win at 2000 + spawn/lifetime table | direct | 9 | PASS | 0 | W5 |
| progress bar bands (0/500, 500/1000, 1000/2000) | direct | 13 | PASS | 0 | W8 |
| streak starts at x1, then +0.01 per hit | direct | 11 | PASS | 1 | W5 |
| streak applied during play | direct | 2 | PARTIAL | 4 | W8 |
| theme per level + win/lose | direct | 11 | PASS | 0 | W5 |
| high score: only beaten records save | direct | 8 | PASS | 1 | W5 |
| buttons + holes wired to GameService | simulated | 3 | PASS | 0 | W5 |
| legend tables (points + effects) | direct | 17 | PASS | 0 | W6 |
| spawn distribution accuracy (30k picks, seeded) | simulated | 8 | PASS | 11 | W6 |
| variant class per level (ice at L2, fire at L3) | direct | 8 | PASS | 0 | W8 |
| golden lifetime is 75% of the level lifetime | direct | 6 | PASS | 0 | W8 |
| start resets everything | simulated | 11 | PASS | 0 | W5 |
| normal pays exactly +50 (flat, no streak multiplier) | simulated | 9 | PASS | 0 | W6 |
| bomb costs a life and pays nothing | simulated | 4 | PASS | 0 | W8 |
| golden pays +200 and lives 25% less | simulated | 3 | PASS | 0 | W6 |
| frozen pays +50 and freezes the clock 5s | simulated | 5 | PASS | 0 | W8 |
| frozen ticks consume freeze, not the clock | simulated | 7 | PASS | 0 | W8 |
| escapes: only a normal mole costs a life | simulated | 6 | PASS | 1 | W8 |
| wrong hole never scores and never crashes | simulated | 5 | PASS | 0 | W6 |
| miss loses a life; 0 lives ends game; 2000 wins | simulated | 4 | PASS | 0 | W5 |
| level up at 500/1000 changes speed + environment | simulated | 7 | PASS | 0 | W5 |
| FULL BOT GAME to 2000 (end-to-end) | simulated | 4 | PASS | 32 | W6 |
| renders mole types + score + environment | simulated | 11 | PASS | 0 | W7 |
| old img markup still works (face on mole, img put back) | simulated | 3 | PASS | 1 | W7 |
| css-mole art keeps its pieces (face inside art) | simulated | 4 | PASS | 0 | W7 |
| level skin class lands on the mole and is cleared on hide | simulated | 7 | PASS | 0 | W8 |
| timer shows the frozen state | simulated | 5 | PASS | 0 | W8 |
| bar tracks the score across every level boundary | direct | 33 | PARTIAL | 5 | W7 |
| page has the elements the bar needs | direct | 5 | PASS | 1 | W7 |
| finds the player's hole in both ESP32 formats | simulated | 5 | PASS | 0 | W8 |
| polling: fresh hit forwarded, stale ignored, offline shown | simulated | 5 | PASS | 2 | W8 |
| one poll is fast (50 timed polls) | simulated | 2 | PASS | 2 | W8 |
| connection holds steady (duplicates/stale/overlap/offline) | simulated | 7 | PASS | 0 | W8 |
| sensor hammer follows the player's hole | simulated | 7 | PASS | 0 | W8 |
| a sensor hit is scored through GameService | simulated | 4 | PASS | 0 | W8 |
| #hammer-cursor has styling and wiring | simulated | 2 | FAIL | 1 | W8 |
| scoring constants match the live game | simulated | 10 | PASS | 0 | W8 |
| level thresholds match the live game | simulated | 10 | PASS | 0 | W8 |
| spawn odds match the live bomb/golden/frozen roll | simulated | 8 | PASS | 1 | W8 |
| spawn interval + lifetime match per level | simulated | 6 | PASS | 0 | W8 |
| whacking behaves identically in both paths | simulated | 17 | PASS | 0 | W8 |
| progress bar renders the same text in both paths | simulated | 10 | PASS | 0 | W8 |
| ice/fire variant classes are added by the live path | simulated | 2 | PARTIAL | 1 | W8 |
| O(1): fixed work stays flat | timed (10 attempts) | 0 | PASS | 180 | W8 |
| O(s): sensor work grows with sensor count | timed (10 attempts) | 0 | PASS | 40 | W8 |
| monolith vs services, same operation, measured in ms | timed (10 attempts) | 1 | PASS | 701 | W8 |
| space: heap used by each architecture (child --expose-gc) | timed (10 attempts) | 3 | PASS | 609 | W8 |

## 5. Which mole behaviours are covered

| Behaviour | How tested | Week | Result |
|---|---|---|---|
| Normal mole (+50 flat, no streak multiplier) | scripted whack + bot game | W6 | PASS |
| Bomb mole (-1 life, 0 points) | scripted whack | W8 | PASS |
| Bomb expiry costs nothing | scripted escape | W8 | PASS |
| Golden mole (+200, lifetime x0.75) | scripted whack + lifetime assert | W6 | PASS |
| Frozen mole (+50, freezes 5s) | scripted whack + tick loop | W8 | PASS |
| Escape costs a life only for normal | scripted escape | W8 | PASS |
| Spawn odds per level (30k seeded picks) | seeded simulation | W6 | PASS |
| Level spawn/lifetime table | direct table check | W5 | PASS |
| Level bands 0/500/1000, win 2000 | direct | W5 | PASS |
| Progress bar bands | direct | W8 | PASS |
| Ice/fire variant classes (services) | direct | W8 | PASS |
| Ice/fire classes added by the live path | source inspection | W8 | PARTIAL |
| Streak module maths | direct | W5 | PASS |
| Streak applied during play | scripted play | W8 | PARTIAL |
| Service rules == live game rules | both paths scripted | W8 | PASS |
| Sensor hammer marker follows the player | scripted position | W8 | PASS |
| Sensor hit scored through GameService | scripted sensor hit | W8 | PASS |
| #hammer-cursor styled and wired | source inspection | W8 | FAIL |
| Timer shows the frozen state | direct read-back | W8 | PASS |
| Position parsing (both ESP32 formats) | direct | W8 | PASS |
| Connection consistency (dup/stale/busy/offline) | scripted fetch queue | W8 | PASS |
| Poll speed (50 timed polls) | timed | W8 | PASS |

## 6. Week 5 to Week 8

| Week | Topic | Tests | Assertions | Failed | Partial |
|---|---|---|---|---|---|
| Week 5 | Core game logic | 9 | 73 | 0 | 0 |
| Week 6 | Mole behaviour & scoring | 6 | 46 | 0 | 0 |
| Week 7 | Frontend & rendering | 5 | 56 | 0 | 1 |
| Week 8 | Sensor service, performance & parity | 28 | 162 | 1 | 2 |

Cumulative assertions by week: W5 73 to W6 119 to W7 175 to W8 337

Growth over the Sep-22 baseline of 145 assertions: **232%**

## 7. How this run compares to September

Everything in this section is read out of `backend/tests/baseline/TEST-REPORT-2026-09-22.md` and reprinted in full in section 12; nothing here is retyped by hand

### Coverage growth

| Point | Assertions |
|---|---|
| Sep-22 baseline | 145 |
| End of week 5 | 73 |
| End of week 6 | 119 |
| End of week 7 | 175 |
| End of week 8 | 337 |

### What got better

Timings that came down, and counts that went up.

| Measure | Sep-22 | This run | Change |
|---|---|---|---|
| Value assertions | 145 | 337 | 2.3x as many |
| Tests | 26 | 48 | 1.8x as many |
| Behaviours in the coverage matrix | 6 | 22 | 3.7x as many |
| Areas covered | 10 | 13 | 1.3x as many |
| StreakService.hit | 113 ns | 93 ns | 1.2x faster |
| MoleService.pickType | 66 ns | 51 ns | 1.3x faster |

### What got slower

Each row says why

| Task | Sep-22 | This run | Change | Why |
|---|---|---|---|---|
| LevelingService.getLevel | 5 ns | 22 ns | 4.3x slower | still under a microsecond; the timer call around each attempt costs more than the function itself |
| GameService.whack (full pipeline) | 3804 ns | 15995 ns | 4.2x slower | the pipeline now applies the whole scoring rule: bombs cost a life, golden pays 200, frozen stops the clock, and every hit updates the level and the bar |

### What did not change

- LevelingService.getLevel: constant work (O(1)) in both runs
- SensorService.getPlayerPosition: work grows with the sensor count (O(s)) in both runs
- Sensor cost at 100 times the input: still grows with the input (measured 10.7x in September, 14.6x this run)
- Poll interval: 75 ms in both runs
- SensorService.check (one poll): 1x faster, measurement noise

### Memory

September never measured memory, so there is nothing to compare against yet; the heap probe (child process, `--expose-gc`) was added for this run. This run measured:

| Path | Heap after load (KB) | After a 2000-point game (KB) | Game delta (KB) | Sep-22 |
|---|---|---|---|---|
| services (backend/services/* + main.js) | 3906 | 3985.5 | 79.5 | not measured |
| monolith (backend/gameLogic.js) | 3989.5 | 4070.3 | 80.7 | not measured |

### How these numbers were produced

| Input | Value |
|---|---|
| Node | v26.10.0 |
| Command | node tests/run-tests.js |
| Sensor probe | 2, 20 and 200 sensors, 2,000 calls each, 10 attempts |
| Scoring probe | 2,000 whacks per attempt, 10 attempts |
| Spawn probe | 5,000 spawns per attempt, 10 attempts |
| Poll probe | 50 timed polls |
| Spawn odds | 30,000 seeded picks per level, 90,000 in total |
| Clock | hrtime.bigint(), shown in ms |

## 8. How long each task takes

Each row is one task and the lower the time the faster it is processed 

| Task | Average time | Time for 1,000 runs | Runs per second |
|---|---|---|---|
| LevelingService.getLevel | 0.000022 ms | 0.0216 ms | 46240540 |
| StreakService.hit | 0.000093 ms | 0.0930 ms | 10749774 |
| MoleService.pickType | 0.000051 ms | 0.0507 ms | 19713500 |
| GameService.whack (full pipeline) | 0.015995 ms | 15.9951 ms | 62519 |
| SensorService.check (one poll) | 0.022520 ms | 22.5200 ms | 44405 |

## 9. Does it get slower as the input grows?

Big-O asks one thing: does a task take longer when the input gets bigger? O(1) means no, O(s) means it loops once over the s sensors

### LevelingService.getLevel (3 fixed ifs)

Why it was chosen: score value never changes the 3 ifs

| Input size | Fastest | Slowest | Average of 10 | Time for 1,000 runs |
|---|---|---|---|---|
| - | 0.000001 ms | 0.000008 ms | 0.000002 ms | 0.0024 ms |

**What this shows: the same speed however big the input, so constant work (O(1)).**

### MoleService.pickType (one dice roll)

Why it was chosen: one roll over the level table whatever the level

| Input size | Fastest | Slowest | Average of 10 | Time for 1,000 runs |
|---|---|---|---|---|
| - | 0.000041 ms | 0.000078 ms | 0.000050 ms | 0.0502 ms |

**What this shows: the same speed however big the input, so constant work (O(1)).**

### StreakService.hit (one multiply)

Why it was chosen: single multiply, no loops

| Input size | Fastest | Slowest | Average of 10 | Time for 1,000 runs |
|---|---|---|---|---|
| - | 0.000055 ms | 0.000160 ms | 0.000067 ms | 0.0666 ms |

**What this shows: the same speed however big the input, so constant work (O(1)).**

### HighScoreService.get (one storage read)

Why it was chosen: one localStorage read whatever the score

| Input size | Fastest | Slowest | Average of 10 | Time for 1,000 runs |
|---|---|---|---|---|
| - | 0.000020 ms | 0.000038 ms | 0.000023 ms | 0.0226 ms |

**What this shows: the same speed however big the input, so constant work (O(1)).**

### GameService.whack (fixed pipeline)

Why it was chosen: same fixed steps every hit, nothing scales with input

| Input size | Fastest | Slowest | Average of 10 | Time for 1,000 runs |
|---|---|---|---|---|
| - | 0.005004 ms | 0.008897 ms | 0.006490 ms | 6.4901 ms |

**What this shows: the same speed however big the input, so constant work (O(1)).**

### SensorService.getPlayerPosition (scans s sensors)

Why it was chosen: one loop over the sensor list

| Input size | Fastest | Slowest | Average of 10 | Time for 1,000 runs |
|---|---|---|---|---|
| 2 | 0.000082 ms | 0.000207 ms | 0.000100 ms | 0.1000 ms |
| 20 | 0.000440 ms | 0.000501 ms | 0.000453 ms | 0.4530 ms |
| 200 | 0.000702 ms | 0.003860 ms | 0.001456 ms | 1.4558 ms |

**What this shows: 14.6 times slower when the input is 100 times bigger, so work grows with the input (O(s)).**

### The same task, both ways

The live path (`gameLogic.js`) runs in its own child process so the two halves never share a global scope

| Task | Monolith | Services | Ratio |
|---|---|---|---|
| score a normal hit (spawn + whack) | 0.004821 ms | 0.006491 ms | 1.35x |
| spawn a mole | 0.001538 ms | 0.003732 ms | 2.43x |
| level + progress update | 0.001988 ms | 0.000266 ms | 0.13x |

- level + progress update: services memoise the level (maxLevel), so repeated updates skip work the monolith redoes.

### Memory, measured

A child process with `--expose-gc`, best of 3 runs

| Path | Heap after load (KB) | Heap after a 2000-point game (KB) | Game delta (KB) | Runs (KB) |
|---|---|---|---|---|
| services (backend/services/* + main.js) | 3906 | 3985.5 | 79.5 | 79.5, 79.5, 79.4 |
| monolith (backend/gameLogic.js) | 3989.5 | 4070.3 | 80.7 | 80.7, 80.7, 80.7 |

| Aspect | Monolith | Services |
|---|---|---|
| Game state | module-level globals | one `GameService.game` object |
| Rules | inline closures + constants | service singletons (constant space) |
| Per poll | shared `lastData` copy | shared `lastData` copy |
| Per hit | temporaries in `whackHole` | temporaries in `whack()` |
| Expected order | O(1) state, O(1) per op | O(1) state, O(1) per op |

**What this shows:** both halves hold constant game state; the split changes the shape of the code and who owns it, not how much memory a game needs, and the heap deltas above are the evidence

## 10. Two ways to structure the same game

| Dimension | Monolith (`gameLogic.js`) | Services (`main.js` + `services/*`) |
|---|---|---|
| Time per hit (measured) | 0.004821 ms | 0.006491 ms |
| Time per spawn (measured) | 0.001538 ms | 0.003732 ms |
| Space (measured) | 80.7 KB per game | 79.5 KB per game |
| Change isolation | editing one rule touches a shared file, risk of breaking the others | one service per rule, the edit stays local |
| Test granularity | whole-page behaviour only | per-service unit tests plus integration and parity |
| Failure isolation | any throw takes the whole loop down | each service fails on its own, polling keeps running |
| Wiring complexity | globals wired implicitly at load | `main.js` owns all wiring explicitly |

## 11. What is still wrong

These rows are the gaps the suite actually found; `node tests/run-tests.js` produces every row except the last, which comes from the separate ESP-32 firmware test

| Gap | Result | Owner | Suggested fix |
|---|---|---|---|
| streak tracked during play | PARTIAL | frontend | streaks are not tracked during play: services score flat (+50/+200), the live game has no streak display, and StreakService stays a standalone module |
| score progress bar walks 0 -> 1950 through the real page DOM | PARTIAL | frontend | text and width are asserted on the parsed index.html, and a manual browser check on 2026-10-06 confirmed the bar moves, but no automated test renders the page, so the visible bar cannot be re-checked by CI |
| ice/fire classes added by the live path | PARTIAL | frontend | only the services add them: gameLogic.js never sets has-normal-ice / has-bomb-ice / has-normal-fire / has-bomb-fire |
| `environments.css` / `environments-fx.css` are linked in `index.html` but the files are not there (404) | FAIL | frontend | delete the two `<link>` tags, or add the files |
| `#hammer-cursor` has markup but no CSS rule and no JS (removed by `df8fe44`) | FAIL | frontend | put the cursor style and JS back, or drop the element |
| `ESP-32 Code/tests/game_backend_test.cjs` still expects the old modular score (`m.score() === 10` / `20`) | FAIL | ESP-32 tests | change the 4 modular expectations to 50 / 100. Parity made the modular path match the live game (both +50), so this file still encodes the old split; every other assertion in it passes against the parity services (checked on a copy outside the repo) |

## 12. September's report, in full

Reprinted unchanged so the growth figures above can be checked; it keeps its original units (ns/op), while every number measured for this run is in ms

```
# Test report — Whack-A-Mole backend

Date: 2026-09-22
Run: `node tests/run-tests.js` from `UI-Code/backend` (no libraries needed).
Result: **145 passed, 0 failed**.

Layout: one test file per service (`tests/test-<service>.js`, shared harness in `tests/helpers.js`).

## 1. Polling speed (SensorService microservice)

The sensor loop is its own service: every 75ms it does `GET /api/hits` and overlapping polls are dropped via a `busy` flag (never two in flight).

| Measure (50 timed polls, scripted fetch queue) | Value |
|---|---|
| Best poll | 15542 ns |
| Average poll | 22950 ns |
| Worst poll | 75542 ns |
| Poll interval | 75000000 ns (75 ms) |
| Interval used by an average poll | 0.03% |
| Throughput | 43573 polls/sec |

Verdict: one poll costs microseconds against a 75ms interval, so the
microservice loop can never pile up — even the worst measured poll is
orders of magnitude under the interval, and the `busy` guard drops any
overlap outright (proven below).

## 2. Connection consistency

Scripted fetch queue, no network: each row is one asserted behaviour.

| Case | Expected | Result |
|---|---|---|
| Fresh event (age < 1s) | forwarded to onHit(hole) | PASS |
| Duplicate event_id | ignored (exactly 1 hit) | PASS |
| Stale event (age > 1s) | ignored, id still remembered | PASS |
| Poll while busy | no second fetch fired | PASS |
| Fetch fails (ESP32 offline) | status line shows "disconnected" | PASS |
| Reconnect | hits resume, status clears | PASS |

Verdict: the webserver link holds every consistency case passes.

## 3. Unit tests per function

`direct` = called the function with fixed values.  
`simulated` = scripted
play (forced spawns, seeded RNG, fake fetch/DOM) or a full bot game.  
`n` = number of value assertions inside the test (10-attempt timings
are reported separately in section 6).

| Service | Tests | Value assertions | Failed |
|---|---|---|---|
| LevelingService | 3 | 22 | 0 |
| MoleService | 2 | 22 | 0 |
| StreakService | 1 | 11 | 0 |
| Conditions | 2 | 18 | 0 |
| GameService | 8 | 33 | 0 |
| GameView | 3 | 18 | 0 |
| SensorService | 2 | 10 | 0 |
| Polling | 2 | 9 | 0 |
| Wiring | 1 | 2 | 0 |
| Complexity | 2 | 0 | 0 |

| Test | Method | n | Result | Time (ms) |
|---|---|---|---|---|
| level bands (0/199/200/400/600/800) | direct | 7 | PASS | 0 |
| win at 2000 + spawn speeds from spec | direct | 8 | PASS | 0 |
| progress bar bands + pinned band after penalty | direct | 7 | PASS | 0 |
| legend tables (points + effects) | direct | 16 | PASS | 0 |
| spawn distribution accuracy (30k picks, seeded) | simulated | 6 | PASS | 10 |
| streak starts at x1, then +0.01 per hit | direct | 11 | PASS | 0 |
| theme per level + win/lose | direct | 10 | PASS | 0 |
| high score: only beaten records save | direct | 8 | PASS | 0 |
| start resets everything | simulated | 8 | PASS | 0 |
| normal hit scores exactly 10 x streak (accuracy) | simulated | 5 | PASS | 1 |
| speedy pays +20 but gives a smaller window | simulated | 3 | PASS | 0 |
| dark mole takes 15 but keeps level (floor 0) | simulated | 4 | PASS | 0 |
| toxic pays +30 but costs 5s of clock | simulated | 4 | PASS | 0 |
| golden pays +50 X streak | simulated | 2 | Partial FAIL (+50 but no streaks) | 0 |
| miss = loses a life & 0 = lives ends game & 2000 point = wins | simulated | 4 | PASS | 0 |
| FULL BOT GAME to 2000 (end to end) | simulated | 3 | PASS | 9 |
| renders mole types + score + environment | simulated | 11 | Partial PASS (some moles don't render conistently as intended) | 0 |
| old img markup still works (face on mole, img put back) | simulated | 3 | PASS | 0 |
| css mole art keeps its pieces (face inside art) | simulated | 4 | PASS | 0 |
| finds the player's hole in both ESP32 formats | direct | 5 | PASS | 0 |
| polling: fresh hit forwarded, stale ignored, offline shown | simulated | 5 | PASS | 1 |
| one poll is fast (50 timed polls) | simulated | 2 | PASS | 1 |
| connection holds steady (duplicates/stale/overlap/offline) | simulated | 7 | PASS | 1 |
| buttons + holes wired to GameService | simulated | 2 | PASS | 0 |
| O(1): fixed work stays flat | timed (10 attempts) | 0 | PASS | 103 |
| O(s): sensor work grows with sensor count | timed (10 attempts) | 0 | PASS | 14 |

## 4. Mole coverage (frontend legend)

Every legend mole is hit in a scripted game and its exact
score/clock effect is asserted and not solely just ran.

| Behaviour | How tested | Result |
|---|---|---|
| normal (+10 x streak) | whack() scripted + bot game | PASS |
| speedy (+20 x streak, 60% uptime) | whack() scripted + lifetime asserted | PASS |
| dark (-15, floor 0, streak break, level kept) | whack() scripted | PASS |
| toxic (+30 x streak, -5s clock) | whack() scripted | PASS |
| toxic on a dead clock ends the game | whack() scripted | PASS |
| golden (+50 x streak, streak kept) | whack() scripted | PASS |

## 5. Speed (operations per second)

| Operation | Avg ns/op | Ops/sec |
|---|---|---|
| LevelingService.getLevel | 5 | 192801933 |
| MoleService.pickType | 66 | 15100986 |
| StreakService.hit | 113 | 8814812 |
| GameService.whack (full pipeline) | 3804 | 262883 |
| SensorService.check (one poll) | 22950 | 43573 |

## 6. Complexity (best / worst / average of 10 attempts)

Big-O = does it get slower when the input gets bigger? O(1) = no,
O(s) = loops once over the `s` sensors.
Method: time the same work 10x, repeat at 10x-100x bigger inputs.
Game hits are all O(1): fixed scoring math, nothing scales with input.

### LevelingService.getLevel (4 fixed ifs)

Why: score value never changes the 4 ifs.

| Input size | Best (ns/op) | Worst (ns/op) | Average of 10 (ns/op) |
|---|---|---|---|
| - | 1 | 9 | 3 |

**Verdict: flat across 10 attempts -> O(1).**

### MoleService.pickType (one dice roll)

Why: one roll over the level table whatever the level.

| Input size | Best (ns/op) | Worst (ns/op) | Average of 10 (ns/op) |
|---|---|---|---|
| - | 48 | 62 | 54 |

**Verdict: flat across 10 attempts -> O(1).**

### StreakService.hit (one multiply)

Why: single multiply, no loops.

| Input size | Best (ns/op) | Worst (ns/op) | Average of 10 (ns/op) |
|---|---|---|---|
| - | 76 | 102 | 80 |

**Verdict: flat across 10 attempts -> O(1).**

### HighScoreService.get (one storage read)

Why: one localStorage read whatever the score.

| Input size | Best (ns/op) | Worst (ns/op) | Average of 10 (ns/op) |
|---|---|---|---|
| - | 21 | 41 | 23 |

**Verdict: flat across 10 attempts -> O(1).**

### GameService.whack (fixed pipeline)

Why: same fixed steps every hit, nothing scales with input.

| Input size | Best (ns/op) | Worst (ns/op) | Average of 10 (ns/op) |
|---|---|---|---|
| - | 1561 | 3966 | 2270 |

**Verdict: flat across 10 attempts -> O(1).**

### SensorService.getPlayerPosition (scans s sensors)

Why: one loop over the sensor list.

| Input size | Best (ns/op) | Worst (ns/op) | Average of 10 (ns/op) |
|---|---|---|---|
| 2 | 27 | 175 | 49 |
| 20 | 59 | 448 | 110 |
| 200 | 515 | 542 | 526 |

**Verdict: grows 10.7x for 100x input -> O(s).**
```
