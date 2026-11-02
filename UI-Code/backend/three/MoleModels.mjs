import * as THREE from "../../vendor/three/three.module.min.js";

const palettes = {
  normal: ["#946044", "#efd3ad", "#d98b95"],
  golden: ["#ffc52e", "#ffe992", "#d78e28"],
  frozen: ["#89d8f4", "#e8faff", "#9cbdde"],
  ice: ["#24549d", "#a9cce9", "#7688b5"],
  fire: ["#c94038", "#ffc393", "#922f40"],
};

const landscapes = {
  grassland: ["#88af60", "#49782d", "#805239", "#151910"],
  freezing: ["#dae9ef", "#7eb6ca", "#667f94", "#142431"],
  fire: ["#665658", "#85432f", "#59342d", "#24120e"],
  toxic: ["#829554", "#607338", "#62503e", "#171d10"],
  void: ["#8a84a5", "#5f507c", "#51405e", "#161121"],
};

export function createModelKit() {
  const geometries = new Set();
  const materials = new Set();
  const keep = (geometry) => { geometries.add(geometry); return geometry; };
  const sphere = keep(new THREE.SphereGeometry(1, 24, 18));
  const crystal = keep(new THREE.ConeGeometry(1, 1, 5));
  const pebble = keep(new THREE.IcosahedronGeometry(1, 1));
  const circle = keep(new THREE.CircleGeometry(1, 48));
  const rim = keep(new THREE.TorusGeometry(0.97, 0.11, 12, 64));
  const crownBand = keep(new THREE.TorusGeometry(0.35, 0.045, 8, 32));
  const well = keep(new THREE.CylinderGeometry(0.87, 0.8, 0.64, 48, 1, true));
  const earth = keep(new THREE.LatheGeometry([
    new THREE.Vector2(0.88, 0.31), new THREE.Vector2(1.02, 0.34),
    new THREE.Vector2(1.17, 0.24), new THREE.Vector2(1.34, 0.12),
    new THREE.Vector2(0.88, 0.1),
  ], 64));
  const material = (color, options = {}) => {
    const value = new THREE.MeshStandardMaterial({ color, roughness: 0.65, ...options });
    materials.add(value);
    return value;
  };
  function mesh(parent, geometry, surface, position, scale = [1, 1, 1]) {
    const part = new THREE.Mesh(geometry, surface);
    part.position.set(...position);
    part.scale.set(...scale);
    part.castShadow = true;
    part.receiveShadow = true;
    parent.add(part);
    return part;
  }
  function tube(points, radius) {
    return keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(
      points.map((point) => new THREE.Vector3(...point))
    ), 12, radius, 5, false));
  }
  const whiskers = [-1, 1].flatMap((side) => [0, 1, 2].map((index) =>
    tube([
      [side * 0.23, 1.16, 0.74],
      [side * 0.51, 1.18 + index * 0.045, 0.76],
      [side * 0.78, 1.13 + index * 0.11, 0.72],
    ], 0.011)
  ));
  const fuse = tube([[0, 0.26, 0], [0.04, 0.4, 0], [0.15, 0.42, 0.01]], 0.025);

  function createMole(clippingPlane) {
    const rig = new THREE.Group();
    rig.name = "mole";
    const options = { clippingPlanes: [clippingPlane], clipShadows: true };
    const fur = material(palettes.normal[0], options);
    const cream = material(palettes.normal[1], options);
    const pink = material(palettes.normal[2], { ...options, roughness: 0.35 });
    const dark = material("#251b23", { ...options, roughness: 0.16 });
    const ivory = material("#fff5dd", { ...options, roughness: 0.3 });
    const gold = material("#ffcd42", { ...options, metalness: 0.65, roughness: 0.25 });
    const ice = material("#c9f3ff", { ...options, metalness: 0.22, roughness: 0.18, flatShading: true });
    const coal = material("#2c303e", { ...options, metalness: 0.35, roughness: 0.27 });
    const spark = material("#ffcb56", { ...options, emissive: "#ff641b", emissiveIntensity: 1.5 });
    mesh(rig, sphere, fur, [0, 0.93, 0], [0.65, 0.92, 0.54]);
    mesh(rig, sphere, cream, [0, 0.63, 0.43], [0.43, 0.5, 0.18]);
    mesh(rig, sphere, fur, [0, 1.46, 0.05], [0.66, 0.63, 0.58]);
    for (const side of [-1, 1]) {
      mesh(rig, sphere, fur, [side * 0.57, 1.72, 0.01], [0.22, 0.26, 0.16]);
      mesh(rig, sphere, pink, [side * 0.59, 1.74, 0.145], [0.12, 0.15, 0.045]);
      mesh(rig, sphere, fur, [side * 0.57, 0.55, 0.3], [0.22, 0.37, 0.25]);
      mesh(rig, sphere, cream, [side * 0.56, 0.35, 0.49], [0.23, 0.16, 0.21]);
      for (let toe = 0; toe < 3; toe++) {
        mesh(rig, sphere, ivory, [side * 0.56 + (toe - 1) * 0.1, 0.32, 0.66], [0.035, 0.05, 0.09]);
      }
      mesh(rig, sphere, cream, [side * 0.19, 1.12, 0.57], [0.3, 0.23, 0.22]);
    }
    mesh(rig, sphere, dark, [0, 1.01, 0.705], [0.14, 0.12, 0.045]);
    for (const side of [-1, 1]) {
      mesh(rig, sphere, ivory, [side * 0.062, 1, 0.753], [0.058, 0.115, 0.04]);
    }
    mesh(rig, sphere, pink, [0, 1.25, 0.8], [0.17, 0.115, 0.12]);
    const eyes = [-1, 1].map((side) => {
      const eye = new THREE.Group();
      eye.position.set(side * 0.27, 1.57, 0.553);
      rig.add(eye);
      mesh(eye, sphere, dark, [0, 0, 0], [0.105, 0.14, 0.075]);
      mesh(eye, sphere, ivory, [-0.025, 0.045, 0.066], [0.031, 0.037, 0.017]);
      return eye;
    });
    for (const geometry of whiskers) mesh(rig, geometry, ivory, [0, 0, 0]);
    const crown = new THREE.Group();
    crown.name = "golden-crown";
    crown.position.set(0, 2.05, 0.06);
    rig.add(crown);
    const band = mesh(crown, crownBand, gold, [0, 0, 0]);
    band.rotation.x = Math.PI / 2;
    for (let point = 0; point < 5; point++) {
      const angle = point * Math.PI * 2 / 5;
      mesh(crown, crystal, gold, [Math.sin(angle) * 0.3, 0.12, Math.cos(angle) * 0.3], [0.1, 0.36, 0.1]);
    }
    const crystals = new THREE.Group();
    crystals.name = "ice-crystals";
    rig.add(crystals);
    for (let index = 0; index < 5; index++) {
      const shard = mesh(crystals, crystal, ice,
        [(index - 2) * 0.19, 2.08 - Math.abs(index - 2) * 0.06, 0.12],
        [0.12, 0.5 - Math.abs(index - 2) * 0.05, 0.13]);
      shard.rotation.z = (2 - index) * 0.22;
    }
    const bomb = new THREE.Group();
    bomb.name = "bomb";
    bomb.position.set(0.33, 0.61, 0.73);
    bomb.scale.setScalar(1.5);
    rig.add(bomb);
    mesh(bomb, sphere, coal, [0, 0, 0], [0.3, 0.3, 0.3]);
    mesh(bomb, sphere, gold, [0, 0.28, 0], [0.08, 0.05, 0.08]);
    mesh(bomb, fuse, cream, [0, 0, 0]);
    mesh(bomb, pebble, spark, [0.16, 0.42, 0.01], [0.065, 0.065, 0.065]);
    function setVariant(type = "normal", variantClass = "") {
      const variant = type === "golden" ? "golden" : type === "frozen" ? "frozen"
        : variantClass.includes("-ice") ? "ice" : variantClass.includes("-fire") ? "fire" : "normal";
      const colors = palettes[variant];
      fur.color.set(colors[0]);
      cream.color.set(colors[1]);
      pink.color.set(colors[2]);
      fur.metalness = variant === "golden" ? 0.65 : variant === "frozen" ? 0.15 : 0;
      fur.roughness = variant === "golden" || variant === "frozen" ? 0.3 : 0.7;
      crown.visible = variant === "golden";
      crystals.visible = variant === "frozen";
      bomb.visible = type === "bomb";
      rig.userData.variant = variant;
      rig.userData.type = type;
    }
    setVariant();
    return { rig, eyes, fur, setVariant };
  }

  function createPlot() {
    const root = new THREE.Group();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.12);
    const grass = material(landscapes.grassland[1]);
    const soil = material(landscapes.grassland[2]);
    const rimSurface = material(landscapes.grassland[0], { roughness: 0.95, envMapIntensity: 0.25 });
    rimSurface.color.multiplyScalar(0.72);
    const inner = material(landscapes.grassland[3], { side: THREE.DoubleSide, roughness: 1, envMapIntensity: 0.1 });
    const rock = material("#c8b995", { roughness: 0.95, flatShading: true });
    mesh(root, earth, soil, [0, 0, 0]);
    const lip = mesh(root, rim, rimSurface, [0, 0.31, 0]);
    lip.rotation.x = Math.PI / 2;
    mesh(root, well, inner, [0, -0.03, 0]);
    const bottom = mesh(root, circle, inner, [0, -0.36, 0]);
    bottom.rotation.x = -Math.PI / 2;
    for (let index = 0; index < 9; index++) {
      const angle = index * 2.4 + 0.4;
      const radius = 1.28 + (index % 3) * 0.08;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (index % 3 === 0) {
        const stone = mesh(root, pebble, rock, [x, 0.16, z], [0.12, 0.055, 0.085]);
        stone.rotation.y = angle;
      } else {
        for (let blade = 0; blade < 3; blade++) {
          const leaf = mesh(root, sphere, grass, [x + (blade - 1) * 0.07, 0.23, z], [0.035, 0.13, 0.018]);
          leaf.rotation.z = (blade - 1) * -0.4;
        }
      }
    }
    const mole = createMole(plane);
    root.add(mole.rig);
    mole.rig.position.y = -2.6;
    mole.rig.visible = false;
    return {
      root, plane, mole, soil,
      setEnvironment(name) {
        const colors = landscapes[name] || landscapes.grassland;
        [grass, soil, inner].forEach((surface, index) => surface.color.set(colors[index + 1]));
        rimSurface.color.set(colors[0]).multiplyScalar(0.72);
      },
      updateClippingPlane() {
        root.updateMatrixWorld(true);
        plane.setFromNormalAndCoplanarPoint(
          new THREE.Vector3(0, 1, 0).transformDirection(root.matrixWorld),
          root.localToWorld(new THREE.Vector3(0, 0.12, 0))
        );
      },
    };
  }
  return {
    createPlot,
    dispose() {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((surface) => surface.dispose());
    },
  };
}
