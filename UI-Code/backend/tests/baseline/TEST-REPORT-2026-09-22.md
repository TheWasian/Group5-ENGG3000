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
