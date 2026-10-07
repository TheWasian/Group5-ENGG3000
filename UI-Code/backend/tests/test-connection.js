// Polling microservice validation: how fast is one poll, and how steady
// is the connection over many polls?
// Method: timed scripted fetch queue (no network, no randomness).
// Records per-poll latencies for the report + a consistency matrix:
// duplicates ignored, stale ignored, overlap never double-fires,
// offline -> disconnected, reconnect -> connected again.
const h = require("./helpers");
const { check } = h;
const SECTION = "Polling";

function stats(ns) {
  const s = ns.slice().sort((a, b) => a - b);
  const sum = s.reduce((t, v) => t + v, 0);
  return {
    n: s.length,
    best: Math.round(s[0]),
    worst: Math.round(s[s.length - 1]),
    avg: Math.round(sum / s.length),
  };
}

async function run() {
  console.log("== Polling microservice (speed + connection consistency) ==");
  await h.test(SECTION, "one poll is fast (50 timed polls)", async () => {
    const hits = [];
    SensorService.onHit = (hole) => hits.push(hole);
    SensorService.lastEventId = 100;
    const latencies = [];
    for (let i = 0; i < 50; i++) {
      h.setFetchQueue([
        { body: { event_id: 101 + i, hole: i % 6, event_age_ms: 20, sensors: [] } },
      ]);
      const t0 = process.hrtime.bigint();
      await SensorService.check();
      await h.flush();
      latencies.push(Number(process.hrtime.bigint() - t0));
    }
    for (const ns of latencies) h.pollLatencies.push(ns);
    const s = stats(latencies);
    console.log("  (50 polls: best " + s.best + "ns, avg " + s.avg + "ns, worst " + s.worst + "ns)");
    check("all 50 polls forwarded", hits.length, 50);
    check("average poll under 1ms", s.avg < 1000000, true);
    h.perfRow("SensorService.check (one poll)", s.avg);
  });
  await h.test(SECTION, "connection holds steady (duplicates/stale/overlap/offline)", async () => {
    const hits = [];
    SensorService.onHit = (hole) => hits.push(hole);
    SensorService.lastEventId = 200;
    // Duplicate event_id: same answer twice -> one hit, not two.
    h.setFetchQueue([
      { body: { event_id: 201, hole: 1, event_age_ms: 10, sensors: [] } },
      { body: { event_id: 201, hole: 1, event_age_ms: 10, sensors: [] } },
    ]);
    await SensorService.check();
    await h.flush();
    await SensorService.check();
    await h.flush();
    check("duplicate event -> exactly 1 hit", hits.length, 1);
    // Overlap guard: a second check while one is in flight fires no fetch.
    h.resetFetchCalls();
    SensorService.busy = true;
    h.setFetchQueue([{ body: { event_id: 202, hole: 2, event_age_ms: 10, sensors: [] } }]);
    await SensorService.check();
    await h.flush();
    check("busy poll fires no fetch", h.getFetchCalls(), 0);
    SensorService.busy = false;
    // Stale event (older than 1s): id remembered, no hit.
    h.setFetchQueue([{ body: { event_id: 203, hole: 3, event_age_ms: 5000, sensors: [] } }]);
    await SensorService.check();
    await h.flush();
    check("stale event -> no new hit", hits.length, 1);
    check("stale id still remembered", SensorService.lastEventId, 203);
    // Offline then back: status line flips both ways, hits resume.
    h.setFetchQueue([{ error: true }]);
    await SensorService.check();
    await h.flush();
    check("offline shows disconnected", h.getById("sensor-status").textContent.indexOf("disconnected") !== -1, true);
    h.setFetchQueue([{ body: { event_id: 204, hole: 4, event_age_ms: 10, sensors: [] } }]);
    await SensorService.check();
    await h.flush();
    check("reconnect forwards hits again", hits.join(), "1,4");
    check("reconnect clears disconnected", h.getById("sensor-status").textContent.indexOf("disconnected") === -1, true);
  });
}

module.exports = { run };
