import * as THREE from "../../vendor/three/three.module.min.js";
import { createModelKit } from "./MoleModels.mjs";
import { MoleMotion } from "./MoleMotion.mjs";
import { GardenBackdrop } from "./GardenBackdrop.mjs";
import { layoutGroundPlot } from "./GroundLayout.mjs";
import { findMoleAtPoint } from "./HitTesting.mjs";

export class ThreeBoard {
  constructor(element) {
    this.element = element;
    this.holes = Array.from(element.querySelectorAll(".hole"));
    this.backdrop = new GardenBackdrop();
    this.renderer = this.backdrop.renderer;
    this.scene = this.backdrop.scene;
    this.camera = this.backdrop.camera;
    this.canvas = this.backdrop.canvas;
    this.layoutDirty = true;
    this.nextLayoutCheck = 0;
    this.layoutBoxes = null;
    this.layoutViewport = null;
    this.markLayoutDirty = () => { this.layoutDirty = true; };
    this.backdrop.onResize = this.markLayoutDirty;
    this.layoutObserver = new ResizeObserver(this.markLayoutDirty);
    this.kit = createModelKit();
    this.entries = this.holes.map(() => {
      const plot = this.kit.createPlot();
      this.scene.add(plot.root);
      return { plot, motion: new MoleMotion(plot.mole), flashUntil: 0 };
    });
    this.environment = this.makeEnvironment();
    this.scene.environment = this.environment;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.backdrop.onUpdate = (seconds, time) => this.frame(seconds, time);
    this.backdrop.onAvailability = (available) => {
      this.element.classList.toggle("board-3d-ready", available);
      this.element.dataset.renderer = available ? "threejs" : "css";
      if (available) this.syncFromDOM();
    };
  }

  makeEnvironment() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    const sky = context.createLinearGradient(0, 0, 0, 128);
    sky.addColorStop(0, "#ffffff");
    sky.addColorStop(0.48, "#d9e8ef");
    sky.addColorStop(0.52, "#9aa87c");
    sky.addColorStop(1, "#48503b");
    context.fillStyle = sky;
    context.fillRect(0, 0, 256, 128);
    context.fillStyle = "#ffffff";
    context.fillRect(20, 15, 45, 30);
    context.fillRect(165, 25, 55, 20);
    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  mount() {
    this.syncFromDOM();
    this.backdrop.mount();
    this.layoutObserver.observe(this.element);
    this.holes.forEach((hole) => this.layoutObserver.observe(hole));
    window.addEventListener("scroll", this.markLayoutDirty, true);
  }

  syncFromDOM() {
    const theme = ["freezing", "fire", "toxic", "void"].find((name) => document.body.classList.contains("env-" + name));
    this.setEnvironment(theme || "grassland");
    this.hideAll();
    this.holes.forEach((hole, index) => {
      if (!hole.classList.contains("active")) return;
      const classes = hole.querySelector(".mole").className;
      const type = /\bmole-(normal|golden|frozen|bomb)\b/.exec(classes)?.[1] || "normal";
      this.show(index, type, classes);
    });
    this.entries.forEach((entry, index) => entry.motion.update(0, index, true));
  }

  show(index, type, variant) {
    this.entries[index]?.motion.show(type, variant);
    this.backdrop.shadowDirty = true;
  }

  hideAll() {
    this.entries.forEach((entry) => entry.motion.hide());
    this.backdrop.shadowDirty = true;
  }

  flash(index) {
    const entry = this.entries[index];
    if (entry) entry.flashUntil = performance.now() + 250;
  }

  hitTestMarker(point) {
    this.updateLayout(performance.now(), true);
    return findMoleAtPoint(this.entries, this.camera,
      { width: window.innerWidth, height: window.innerHeight }, point);
  }

  setEnvironment(name) {
    this.entries.forEach((entry) => entry.plot.setEnvironment(name));
    this.backdrop.setEnvironment(name);
  }

  updateLayout(time, force = false) {
    if (!force && !this.layoutDirty && time < this.nextLayoutCheck) return false;
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const boxes = this.holes.map((hole) => hole.getBoundingClientRect());
    this.layoutDirty = false;
    this.nextLayoutCheck = time + 250;
    const changed = !this.layoutViewport || viewport.width !== this.layoutViewport.width || viewport.height !== this.layoutViewport.height ||
      boxes.some((box, index) => ["left", "top", "width", "height"].some((key) => box[key] !== this.layoutBoxes[index][key]));
    if (!changed) return false;
    this.layoutBoxes = boxes;
    this.layoutViewport = viewport;
    const openings = this.entries.map((entry, index) => {
      const opening = layoutGroundPlot(entry.plot, this.camera, viewport, boxes[index]);
      entry.plot.root.updateMatrixWorld(true);
      const anchor = entry.plot.root.localToWorld(new THREE.Vector3(0, 2.5, 0)).project(this.camera);
      this.holes[index].style.setProperty("--mole-timer-x", ((anchor.x + 1) * viewport.width / 2 - boxes[index].left) + "px");
      this.holes[index].style.setProperty("--mole-timer-y", ((1 - anchor.y) * viewport.height / 2 - boxes[index].top - 12) + "px");
      return opening;
    });
    this.backdrop.garden.setOpenings(openings);
    this.backdrop.shadowDirty = true;
    return true;
  }

  frame(seconds, time) {
    this.updateLayout(time);
    let animating = false;
    this.entries.forEach((entry, index) => {
      entry.motion.update(seconds, time / 1000 + index * 1.7, this.reducedMotion.matches);
      const flash = entry.flashUntil > time;
      if (flash !== entry.flashing) {
        entry.plot.soil.emissive.setHex(flash ? 0x467d7d : 0);
        entry.plot.soil.emissiveIntensity = 0.6;
        entry.flashing = flash;
      }
      animating ||= entry.motion.progress > 0 || entry.motion.target > 0 || Boolean(entry.motion.pending);
    });
    return animating && !this.reducedMotion.matches;
  }

  dispose() {
    this.layoutObserver.disconnect();
    window.removeEventListener("scroll", this.markLayoutDirty, true);
    this.backdrop.dispose();
    this.kit.dispose();
    this.environment.dispose();
    this.element.classList.remove("board-3d-ready");
    this.element.dataset.renderer = "css";
    if (window.MoleBoard3D === this) delete window.MoleBoard3D;
  }
}

const element = document.getElementById("game-area");
if (element && !window.MoleBoard3D) {
  let board;
  try {
    board = new ThreeBoard(element);
    board.mount();
    window.MoleBoard3D = board;
  } catch (error) {
    board?.dispose();
    element.dataset.renderer = "css";
    console.warn("3D board unavailable; using CSS moles.", error);
  }
}
