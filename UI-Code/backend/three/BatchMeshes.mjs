import * as THREE from "../../vendor/three/three.module.min.js";

export function batchStaticMeshes(parent, keep) {
  const batches = new Map();
  for (const child of [...parent.children]) {
    if (!child.isMesh) {
      batchStaticMeshes(child, keep);
      continue;
    }
    if (Array.isArray(child.material)) continue;
    const key = [child.material.uuid, child.visible, child.castShadow, child.receiveShadow].join(":");
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(child);
  }
  for (const parts of batches.values()) {
    if (parts.length < 2) continue;
    const transformed = parts.map((part) => {
      part.updateMatrix();
      return part.geometry.clone().applyMatrix4(part.matrix);
    });
    const merged = new THREE.BufferGeometry();
    const indices = [];
    let vertexOffset = 0;
    for (const geometry of transformed) {
      const count = geometry.index?.count ?? geometry.attributes.position.count;
      for (let index = 0; index < count; index++) indices.push(vertexOffset + (geometry.index?.getX(index) ?? index));
      vertexOffset += geometry.attributes.position.count;
    }
    for (const name of Object.keys(transformed[0].attributes)) {
      const first = transformed[0].attributes[name];
      const length = transformed.reduce((total, geometry) => total + geometry.attributes[name].array.length, 0);
      const values = new first.array.constructor(length);
      let offset = 0;
      for (const geometry of transformed) {
        values.set(geometry.attributes[name].array, offset);
        offset += geometry.attributes[name].array.length;
      }
      merged.setAttribute(name, new THREE.BufferAttribute(values, first.itemSize, first.normalized));
    }
    merged.setIndex(indices);
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const batch = new THREE.Mesh(keep(merged), parts[0].material);
    batch.name = "batched-parts";
    batch.visible = parts[0].visible;
    batch.castShadow = parts[0].castShadow;
    batch.receiveShadow = parts[0].receiveShadow;
    parts.forEach((part) => parent.remove(part));
    parent.add(batch);
    transformed.forEach((geometry) => geometry.dispose());
  }
}
