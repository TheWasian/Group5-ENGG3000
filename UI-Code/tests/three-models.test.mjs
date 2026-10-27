import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import * as THREE from "../vendor/three/three.module.min.js";
import { createModelKit } from "../backend/three/MoleModels.mjs";
import { MoleMotion } from "../backend/three/MoleMotion.mjs";
import { createGardenScene } from "../backend/three/GardenScene.mjs";
import { layoutGroundPlot } from "../backend/three/GroundLayout.mjs";

const kit = createModelKit();
const plot = kit.createPlot();
plot.root.position.set(120, -40, 0);
plot.root.rotation.x = 0.52;
plot.root.scale.setScalar(46);
plot.updateClippingPlane();
assert(plot.plane.distanceToPoint(plot.root.localToWorld(new THREE.Vector3(0, 0.5, 0))) > 0);
assert(plot.plane.distanceToPoint(plot.root.localToWorld(new THREE.Vector3(0, -0.5, 0))) < 0);

const variants = [
  ["normal", "", "normal"], ["golden", "has-golden", "golden"], ["frozen", "has-frozen", "frozen"],
  ["bomb", "", "normal"], ["normal", "has-normal-ice", "ice"], ["normal", "has-normal-fire", "fire"],
  ["bomb", "has-bomb-ice", "ice"], ["bomb", "has-bomb-fire", "fire"],
];
plot.mole.setVariant("frozen", "has-frozen");
const luminance = (color) => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
const freezeBrightness = luminance(plot.mole.fur.color);
plot.mole.setVariant("normal", "has-normal-ice");
assert((freezeBrightness + 0.05) / (luminance(plot.mole.fur.color) + 0.05) >= 3,
  "ice fur is substantially darker than the pale freeze fur");
for (const [type, skin, expected] of variants) {
  plot.mole.setVariant(type, skin);
  assert.equal(plot.mole.rig.userData.variant, expected);
  assert.equal(plot.mole.rig.getObjectByName("bomb").visible, type === "bomb");
  assert.equal(plot.mole.rig.getObjectByName("golden-crown").visible, type === "golden");
  assert.equal(plot.mole.rig.getObjectByName("ice-crystals").visible, type === "frozen");
  plot.mole.rig.traverse((part) => {
    if (!part.isMesh) return;
    assert(part.material.clippingPlanes.includes(plot.plane), "every accessory clips below the soil");
    assert(part.geometry.attributes.position.count > 10, "real 3D mesh geometry is present");
    for (const value of part.geometry.attributes.position.array) assert(Number.isFinite(value));
  });
  const motion = new MoleMotion(plot.mole);
  motion.show(type, skin);
  motion.update(0.2, 1);
  assert.equal(motion.progress, 1);
  motion.hide();
  motion.update(0.08, 1.1);
  assert(motion.progress > 0 && motion.progress < 1);
  assert.equal(plot.mole.rig.userData.variant, expected, "retreat preserves the special material");
  motion.update(0.2, 1.3);
  assert.equal(plot.mole.rig.visible, false);
}

const motion = new MoleMotion(plot.mole);
motion.show("golden", "has-golden");
motion.update(0.2, 1);
motion.hide();
motion.show("normal", "has-normal-ice");
motion.update(0.08, 1.1);
assert.equal(plot.mole.rig.userData.variant, "golden", "a reused hole keeps its departing skin until hidden");
motion.update(0.1, 1.2);
assert.equal(plot.mole.rig.visible, false);
assert.equal(plot.mole.rig.userData.variant, "ice");
motion.update(0.2, 1.4);
assert.equal(motion.progress, 1);
motion.show("bomb", "has-bomb-fire");
motion.hide();
motion.update(1, 2);
assert.equal(motion.target, 0, "a hit cancels a queued appearance");
assert.equal(plot.mole.rig.visible, false, "a queued mole cannot reappear after a hit");
motion.show("frozen", "has-frozen");
motion.update(0, 3, true);
assert.equal(motion.progress, 1, "reduced motion needs no animated rise");
motion.hide();
motion.update(0, 3, true);
assert.equal(plot.mole.rig.visible, false);
for (const viewport of [{ width: 1280, height: 720 }, { width: 375, height: 812 }]) {
  const camera = new THREE.PerspectiveCamera(43, viewport.width / viewport.height, 0.1, 180);
  camera.position.set(0, 18, viewport.width < viewport.height ? 29 : 24);
  camera.lookAt(0, 0, -8);
  camera.updateMatrixWorld();
  for (const top of [30, 250, 480]) {
    const box = { left: viewport.width * 0.15, top, width: viewport.width * 0.3, height: 140 };
    const opening = layoutGroundPlot(plot, camera, viewport, box);
    assert(opening);
    const position = new THREE.Vector3(opening.x, 0, opening.y).project(camera);
    assert(Math.abs((position.x + 1) * viewport.width / 2 - (box.left + box.width / 2)) < 0.001);
    assert(Math.abs((1 - position.y) * viewport.height / 2 - (top + box.height * 0.65)) < 0.001,
      "terrain openings stay at the actual DOM target after resize or scroll");
    assert(Math.abs(plot.plane.distanceToPoint(new THREE.Vector3(opening.x, 0, opening.y))) < 0.0001,
      "the mole clipping plane coincides with the terrain");
  }
  assert.equal(layoutGroundPlot(plot, camera, viewport, { left: 0, top: -500, width: 100, height: 140 }), null);
  assert.equal(plot.root.visible, false);
}
kit.dispose();

const garden = createGardenScene();
let gardenInstances = 0;
let pathFacesUp = false;
garden.root.traverse((part) => {
  if (!part.isMesh) return;
  for (const attribute of Object.values(part.geometry.attributes)) {
    for (const value of attribute.array) assert(Number.isFinite(value), "landscape geometry has no invalid values");
  }
  if (part.isInstancedMesh) {
    gardenInstances += part.count;
    for (const value of part.instanceMatrix.array) assert(Number.isFinite(value));
  }
  if (part.geometry.name === "garden-path") {
    pathFacesUp = true;
    const normals = part.geometry.attributes.normal;
    for (let index = 0; index < normals.count; index++) assert(normals.getY(index) > 0.99, "the path faces the camera above the ground");
  }
});
assert(pathFacesUp);
assert(gardenInstances > 200, "the garden includes depth layers and foreground detail");
const visibleLandmarks = new Set();
for (const name of ["grassland", "freezing", "fire", "toxic", "void"]) {
  const theme = garden.setEnvironment(name);
  assert.equal(garden.root.userData.theme, name);
  assert.match(theme.sky, /^#[0-9a-f]{6}$/i);
  assert(theme.leaf.every((color) => /^#[0-9a-f]{6}$/i.test(color)));
  assert.equal(Object.values(garden.layers).filter((group) => group.visible).length, 1);
  assert(garden.layers[name].visible);
  let visibleBatches = 0;
  garden.root.traverseVisible((part) => { if (part.isInstancedMesh) visibleBatches++; });
  assert(visibleBatches < 25, "only the selected scenery is drawn, with repeated geometry batched");
  visibleLandmarks.add(garden.layers[name].children.map((part) => part.isInstancedMesh ? part.count : part.type).join(","));
}
assert.equal(visibleLandmarks.size, 5, "all environments contain different scenery rather than only different colors");
garden.setOpenings([new THREE.Vector3(1, 2, 0.9)]);
assert.equal(garden.openings[0].z, 0.9);
garden.setOpenings([null]);
assert(garden.openings.every((opening) => opening.z === 0), "offscreen holes cannot leave stale gaps in the terrain");
const routeHoles = [new THREE.Vector3(-5, -5, 2), new THREE.Vector3(8, -5, 2), new THREE.Vector3(6, 8, 1.4)];
garden.setOpenings(routeHoles);
garden.root.traverse((part) => {
  if (!part.isMesh || part.geometry.name !== "garden-path") return;
  const positions = part.geometry.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    for (const opening of routeHoles) {
      assert(Math.hypot(positions.getX(index) - opening.x, positions.getZ(index) - opening.y) > opening.z * 1.5, "paths and lava clear the entire raised hole rim");
    }
  }
});
garden.setEnvironment("fire");
const ejecta = [];
garden.root.traverse((part) => { if (part.name === "volcano-ejecta") ejecta.push(part); });
assert.equal(ejecta.length, 2);
let sawEruption = false;
for (let tick = 0; tick < 400; tick++) {
  garden.update(0.1, tick * 100, false);
  for (const part of ejecta) {
    if (!part.visible) continue;
    sawEruption = true;
    assert.equal(part.count, 32, "eruptions reuse a bounded particle pool");
    assert(Array.from(part.instanceMatrix.array).every(Number.isFinite));
  }
}
assert(sawEruption, "fire volcanoes erupt automatically");
garden.update(0.1, 40000, true);
assert(ejecta.every((part) => !part.visible), "reduced motion suppresses eruptions");
garden.setEnvironment("freezing");
garden.update(0.1, 1000, false);
assert(ejecta.every((part) => !part.visible), "eruptions stop outside the fire level");
garden.dispose();

const ui = fileURLToPath(new URL("../", import.meta.url));
const elements = new Map();
function element(id) {
  if (elements.has(id)) return elements.get(id);
  const classes = new Set();
  const listeners = new Map();
  const value = {
    id, textContent: "", className: "", style: {}, dataset: {}, listeners,
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle: (name, on) => on ? classes.add(name) : classes.delete(name),
    },
    querySelector: (selector) => element(id + selector),
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeAttribute() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 620, height: 440 }),
  };
  elements.set(id, value);
  return value;
}
const holes = Array.from({ length: 6 }, (_, index) => Object.assign(element("hole" + index), {
  dataset: { hole: String(index) },
  getBoundingClientRect: () => ({ left: index % 2 * 315, top: Math.floor(index / 2) * 150, width: 305, height: 140 }),
}));
const calls = [];
let frame = 0;
let payload;
const context = {
  document: { getElementById: element, querySelectorAll: (selector) => selector === ".hole" ? holes : [], body: element("body") },
  window: { location: { hostname: "localhost" }, addEventListener() {}, MoleBoard3D: {
    show: (...args) => calls.push(["show", ...args]),
    hideAll: () => calls.push(["hide"]),
    setEnvironment: (name) => calls.push(["environment", name]),
    flash: (index) => calls.push(["flash", index]),
  } },
  FrontendMetrics: new Proxy({}, { get: () => () => {} }),
  performance: { now: () => 100 }, AbortController, console,
  setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
  fetch: async () => ({ ok: true, json: async () => payload }),
};
vm.createContext(context);
for (const script of ["services/LevelingService", "services/MoleService", "services/EnvironmentService", "services/GameConditionService", "services/HighScoreService", "services/GameService", "GameView", "SensorService", "main"]) {
  vm.runInContext(fs.readFileSync(ui + "backend/" + script + ".js", "utf8").replace(/SensorService\.start\(\);\s*$/, ""), context);
}
context.GameService.startGame();
assert(calls.some((call) => call[0] === "show"), "game startup drives the renderer");
for (const [type, skin] of variants) {
  const level = skin.includes("-ice") ? 2 : skin.includes("-fire") ? 3 : 1;
  Object.assign(context.GameService.game, { score: 0, lives: 3, level, maxLevel: level });
  context.GameService.spawnMole(type, 0);
  assert.deepEqual(calls.at(-1), ["show", 0, type, skin]);
  const result = context.GameService.whackHole(0, "mouse");
  assert.equal(result.hit, true);
  assert.equal(context.GameService.game.score, type === "golden" ? 200 : type === "bomb" ? 0 : 50);
  assert.equal(context.GameService.game.lives, type === "bomb" ? 2 : 3);
  assert(holes[0].querySelector(".mole").className.includes(skin));
  assert(!holes[0].classList.contains("active"));
  assert.equal(context.GameService.whackHole(0, "mouse").hit, false, "double clicks do not score twice");
}
context.GameView.setEnvironment("fire");
assert.deepEqual(calls.at(-1), ["environment", "fire"]);

Object.assign(context.GameService.game, { score: 0, lives: 3, level: 1, maxLevel: 1 });
context.GameService.spawnMole("normal", 0);
function sensorPayload(overrides = {}) {
  return {
    source: "access_point", boot_id: 3, frame_id: ++frame, event_id: 1, current_hole: 0,
    position: { valid: true, x_m: 0.6, y_m: 1 + 1 / 6, age_ms: 10, sensors_used: 3, sensors_used_mask: 7, in_game_area: true, in_play_area: true, ...overrides },
    game_area: { x_min_m: 0.45, x_max_m: 1.05, start_y_m: 1, end_y_m: 2 },
    ranges_m: [1, 0.9, 1.1], node_online: [true, true],
  };
}
context.SensorService.debugLastEvent = null;
context.SensorService.debugSensorLabels = [null, null];
context.SensorService.debugSensorDisplays = [null, null];
payload = sensorPayload();
await context.SensorService.pollSensors();
assert.equal(context.GameService.game.score, 50, "actual main.js sensor callback still scores");
assert(calls.some((call) => call[0] === "flash" && call[1] === 0));
const marker = element("player-marker");
assert(Math.abs(parseFloat(marker.style.left) - 152.5) < 0.001);
assert(Math.abs(parseFloat(marker.style.top) - 70) < 0.001, "hammer maps to the retained DOM hole centres");
context.GameService.spawnMole("normal", 0);
await context.SensorService.pollSensors();
assert.equal(context.GameService.game.score, 50, "duplicate sensor frames cannot hit a fresh mole");
payload = sensorPayload({ held: true, x_m: 0.7, y_m: 1.4 });
await context.SensorService.pollSensors();
assert.equal(context.GameService.game.score, 50, "held coordinates cannot score");
assert(marker.classList.contains("stale"));
assert(parseFloat(marker.style.left) > 152.5, "continuous coordinates still move the hammer between holes");
payload = sensorPayload();
await context.SensorService.pollSensors();
assert.equal(context.GameService.game.score, 100);
delete context.window.MoleBoard3D;
context.GameService.spawnMole("golden", 1);
assert(holes[1].classList.contains("active"), "the CSS fallback works without a renderer");
assert.equal(context.GameService.whackHole(1, "mouse").points, 200);
console.log("PASS: eight 3D variants, distinct ice/freeze fur, grounded target projection at desktop/mobile sizes, five different scenery sets, terrain openings, path/lava clearance, automatic eruptions and reduced-motion suppression, clipped accessories, retreat/reuse/reduced-motion, live mouse/sensor scoring without debug panels, hammer mapping, duplicate rejection, and CSS fallback.");
