import assert from "node:assert/strict";
import * as THREE from "../vendor/three/three.module.min.js";
import { batchStaticMeshes } from "../backend/three/BatchMeshes.mjs";
import { createModelKit } from "../backend/three/MoleModels.mjs";
import { MoleMotion } from "../backend/three/MoleMotion.mjs";
import { findMoleAtPoint } from "../backend/three/HitTesting.mjs";

const parent = new THREE.Group();
const surface = new THREE.MeshStandardMaterial();
const sources = [];
const owned = [];
for (let index = 0; index < 3; index++) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), surface);
  mesh.position.set(index * 2, index, 0);
  mesh.scale.set(0.5, 1, 0.7);
  mesh.rotation.z = index * 0.3;
  parent.add(mesh);
  sources.push(mesh.geometry);
}
const expectedBounds = new THREE.Box3().setFromObject(parent, true);
const triangles = sources.reduce((total, geometry) => total + geometry.index.count / 3, 0);
batchStaticMeshes(parent, geometry => { owned.push(geometry); return geometry; });
assert.equal(parent.children.length, 1);
assert.equal(parent.children[0].geometry.index.count / 3, triangles);
const actualBounds = new THREE.Box3().setFromObject(parent, true);
assert(expectedBounds.min.distanceTo(actualBounds.min) < 0.000001);
assert(expectedBounds.max.distanceTo(actualBounds.max) < 0.000001);
const kit = createModelKit();
const plot = kit.createPlot();
plot.mole.rig.visible = true;
let meshes = 0;
plot.root.traverseVisible(part => { if (part.isMesh) meshes++; });
assert(meshes <= 14, "the normal mole and hole stay within the batched draw budget");
plot.mole.eyes[0].scale.y = 0.12;
assert.notEqual(plot.mole.eyes[0], plot.mole.eyes[1], "eye animation remains independent");

globalThis.document = { getElementById: () => null };
const { ThreeBoard } = await import("../backend/three/ThreeBoard.mjs");
const { GardenBackdrop } = await import("../backend/three/GardenBackdrop.mjs");
delete globalThis.document;
globalThis.window = { innerWidth: 1280, innerHeight: 720 };
const camera = new THREE.PerspectiveCamera(43, 1280 / 720, 0.1, 180);
camera.position.set(0, 18, 24);
camera.lookAt(0, 0, -8);
camera.updateMatrixWorld();
let reads = 0;
const boxes = Array.from({ length: 6 }, (_, index) => ({ left: 330 + index % 2 * 320, top: 200 + Math.floor(index / 2) * 130, width: 300, height: 130 }));
const entries = boxes.map(() => {
  const plot = kit.createPlot();
  return { plot, motion: new MoleMotion(plot.mole) };
});
const board = Object.assign(Object.create(ThreeBoard.prototype), {
  holes: boxes.map(box => ({ style: { setProperty() {} }, getBoundingClientRect() { reads++; return { ...box }; } })),
  camera, entries, layoutDirty: true, nextLayoutCheck: 0, layoutBoxes: null, layoutViewport: null,
  backdrop: { garden: { setOpenings(values) { this.openings = values; } } },
});
assert(board.updateLayout(0));
assert.equal(reads, 6);
for (let time = 16; time < 250; time += 16) assert(!board.updateLayout(time));
assert.equal(reads, 6, "steady animation does not read browser layout every frame");
assert(!board.updateLayout(250));
assert.equal(reads, 12);
boxes[0].top += 20;
board.layoutDirty = true;
assert(board.updateLayout(251), "scroll and resize notifications refresh target projection immediately");
const opening = board.backdrop.garden.openings[0];
const projectedOpening = new THREE.Vector3(opening.x, 0, opening.y).project(camera);
assert(Math.abs((1 - projectedOpening.y) * 360 - (boxes[0].top + boxes[0].height * .65)) < .001);
boxes[0].top += 10;
assert(board.updateLayout(252, true), "hit testing can refresh layout before the next scheduled animation frame");
const model = entries[0];
model.motion.show("normal");
model.motion.update(.2, 1);
model.plot.root.updateMatrixWorld(true);
const face = model.plot.mole.rig.localToWorld(new THREE.Vector3(0, 1.5, .5)).project(camera);
const facePoint = { x: (face.x + 1) * 640, y: (1 - face.y) * 360 };
const originalRaycast = THREE.Mesh.prototype.raycast;
let raycasts = 0;
THREE.Mesh.prototype.raycast = function (...args) { raycasts++; return originalRaycast.apply(this, args); };
try {
  assert.equal(findMoleAtPoint(entries, camera, { width: 1280, height: 720 }, { x: -10000, y: -10000 }), null);
  assert.equal(raycasts, 0, "distant misses reject bounds before testing triangles");
  assert.equal(findMoleAtPoint(entries, camera, { width: 1280, height: 720 }, facePoint), 0);
  assert(raycasts > 0);
} finally { THREE.Mesh.prototype.raycast = originalRaycast; }

for (const hz of [60, 120]) {
  let frames = 0;
  const backdrop = { render() { frames++; }, onContextLost() { assert.fail("frame failure"); } };
  for (let tick = 0; tick < hz; tick++) GardenBackdrop.prototype.frame.call(backdrop, tick * 1000 / hz);
  assert(frames >= 59 && frames <= 61, "the frame clock maintains its 60 fps cap at " + hz + " Hz");
}
const shadowUpdates = [];
let moving = true;
const backdrop = {
  onUpdate: () => moving, garden: { update() {} }, reducedMotion: { matches: false },
  renderer: { shadowMap: {}, render() { shadowUpdates.push(this.shadowMap.needsUpdate); } },
  shadowDirty: true,
};
for (const time of [0, 16, 34]) GardenBackdrop.prototype.render.call(backdrop, .016, time);
assert.deepEqual(shadowUpdates, [true, false, true], "moving shadows update at 30 fps while the scene stays at 60 fps");
moving = false;
GardenBackdrop.prototype.render.call(backdrop, .016, 40);
assert(shadowUpdates.at(-1), "the final shadow is cleared immediately when a mole disappears");
GardenBackdrop.prototype.render.call(backdrop, .016, 100);
assert(!shadowUpdates.at(-1), "static scenery reuses the existing shadow map");
backdrop.shadowDirty = true;
GardenBackdrop.prototype.render.call(backdrop, .016, 110);
assert(shadowUpdates.at(-1), "theme or layout changes refresh cached shadows");
delete globalThis.window;
kit.dispose();
sources.concat(owned).forEach(geometry => geometry.dispose());
surface.dispose();
console.log("PASS: merged geometry bounds, draw budget, independent eyes, cached layout with immediate hit refresh, fast miss rejection, frame pacing and shadow invalidation.");
