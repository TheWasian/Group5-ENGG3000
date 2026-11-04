import * as THREE from "../../vendor/three/three.module.min.js";

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const bounds = new THREE.Box3();
const corner = new THREE.Vector3();

// How far (in screen pixels) from the hammer head a mole can still be hit
export const HIT_RADIUS_PX = 65;
const RING_DIRECTIONS = 12;

// Centre first, then rings outward so a mole right under the hammer always wins
function samplePoints(point, radius) {
  const rings = [[point]];
  for (const scale of [0.33, 0.66, 1]) {
    const ring = [];
    for (let i = 0; i < RING_DIRECTIONS; i++) {
      const angle = (i / RING_DIRECTIONS) * Math.PI * 2;
      ring.push({ x: point.x + Math.cos(angle) * radius * scale, y: point.y + Math.sin(angle) * radius * scale });
    }
    rings.push(ring);
  }
  return rings;
}

function nearMole(plot, camera, viewport, point, radius) {
  bounds.setFromObject(plot.mole.rig);
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (let index = 0; index < 8; index++) {
    corner.set(index & 1 ? bounds.max.x : bounds.min.x,
      index & 2 ? bounds.max.y : bounds.min.y, index & 4 ? bounds.max.z : bounds.min.z).project(camera);
    if (!Number.isFinite(corner.x) || !Number.isFinite(corner.y) || corner.z < -1 || corner.z > 1) return true;
    const x = (corner.x + 1) * viewport.width / 2;
    const y = (1 - corner.y) * viewport.height / 2;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  const dx = Math.max(left - point.x, 0, point.x - right);
  const dy = Math.max(top - point.y, 0, point.y - bottom);
  return dx * dx + dy * dy <= (radius + 1) * (radius + 1);
}

function raycastMoles(candidates, camera, viewport, point) {
  pointer.set(point.x / viewport.width * 2 - 1, 1 - point.y / viewport.height * 2);
  raycaster.setFromCamera(pointer, camera);
  let nearest = Infinity;
  let selected = null;
  candidates.forEach(({ plot, index }) => {
    for (const hit of raycaster.intersectObject(plot.mole.rig, true)) {
      let visible = true;
      for (let part = hit.object; part; part = part.parent) {
        if (!part.visible) { visible = false; break; }
      }
      if (!visible || plot.plane.distanceToPoint(hit.point) < 0 || hit.distance >= nearest) continue;
      nearest = hit.distance;
      selected = index;
    }
  });
  return selected;
}

export function findMoleAtPoint(entries, camera, viewport, point, radius = HIT_RADIUS_PX) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
      viewport.width <= 0 || viewport.height <= 0) return null;
  camera.updateMatrixWorld();
  const candidates = [];
  entries.forEach(({ plot, motion }, index) => {
    if (motion.target !== 1 || !plot.root.visible || !plot.mole.rig.visible) return;
    plot.root.updateMatrixWorld(true);
    if (nearMole(plot, camera, viewport, point, radius)) candidates.push({ plot, index });
  });
  if (!candidates.length) return null;
  for (const ring of samplePoints(point, Math.max(0, radius))) {
    for (const sample of ring) {
      const selected = raycastMoles(candidates, camera, viewport, sample);
      if (selected !== null) return selected;
    }
  }
  return null;
}
