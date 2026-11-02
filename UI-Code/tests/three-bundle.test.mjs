import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";

const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert(!/<script\b[^>]*type=["']module["']/i.test(page));
assert(!/\bimport\s*\(/.test(page), "opening the game must not initiate a module import");
const scripts = Array.from(page.matchAll(/<script\b[^>]*src=["']([^"']+)["']/gi), ([, src]) => src);
assert(scripts.includes("./backend/three/three-game.bundle.js"));
for (const src of scripts) assert(existsSync(new URL("../" + src, import.meta.url)), "shipped script exists: " + src);
const bundle = readFileSync(new URL("../backend/three/three-game.bundle.js", import.meta.url), "utf8");
const script = new vm.Script(bundle);
try {
  script.runInNewContext({ AbortController, document: { getElementById: () => null } }, { timeout: 2000 });
} catch (error) {
  assert.fail("Classic bundle initialization failed: " + error.message);
}
console.log("PASS: shipped 3D bundle runs as a classic script without a module loader, and all game scripts exist.");
