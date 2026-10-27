import * as THREE from "../../vendor/three/three.module.min.js";
import { createModelKit } from "./MoleModels.mjs";
import { MoleMotion } from "./MoleMotion.mjs";
import { GardenBackdrop } from "./GardenBackdrop.mjs";
import { layoutGroundPlot } from "./GroundLayout.mjs";

export class ThreeBoard {
  constructor(element) {
    this.element = element;
    this.holes = Array.from(element.querySelectorAll(".hole"));
    this.backdrop = new GardenBackdrop();
    this.renderer = this.backdrop.renderer;
    this.scene = this.backdrop.scene;
    this.camera = this.backdrop.camera;
    this.canvas = this.backdrop.canvas;
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
  }

  hideAll() {
    this.entries.forEach((entry) => entry.motion.hide());
  }

  flash(index) {
    const entry = this.entries[index];
    if (entry) entry.flashUntil = performance.now() + 250;
  }

  setEnvironment(name) {
    this.entries.forEach((entry) => entry.plot.setEnvironment(name));
    this.backdrop.setEnvironment(name);
  }

  frame(seconds, time) {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const boxes = this.holes.map((hole) => hole.getBoundingClientRect());
    const openings = this.entries.map((entry, index) => {
      const opening = layoutGroundPlot(entry.plot, this.camera, viewport, boxes[index]);
      entry.motion.update(seconds, time / 1000 + index * 1.7, this.reducedMotion.matches);
      entry.plot.soil.emissive.setHex(entry.flashUntil > time ? 0x467d7d : 0);
      entry.plot.soil.emissiveIntensity = 0.6;
      return opening;
    });
    this.backdrop.garden.setOpenings(openings);
  }

  dispose() {
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
