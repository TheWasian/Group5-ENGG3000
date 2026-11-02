import * as THREE from "../../vendor/three/three.module.min.js";

const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();

export function groundPoint(camera, width, height, x, y) {
  raycaster.setFromCamera(new THREE.Vector2(x / width * 2 - 1, 1 - y / height * 2), camera);
  return raycaster.ray.intersectPlane(ground, new THREE.Vector3());
}

export function layoutGroundPlot(plot, camera, viewport, box) {
  const x = box.left + box.width / 2;
  const y = box.top + box.height * 0.65;
  const point = groundPoint(camera, viewport.width, viewport.height, x, y);
  const right = groundPoint(camera, viewport.width, viewport.height, x + 1, y);
  if (!point || !right || y < -150 || y > viewport.height + 150) {
    plot.root.visible = false;
    return null;
  }
  const pixels = Math.min(46, (box.width - 8) / 3.4, box.height / 3.4);
  const scale = point.distanceTo(right) * pixels;
  plot.root.visible = true;
  plot.root.position.set(point.x, -0.12 * scale, point.z);
  plot.root.rotation.set(0, 0, 0);
  plot.root.scale.setScalar(scale);
  plot.updateClippingPlane();
  return new THREE.Vector3(point.x, point.z, 0.9 * scale);
}
