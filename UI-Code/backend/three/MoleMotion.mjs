export class MoleMotion {
  constructor(model) {
    this.model = model;
    this.progress = 0;
    this.target = 0;
    this.appearance = null;
    this.pending = null;
  }

  show(type, variant = "") {
    const next = { type, variant };
    if (this.progress > 0 && this.appearance &&
        (this.appearance.type !== type || this.appearance.variant !== variant)) {
      this.pending = next;
      this.target = 0;
    } else {
      this.apply(next);
    }
  }

  apply(appearance) {
    this.appearance = appearance;
    this.pending = null;
    this.model.setVariant(appearance.type, appearance.variant);
    this.target = 1;
  }

  hide() {
    this.pending = null;
    this.target = 0;
  }

  update(seconds, time, reducedMotion = false) {
    const step = seconds / (this.target ? 0.18 : 0.16);
    this.progress = reducedMotion ? this.target : this.target
      ? Math.min(1, this.progress + step) : Math.max(0, this.progress - step);
    if (this.progress === 0 && this.pending) {
      this.apply(this.pending);
      if (reducedMotion) this.progress = 1;
    }
    const eased = this.progress * this.progress * (3 - 2 * this.progress);
    const rig = this.model.rig;
    rig.visible = this.progress > 0;
    rig.position.y = -2.6 * (1 - eased);
    rig.rotation.y = 0.22 + (reducedMotion ? 0 : Math.sin(time * 1.6) * 0.07);
    const blink = reducedMotion ? 1 : Math.cos(time * 1.05) > 0.997 ? 0.12 : 1;
    this.model.eyes.forEach((eye) => { eye.scale.y = blink; });
  }
}
