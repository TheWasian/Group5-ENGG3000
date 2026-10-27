import * as THREE from "../../vendor/three/three.module.min.js";

const themes = {
  grassland: { sky: "#b8dce8", ground: "#88af60", hill: "#83a967", leaf: ["#426c39", "#66984b", "#8fb65b"], wood: "#a77b50", path: "#d6c69d", flower: "#e8a5ba", light: "#fff0d5" },
  freezing: { sky: "#bdd9e9", ground: "#dae9ef", hill: "#a7c6d9", leaf: ["#638b9d", "#a6c6d0", "#e2f1f1"], wood: "#839da9", path: "#b8ccd8", flower: "#acc1ed", light: "#e8f3ff" },
  fire: { sky: "#bd9691", ground: "#665658", hill: "#b48061", leaf: ["#754735", "#b05e35", "#d39146"], wood: "#986344", path: "#d9b58a", flower: "#efac55", light: "#ffd9a4" },
  toxic: { sky: "#b9c99a", ground: "#829554", hill: "#71835b", leaf: ["#495f32", "#748a46", "#a1b360"], wood: "#786d4c", path: "#c5bd8c", flower: "#b58acb", light: "#ecf1bb" },
  void: { sky: "#b9b3d0", ground: "#8a84a5", hill: "#83789d", leaf: ["#514661", "#78688e", "#a294b8"], wood: "#817086", path: "#beb1cb", flower: "#d4a5e6", light: "#e6dafa" },
};

export function createGardenScene() {
  const root = new THREE.Group();
  root.name = "garden-landscape";
  const geometries = new Set();
  const materials = new Set();
  const batches = new Map();
  const layers = Object.fromEntries(Object.keys(themes).map((name) => {
    const group = new THREE.Group();
    group.name = name + "-scenery";
    group.visible = name === "grassland";
    root.add(group);
    return [name, group];
  }));
  let layer = root;
  const openings = Array.from({ length: 12 }, () => new THREE.Vector3());
  function cutGround(surface) {
    surface.onBeforeCompile = (shader) => {
      shader.uniforms.groundOpenings = { value: openings };
      shader.vertexShader = "varying vec3 vGroundPosition;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `
        #include <project_vertex>
        vec4 groundPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          groundPosition = instanceMatrix * groundPosition;
        #endif
        vGroundPosition = (modelMatrix * groundPosition).xyz;
      `);
      shader.fragmentShader = "varying vec3 vGroundPosition;\nuniform vec3 groundOpenings[12];\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <clipping_planes_fragment>", `
        #include <clipping_planes_fragment>
        for (int hole = 0; hole < 12; hole++) {
          vec3 opening = groundOpenings[hole];
          if (opening.z > 0.0 && distance(vGroundPosition.xz, opening.xy) < opening.z) discard;
        }
      `);
    };
    surface.customProgramCacheKey = () => "ground-openings-v1";
    return surface;
  }
  const keep = (geometry) => { geometries.add(geometry); return geometry; };
  const sphere = keep(new THREE.IcosahedronGeometry(1, 2));
  const smooth = keep(new THREE.SphereGeometry(1, 16, 12));
  const cylinder = keep(new THREE.CylinderGeometry(1, 1, 1, 8));
  const box = keep(new THREE.BoxGeometry(1, 1, 1));
  const cone = keep(new THREE.ConeGeometry(1, 1, 8));
  const shard = keep(new THREE.ConeGeometry(1, 1, 5));
  const mountain = keep(new THREE.CylinderGeometry(0.2, 1, 1, 10));
  const plane = keep(new THREE.PlaneGeometry(180, 180));
  const material = (color, options = {}) => {
    const value = new THREE.MeshStandardMaterial({ color, roughness: 0.95, ...options });
    materials.add(value);
    return value;
  };
  const ground = cutGround(material("#88af60"));
  const hill = material("#83a967");
  const leaves = ["#426c39", "#66984b", "#8fb65b"].map((color) => material(color));
  const wood = material("#a77b50");
  const fence = material("#ead9b4");
  const path = cutGround(material("#d6c69d"));
  const stone = material("#a6aba0");
  const petals = material("#e8a5ba");
  const white = material("#fff3d2");
  const yellow = material("#e2b859");
  const clouds = [];
  const cloudMaterial = material("#fff9e9", { roughness: 1 });
  const transform = new THREE.Object3D();
  const edgeX = (x, z) => Math.sign(x) * Math.max(Math.abs(x), 18 + Math.max(0, -z) * 0.45);
  function place(geometry, surface, position, scale, rotation = [0, 0, 0]) {
    const key = layer.uuid + geometry.uuid + surface.uuid;
    if (!batches.has(key)) batches.set(key, { geometry, surface, matrices: [], parent: layer });
    transform.position.set(...position);
    transform.scale.set(...scale);
    transform.rotation.set(...rotation);
    transform.updateMatrix();
    batches.get(key).matrices.push(transform.matrix.clone());
  }
  function branch(start, end, radius) {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    transform.position.copy(a).add(b).multiplyScalar(0.5);
    transform.scale.set(radius, a.distanceTo(b), radius);
    transform.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    transform.updateMatrix();
    const key = layer.uuid + cylinder.uuid + wood.uuid;
    if (!batches.has(key)) batches.set(key, { geometry: cylinder, surface: wood, matrices: [], parent: layer });
    batches.get(key).matrices.push(transform.matrix.clone());
  }
  place(plane, ground, [0, 0, -25], [1, 1, 1], [-Math.PI / 2, 0, 0]);
  layer = layers.grassland;
  for (const [x, y, z, sx, sy, sz] of [
    [-52, -1.5, -95, 23, 9, 12], [0, -3, -130, 42, 12, 14],
    [53, -1.8, -96, 24, 10, 13], [-68, -1, -75, 20, 6, 12], [68, -1, -78, 19, 7, 12],
  ]) place(smooth, hill, [x, y, z], [sx, sy, sz]);

  const trail = new THREE.CatmullRomCurve3([
    new THREE.Vector3(8, 0.015, 15), new THREE.Vector3(6, 0.015, 5),
    new THREE.Vector3(7, 0.015, -2), new THREE.Vector3(3, 0.015, -10),
    new THREE.Vector3(3, 0.015, -22),
    new THREE.Vector3(3, 0.015, -50), new THREE.Vector3(6, 0.015, -110),
  ]);
  const vertices = [];
  const indices = [];
  for (let index = 0; index <= 64; index++) {
    const t = index / 64;
    const point = trail.getPoint(t);
    const tangent = trail.getTangent(t);
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(1.05 - t * 0.5);
    vertices.push(point.x + side.x, point.y, point.z + side.z, point.x - side.x, point.y, point.z - side.z);
    if (index < 64) {
      const a = index * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const trailGeometry = keep(new THREE.BufferGeometry());
  trailGeometry.name = "garden-path";
  trailGeometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  trailGeometry.setIndex(indices);
  trailGeometry.computeVertexNormals();
  place(trailGeometry, path, [0, 0, 0], [1, 1, 1]);

  for (const [originalX, z, size] of [[-11, 0, 1.2], [11, -3, 1.25], [-15, -10, 1.1], [15, -15, 1.2], [-12, -21, 0.95], [13, -25, 1], [-20, -25, 1.3], [24, -27, 1.4]]) {
    const x = edgeX(originalX, z);
    branch([x, 0, z], [x + 0.08, 3.2 * size, z], 0.24 * size);
    branch([x, 1.8 * size, z], [x - 1.05 * size, 3.1 * size, z], 0.11 * size);
    branch([x, 2.2 * size, z], [x + 1.1 * size, 3.4 * size, z + 0.2], 0.12 * size);
    [[0, 4.1, 0, 1.6], [-1, 3.4, 0.2, 1.25], [1.05, 3.65, 0.1, 1.3], [0.15, 3.1, 0.75, 1.2], [0, 4.5, -0.5, 1.2]].forEach(([dx, dy, dz, radius], index) => {
      place(sphere, leaves[index % 3], [x + dx * size, dy * size, z + dz * size], [radius * size, radius * size, radius * size]);
    });
    place(sphere, leaves[0], [x - 0.7, 0.4, z + 0.6], [0.8, 0.55, 0.7]);
  }

  for (let index = -8; index <= 8; index++) {
    const x = index * 2.3;
    if (Math.abs(x) < 2) continue;
    place(box, fence, [x, 0.85, -60], [0.18, 1.7, 0.18]);
    place(sphere, fence, [x, 1.73, -60], [0.16, 0.12, 0.16]);
    if (index < 8 && index !== -1) {
      place(box, fence, [x + 1.15, 0.7, -60], [2.3, 0.12, 0.12]);
      place(box, fence, [x + 1.15, 1.28, -60], [2.3, 0.12, 0.12]);
    }
  }
  for (let index = 0; index < 10; index++) {
    const z = -14 + index * 2.3;
    place(box, fence, [-18.4, 0.85, z], [0.18, 1.7, 0.18]);
    if (index < 9) {
      place(box, fence, [-18.4, 0.7, z + 1.15], [0.12, 0.12, 2.3]);
      place(box, fence, [-18.4, 1.28, z + 1.15], [0.12, 0.12, 2.3]);
    }
  }
  for (let index = 0; index < 32; index++) {
    const side = index % 2 ? 1 : -1;
    const z = 10 - Math.floor(index / 2) * 1.8;
    const x = edgeX(side * (7.8 + Math.sin(index * 3.1) * 1.7), z);
    const radius = 0.18 + (index % 3) * 0.06;
    place(sphere, stone, [x, radius * 0.32, z], [radius * 1.3, radius * 0.65, radius], [0, index, 0]);
    if (index % 2) continue;
    const flowerX = x + side * 0.6;
    const height = 0.45 + (index % 3) * 0.12;
    place(cylinder, leaves[0], [flowerX, height / 2, z], [0.025, height, 0.025]);
    place(smooth, yellow, [flowerX, height, z], [0.11, 0.11, 0.08]);
    for (let petal = 0; petal < 5; petal++) {
      const angle = petal * Math.PI * 2 / 5;
      place(smooth, index % 4 ? white : petals, [flowerX + Math.sin(angle) * 0.17, height + Math.cos(angle) * 0.17, z - 0.01], [0.12, 0.16, 0.06], [0, 0, -angle]);
    }
    place(smooth, leaves[1], [flowerX + 0.12, height * 0.5, z], [0.19, 0.055, 0.08], [0, 0, 0.4]);
  }
  for (const [x, y, z, size] of [[-20, 13, -35, 1], [11, 15, -44, 1.3], [27, 11, -32, 0.8]]) {
    const cloud = new THREE.Group();
    cloud.position.set(x, y, z);
    cloud.userData.baseX = x;
    [[-1.6, 0, 0, 1.4], [0, 0.6, 0, 1.8], [1.7, 0, 0, 1.4], [0, -0.3, 0.3, 1.6]].forEach(([dx, dy, dz, radius]) => {
      const puff = new THREE.Mesh(smooth, cloudMaterial);
      puff.position.set(dx * size, dy * size, dz);
      puff.scale.set(radius * size, radius * size * 0.7, radius * size);
      cloud.add(puff);
    });
    layers.grassland.add(cloud);
    clouds.push(cloud);
  }
  const sunMaterial = new THREE.MeshBasicMaterial({ color: "#ffedbd", fog: false });
  materials.add(sunMaterial);
  const sun = new THREE.Mesh(smooth, sunMaterial);
  sun.position.set(-27, 21, -65);
  sun.scale.setScalar(3.3);
  root.add(sun);

  layer = layers.freezing;
  const pine = material("#416a73");
  const snow = material("#e8f3f4");
  const ice = material("#80c8e8", { metalness: 0.2, roughness: 0.2, flatShading: true });
  const pond = material("#83b8d0", { metalness: 0.35, roughness: 0.15 });
  for (const [originalX, z, size] of [[-11, 0, 1.1], [12, -4, 1.2], [-15, -13, 1.5], [15, -18, 1.4], [-20, -30, 1.7], [22, -34, 1.8]]) {
    const x = edgeX(originalX, z);
    place(cylinder, wood, [x, size, z], [0.2 * size, 2 * size, 0.2 * size]);
    for (let tier = 0; tier < 3; tier++) {
      const radius = (1.8 - tier * 0.45) * size;
      const y = (2 + tier * 1.05) * size;
      place(cone, pine, [x, y, z], [radius, 2.4 * size, radius]);
      place(cone, snow, [x, y + 0.4 * size, z], [radius * 0.82, 1.8 * size, radius * 0.82]);
    }
    place(smooth, snow, [x + 0.7, 0.12, z + 0.3], [2.1 * size, 0.35, 1.5 * size]);
  }
  for (const [x, z, size] of [[-40, -66, 1.1], [40, -63, 1.2], [-60, -91, 1.5], [61, -94, 1.6]]) {
    place(cone, ice, [x, 7 * size, z], [9 * size, 14 * size, 9 * size]);
    place(cone, snow, [x, 11.4 * size, z], [3.6 * size, 5.4 * size, 3.6 * size]);
  }
  place(smooth, pond, [18, 0.035, 6], [3.4, 0.06, 4.2]);
  for (let index = 0; index < 14; index++) {
    const side = index % 2 ? -1 : 1;
    const z = 9 - Math.floor(index / 2) * 4;
    const x = edgeX(side * (9.5 + index % 3 * 0.5), z);
    place(shard, ice, [x, 0.7, z], [0.45, 1.7 + index % 3 * 0.4, 0.5], [0, index, side * 0.2]);
    place(smooth, snow, [x, 0.08, z], [0.9, 0.18, 0.7]);
  }

  layer = layers.fire;
  const basalt = material("#423a3d", { flatShading: true });
  const lava = cutGround(new THREE.MeshBasicMaterial({ color: "#ff681c", toneMapped: false }));
  const lavaBank = cutGround(new THREE.MeshBasicMaterial({ color: "#a72d22", toneMapped: false }));
  materials.add(lava);
  materials.add(lavaBank);
  const burnt = material("#33292a");
  const lavaGeometry = keep(trailGeometry.clone());
  const lavaPositions = lavaGeometry.attributes.position;
  const routeBase = Float32Array.from(trailGeometry.attributes.position.array);
  lavaGeometry.computeVertexNormals();
  const banks = keep(lavaGeometry.clone());
  const bankPositions = banks.attributes.position;
  for (let index = 0; index < bankPositions.count; index += 2) {
    const left = new THREE.Vector3().fromBufferAttribute(bankPositions, index);
    const right = new THREE.Vector3().fromBufferAttribute(bankPositions, index + 1);
    const middle = left.clone().add(right).multiplyScalar(0.5);
    left.sub(middle).multiplyScalar(1.3).add(middle);
    right.sub(middle).multiplyScalar(1.3).add(middle);
    bankPositions.setXYZ(index, left.x, left.y, left.z);
    bankPositions.setXYZ(index + 1, right.x, right.y, right.z);
  }
  place(banks, lavaBank, [0, 0.005, 0], [1, 1, 1]);
  place(lavaGeometry, lava, [0, 0.01, 0], [1, 1, 1]);
  const eruptions = [];
  const smoke = material("#64565d", { transparent: true, opacity: 0.55, depthWrite: false });
  const ejecta = new THREE.MeshBasicMaterial({ color: "#ff8c20", toneMapped: false });
  materials.add(ejecta);
  for (const [x, z, size] of [[-25, -27, 0.7], [27, -31, 0.8]]) {
    place(mountain, basalt, [x, 4.5 * size, z], [6 * size, 9 * size, 6 * size]);
    place(smooth, lava, [x, 9 * size + 0.02, z], [1.18 * size, 0.09, 1.18 * size]);
    const sparks = new THREE.InstancedMesh(sphere, ejecta, 32);
    const plume = new THREE.InstancedMesh(sphere, smoke, 10);
    sparks.name = "volcano-ejecta";
    plume.name = "volcano-smoke";
    sparks.visible = plume.visible = false;
    sparks.frustumCulled = plume.frustumCulled = false;
    layers.fire.add(sparks, plume);
    eruptions.push({ x, z, height: 9 * size, sparks, plume, age: -1, delay: 2 + Math.random() * 5, velocities: [] });
  }
  for (let index = 0; index < 18; index++) {
    const side = index % 2 ? -1 : 1;
    const z = 9 - Math.floor(index / 2) * 4;
    const x = edgeX(side * (10 + index % 4), z);
    const size = 0.7 + index % 3 * 0.3;
    place(sphere, basalt, [x, size * 0.45, z], [size * 1.2, size, size], [0.2, index, 0.1]);
    place(shard, lava, [x + 0.3, size * 0.7, z], [0.12, size * 0.8, 0.12], [0, index, 0.5]);
    if (index % 3 === 0) {
      place(cylinder, burnt, [x, 1.6, z - 1.5], [0.14, 3.2, 0.14], [0, 0, side * 0.1]);
      place(cylinder, burnt, [x + side * 0.45, 2.4, z - 1.5], [0.08, 1.3, 0.08], [0, 0, side * -0.7]);
    }
  }

  function updateRoute() {
    for (let index = 0; index < routeBase.length / 3; index += 2) {
      const offset = index * 3;
      const z = (routeBase[offset + 2] + routeBase[offset + 5]) / 2;
      const center = (routeBase[offset] + routeBase[offset + 3]) / 2;
      let routed = center;
      for (const opening of openings) {
        if (opening.z <= 0) continue;
        routed = Math.max(routed, opening.x + opening.z * 1.7 + 2.5 - Math.max(0, Math.abs(z - opening.y) - opening.z * 2) * 0.25);
      }
      for (const [geometry, width] of [[trailGeometry, 1], [lavaGeometry, 1], [banks, 1.3]]) {
        const positions = geometry.attributes.position;
        for (let side = 0; side < 2; side++) {
          const source = offset + side * 3;
          positions.setXYZ(index + side, routed + (routeBase[source] - center) * width, routeBase[source + 1], z + (routeBase[source + 2] - z) * width);
        }
        positions.needsUpdate = true;
      }
    }
    for (const geometry of [trailGeometry, lavaGeometry, banks]) {
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
    }
    root.traverse((part) => {
      if (part.isInstancedMesh && [trailGeometry, lavaGeometry, banks].includes(part.geometry)) part.computeBoundingSphere();
    });
  }
  function updateEruptions(seconds, reducedMotion) {
    for (const burst of eruptions) {
      if (!layers.fire.visible || reducedMotion) {
        burst.sparks.visible = burst.plume.visible = false;
        burst.age = -1;
        continue;
      }
      if (burst.age < 0) {
        burst.delay -= seconds;
        if (burst.delay > 0) continue;
        burst.age = 0;
        burst.velocities = Array.from({ length: 32 }, () => {
          const angle = Math.random() * Math.PI * 2;
          const speed = 1 + Math.random() * 2;
          return [Math.cos(angle) * speed, 5 + Math.random() * 5, Math.sin(angle) * speed];
        });
      }
      burst.age += seconds;
      const age = burst.age;
      burst.sparks.visible = burst.plume.visible = true;
      burst.velocities.forEach(([vx, vy, vz], index) => {
        const y = burst.height + vy * age - 2.8 * age * age;
        transform.position.set(burst.x + vx * age, Math.max(0, y), burst.z + vz * age);
        transform.rotation.set(age, index + age, age * 2);
        transform.scale.setScalar(y > 0 ? (0.1 + index % 4 * 0.035) * Math.max(0, Math.min(1, (4 - age) * 2)) : 0);
        transform.updateMatrix();
        burst.sparks.setMatrixAt(index, transform.matrix);
      });
      for (let index = 0; index < 10; index++) {
        const rise = Math.max(0, age - index * 0.09);
        transform.position.set(burst.x + Math.sin(index * 2.4) * rise * 0.5, burst.height + rise * 2.2, burst.z + Math.cos(index * 2.4) * rise * 0.5);
        transform.scale.setScalar((0.4 + rise * 0.6) * Math.min(1, Math.max(0, 4 - age)));
        transform.updateMatrix();
        burst.plume.setMatrixAt(index, transform.matrix);
      }
      burst.sparks.instanceMatrix.needsUpdate = burst.plume.instanceMatrix.needsUpdate = true;
      if (age >= 4) {
        burst.sparks.visible = burst.plume.visible = false;
        burst.age = -1;
        burst.delay = 6 + Math.random() * 8;
      }
    }
  }

  layer = layers.toxic;
  const cap = material("#9879b3");
  const stalk = material("#bdc48b");
  const ooze = material("#89b92d", { emissive: "#548117", emissiveIntensity: 0.4, roughness: 0.3 });
  for (let index = 0; index < 16; index++) {
    const side = index % 2 ? -1 : 1;
    const z = 10 - Math.floor(index / 2) * 5;
    const x = edgeX(side * (10 + index % 3), z);
    const size = 0.8 + index % 3 * 0.3;
    place(cylinder, stalk, [x, size, z], [0.18 * size, 2 * size, 0.18 * size]);
    place(smooth, cap, [x, 2 * size, z], [1.25 * size, 0.5 * size, 1.25 * size]);
    place(sphere, ooze, [x + 0.3, 2.45 * size, z], [0.15, 0.08, 0.15]);
  }
  place(smooth, ooze, [-19, 0.03, 2], [3.6, 0.06, 5]);

  layer = layers.void;
  const obsidian = material("#49395f", { metalness: 0.35, roughness: 0.3, flatShading: true });
  const amethyst = material("#bc87df", { emissive: "#654080", emissiveIntensity: 0.4, metalness: 0.2, roughness: 0.25 });
  for (let index = 0; index < 16; index++) {
    const side = index % 2 ? -1 : 1;
    const z = 8 - Math.floor(index / 2) * 5;
    const x = edgeX(side * (11 + index % 3 * 0.7), z);
    const size = 1 + index % 3 * 0.5;
    place(shard, obsidian, [x, size, z], [size * 0.7, size * 2.8, size * 0.9], [0, index, side * 0.1]);
    place(shard, amethyst, [x + 0.5, size * 0.7, z + 0.6], [0.3, size * 1.9, 0.4], [0, index, side * 0.35]);
  }

  const particles = [];
  for (const [name, color, size, velocity] of [["freezing", "#ffffff", 0.08, -0.8], ["fire", "#ffb665", 0.075, 0.8], ["void", "#ede0ff", 0.055, 0]]) {
    const positions = new Float32Array(150 * 3);
    for (let index = 0; index < 150; index++) {
      positions[index * 3] = Math.sin(index * 7.13) * 27;
      positions[index * 3 + 1] = (index * 0.73) % 18;
      positions[index * 3 + 2] = Math.cos(index * 2.71) * 30 - 12;
    }
    const geometry = keep(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const surface = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.7, depthWrite: false });
    materials.add(surface);
    const points = new THREE.Points(geometry, surface);
    layers[name].add(points);
    particles.push({ points, velocity });
  }
  for (const { geometry, surface, matrices, parent } of batches.values()) {
    const instances = new THREE.InstancedMesh(geometry, surface, matrices.length);
    matrices.forEach((matrix, index) => instances.setMatrixAt(index, matrix));
    instances.castShadow = geometry !== plane && geometry !== trailGeometry;
    instances.receiveShadow = true;
    instances.computeBoundingSphere();
    parent.add(instances);
  }
  return {
    root, clouds, layers, openings,
    setOpenings(values) {
      let changed = false;
      openings.forEach((opening, index) => {
        const next = values[index];
        if (next ? opening.distanceToSquared(next) > 0.000001 : opening.z !== 0) changed = true;
        if (next) opening.copy(next);
        else opening.set(0, 0, 0);
      });
      if (changed) updateRoute();
    },
    setEnvironment(name) {
      const selected = themes[name] ? name : "grassland";
      const theme = themes[selected];
      Object.entries(layers).forEach(([key, group]) => { group.visible = key === selected; });
      sun.visible = selected !== "void";
      ground.color.set(theme.ground);
      hill.color.set(theme.hill);
      leaves.forEach((surface, index) => surface.color.set(theme.leaf[index]));
      wood.color.set(theme.wood);
      path.color.set(theme.path);
      petals.color.set(theme.flower);
      root.userData.theme = selected;
      return theme;
    },
    update(seconds, time, reducedMotion) {
      clouds.forEach((cloud, index) => {
        cloud.position.x = cloud.userData.baseX + (reducedMotion ? 0 : Math.sin(time / 16000 + index) * 0.7);
      });
      updateEruptions(seconds, reducedMotion);
      if (reducedMotion) return;
      particles.forEach(({ points, velocity }) => {
        if (!points.parent.visible || !velocity) return;
        const positions = points.geometry.attributes.position;
        for (let index = 0; index < positions.count; index++) positions.setY(index, (positions.getY(index) + seconds * velocity + 18) % 18);
        positions.needsUpdate = true;
      });
    },
    dispose() {
      root.traverse((part) => { if (part.isInstancedMesh) part.dispose(); });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((surface) => surface.dispose());
    },
  };
}
