// Test runner: loads the harness, runs one file per service, writes
// tests/TEST-REPORT.md and tests/TEST-REPORT.html.
// Run with:  node tests/run-tests.js   (from UI-Code/backend, no libraries needed)
//
// PARTIAL rows are expected gaps and do not fail the run;
// only real FAIL rows do.
const path = require("path");
const h = require("./helpers");

h.loadServices();

// Suites run in week order so the console reads like the progression report.
const suites = [
  require("./test-leveling"), // W5
  require("./test-streak"), // W5
  require("./test-conditions"), // W5
  require("./test-wiring"), // W5
  require("./test-mole"), // W6
  require("./test-game-service"), // W6
  require("./test-gameview"), // W7
  require("./test-progress"), // W7
  require("./test-sensor"), // W8
  require("./test-connection"), // W8
  require("./test-hammer"), // W8
  require("./test-parity"), // W8
  require("./test-complexity"), // W8
];

async function main() {
  for (const s of suites) await s.run();

  const { passed, failed, failures, perfRows, partials, partialCount } = h.stats();

  console.log("\n== TIMING (ms) ==");
  console.log("task                            avg ms      runs/sec");
  for (const r of perfRows) {
    console.log(r.label.padEnd(30) + r.avgMs.toFixed(6).padStart(12) + String(r.perSec).padStart(12));
  }

  console.log("\nRESULT: " + passed + " passed, " + failed + " failed, " + partialCount + " partial");
  if (failures.length) {
    console.log("FAILURES:");
    failures.forEach((f) => console.log(" - " + f));
  }
  if (partials.length) {
    console.log("PARTIAL (expected gaps):");
    partials.forEach((pt) => console.log(" - " + pt.name + " — " + pt.reason));
  }

  const report = require("./report-html");
  const model = report.buildModel();
  report.writeMarkdown(model, path.join(__dirname, "TEST-REPORT.md"));
  report.writeHtml(model, path.join(__dirname, "TEST-REPORT.html"));
  console.log("\nReports written to tests/TEST-REPORT.md and tests/TEST-REPORT.html");

  process.exit(failed ? 1 : 0);
}

main();
