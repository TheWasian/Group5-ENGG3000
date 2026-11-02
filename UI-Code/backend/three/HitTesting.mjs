import * as THREE from "../../vendor/three/three.module.min.js";

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

export function findMoleAtPoint(entries, camera, viewport, point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
      viewport.width <= 0 || viewport.height <= 0) return null;
  pointer.set(point.x / viewport.width * 2 - 1, 1 - point.y / viewport.height * 2);
  camera.updateMatrixWorld();
  raycaster.setFromCamera(pointer, camera);
  let nearest = Infinity;
  let selected = null;
  entries.forEach(({ plot, motion }, index) => {
    if (motion.target !== 1 || !plot.root.visible || !plot.mole.rig.visible) return;
    plot.root.updateMatrixWorld(true);
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
