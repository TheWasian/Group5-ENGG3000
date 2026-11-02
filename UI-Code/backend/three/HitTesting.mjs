import * as THREE from "../../vendor/three/three.module.min.js";

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

// How far (in screen pixels) from the hammer head a mole can still be hit
export const HIT_RADIUS_PX = 45;
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

function raycastMoles(entries, camera, viewport, point) {
  pointer.set(point.x / viewport.width * 2 - 1, 1 - point.y / viewport.height * 2);
  raycaster.setFromCamera(pointer, camera);
  let nearest = Infinity;
  let selected = null;
  entries.forEach(({ plot, motion }, index) => {
    if (motion.target !== 1 || !plot.root.visible || !plot.mole.rig.visible) return;
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
  entries.forEach(({ plot }) => plot.root.updateMatrixWorld(true));
  for (const ring of samplePoints(point, Math.max(0, radius))) {
    for (const sample of ring) {
      const selected = raycastMoles(entries, camera, viewport, sample);
      if (selected !== null) return selected;
    }
  }
  return null;
}
