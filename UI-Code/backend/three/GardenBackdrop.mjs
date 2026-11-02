import * as THREE from "../../vendor/three/three.module.min.js";
import { createGardenScene } from "./GardenScene.mjs";

export class GardenBackdrop {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = true;
    this.canvas = this.renderer.domElement;
    this.canvas.className = "garden-backdrop-3d";
    this.canvas.setAttribute("aria-hidden", "true");
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color();
    this.scene.fog = new THREE.Fog(0xb8dce8, 45, 150);
    this.camera = new THREE.PerspectiveCamera(43, 1, 0.1, 180);
    this.garden = createGardenScene();
    this.scene.add(this.garden.root);
    this.fill = new THREE.HemisphereLight(0xf3f4e1, 0x66774b, 2);
    this.scene.add(this.fill);
    this.sun = new THREE.DirectionalLight(0xfff0d5, 2.5);
    this.sun.position.set(-14, 25, 14);
    this.sun.target.position.set(0, 0, -7);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 140 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.resize = this.resize.bind(this);
    this.frame = this.frame.bind(this);
    this.onVisibility = () => {
      this.lastTime = null;
      this.renderer.setAnimationLoop(document.hidden || this.failed ? null : this.frame);
    };
    this.onContextLost = (event) => {
      event.preventDefault();
      this.failed = true;
      document.body.classList.remove("garden-3d-ready");
      this.canvas.hidden = true;
      this.renderer.setAnimationLoop(null);
      this.onAvailability?.(false);
    };
    this.onContextRestored = () => {
      try {
        this.failed = false;
        this.resize();
        this.onAvailability?.(true);
        this.render(0, performance.now());
        this.canvas.hidden = false;
        document.body.classList.add("garden-3d-ready");
        this.onVisibility();
      } catch (error) {
        this.onContextLost({ preventDefault() {} });
        console.warn("3D garden could not be restored; using the CSS background.", error);
      }
    };
    this.setEnvironment("grassland");
  }

  mount() {
    document.body.prepend(this.canvas);
    this.resize();
    this.render(0, performance.now());
    document.body.classList.add("garden-3d-ready");
    this.onAvailability?.(true);
    window.addEventListener("resize", this.resize);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.canvas.addEventListener("webglcontextlost", this.onContextLost);
    this.canvas.addEventListener("webglcontextrestored", this.onContextRestored);
    this.onVisibility();
  }

  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  setEnvironment(name) {
    const theme = this.garden.setEnvironment(name);
    this.scene.background.set(theme.sky);
    this.scene.fog.color.set(theme.sky);
    this.sun.color.set(theme.light);
    this.canvas.dataset.environment = name || "grassland";
  }

  render(seconds, time) {
    const distance = this.camera.aspect < 1 ? 29 : 24;
    this.camera.position.set(0, 18, distance);
    this.camera.lookAt(0, 0, -8);
    this.camera.updateMatrixWorld();
    this.onUpdate?.(seconds, time);
    this.garden.update(seconds, time, this.reducedMotion.matches);
    this.renderer.render(this.scene, this.camera);
  }

  frame(time) {
    if (this.lastTime != null && time - this.lastTime < 1000 / 60 - 1) return;
    const seconds = this.lastTime == null ? 0 : Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;
    try {
      this.render(seconds, time);
    } catch (error) {
      this.onContextLost({ preventDefault() {} });
      console.warn("3D garden unavailable; using the CSS background.", error);
    }
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener("resize", this.resize);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    this.garden.dispose();
    this.renderer.dispose();
    this.canvas.remove();
    document.body.classList.remove("garden-3d-ready");
  }
}
