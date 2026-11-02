var SoundService = {
  enabled: false,
  context: null,
  output: null,
  button: null,
  revision: 0,
  voices: new Set(),

  init: function () {
    this.button = document.getElementById("sound-toggle");
    if (!this.button) return;
    if (!window.AudioContext && !window.webkitAudioContext) {
      this.button.disabled = true;
      this.button.textContent = "Sound unavailable";
      return;
    }
    this.button.addEventListener("click", () => this.setEnabled(!this.enabled));
    this.renderButton();
  },

  renderButton: function () {
    if (!this.button) return;
    this.button.textContent = "Sound: " + (this.enabled ? "On" : "Off");
    this.button.setAttribute("aria-pressed", String(this.enabled));
    this.button.title = this.enabled ? "Mute game sounds" : "Enable game sounds";
  },

  setEnabled: function (enabled) {
    this.enabled = Boolean(enabled);
    const revision = ++this.revision;
    this.renderButton();
    if (!this.enabled) {
      if (this.output) this.output.gain.value = 0;
      for (const voice of this.voices) {
        try { voice.stop(); } catch (error) {}
      }
      this.voices.clear();
      return Promise.resolve(false);
    }
    return this.unlock().then((ready) => {
      if (revision !== this.revision) return false;
      if (!ready) {
        this.setEnabled(false);
        if (this.button) this.button.title = "Audio could not start. Click to try again.";
      }
      return ready;
    });
  },

  unlock: function () {
    if (!this.enabled) return Promise.resolve(false);
    try {
      if (!this.context || this.context.state === "closed") {
        const Audio = window.AudioContext || window.webkitAudioContext;
        this.context = new Audio();
        this.output = this.context.createGain();
        this.output.connect(this.context.destination);
      }
      this.output.gain.value = 0.18;
      if (this.context.state === "running") return Promise.resolve(true);
      return this.context.resume().then(() => this.enabled && this.context.state === "running").catch(() => false);
    } catch (error) {
      return Promise.resolve(false);
    }
  },

  scheduleEffect: function (kind, context, output) {
    const notes = kind === "hit"
      ? [["triangle", 460, 140, 0, 0.12, 0.5], ["sine", 920, 500, 0, 0.07, 0.18]]
      : [["triangle", 220, 75, 0, 0.3, 0.38], ["square", 110, 48, 0.09, 0.28, 0.1]];
    return notes.map(([type, from, to, delay, duration, volume]) => {
      const voice = context.createOscillator();
      const envelope = context.createGain();
      const start = context.currentTime + delay;
      const end = start + duration;
      voice.type = type;
      voice.frequency.setValueAtTime(from, start);
      voice.frequency.exponentialRampToValueAtTime(to, end);
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.linearRampToValueAtTime(volume, start + 0.005);
      envelope.gain.exponentialRampToValueAtTime(0.0001, end);
      voice.connect(envelope);
      envelope.connect(output);
      voice.onended = () => { voice.disconnect(); envelope.disconnect(); };
      voice.start(start);
      voice.stop(end + 0.01);
      return voice;
    });
  },

  play: function (kind) {
    if (!this.enabled || !this.context || this.context.state !== "running" || document.hidden) return false;
    try {
      for (const voice of this.scheduleEffect(kind, this.context, this.output)) {
        this.voices.add(voice);
        const cleanup = voice.onended;
        voice.onended = () => { cleanup(); this.voices.delete(voice); };
      }
      return true;
    } catch (error) {
      return false;
    }
  },

  playHit: function () { return this.play("hit"); },
  playLifeLost: function () { return this.play("lifeLost"); },
};
