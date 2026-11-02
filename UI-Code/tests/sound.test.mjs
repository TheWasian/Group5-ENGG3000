import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const button = {
  textContent: "", attributes: {}, listeners: {},
  addEventListener(name, callback) { this.listeners[name] = callback; },
  setAttribute(name, value) { this.attributes[name] = value; },
};
const contexts = [];
class AudioParam {
  value = 0;
  setValueAtTime(value, time) { assert(Number.isFinite(value) && Number.isFinite(time)); }
  linearRampToValueAtTime(value, time) { this.setValueAtTime(value, time); }
  exponentialRampToValueAtTime(value, time) { assert(value > 0); this.setValueAtTime(value, time); }
}
class AudioContext {
  constructor() {
    this.state = "suspended";
    this.currentTime = 1;
    this.destination = {};
    this.sources = [];
    contexts.push(this);
  }
  createGain() { return { gain: new AudioParam(), connect() {}, disconnect() {} }; }
  createOscillator() {
    const source = {
      frequency: new AudioParam(), stops: [],
      connect() {}, disconnect() {}, start(time) { this.started = time; },
      stop(time) { this.stops.push(time); },
    };
    this.sources.push(source);
    return source;
  }
  async resume() {
    if (this.rejectResume) throw new Error("Audio blocked");
    this.state = "running";
  }
}
const view = new Proxy({ holes: Array.from({ length: 6 }, () => ({})) }, { get: (target, key) => target[key] || (() => {}) });
const scope = vm.createContext({
  window: { AudioContext }, document: { hidden: false, getElementById: () => button },
  GameView: view, performance: { now: () => 100 },
  setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
});
for (const path of ["SoundService", "services/LevelingService", "services/MoleService", "services/EnvironmentService", "services/GameConditionService", "services/HighScoreService", "services/GameService"]) {
  vm.runInContext(readFileSync(new URL("../backend/" + path + ".js", import.meta.url), "utf8"), scope);
}
const sound = scope.SoundService;
const game = scope.GameService;
sound.init();
assert.equal(button.textContent, "Sound: Off");
assert.equal(contexts.length, 0, "loading the page creates no audio context");
game.startGame();
game.spawnMole("normal", 0);
game.whackHole(0, "sensor");
game.spawnMole("bomb", 0);
game.whackHole(0, "mouse");
assert.equal(contexts.length, 0, "muted gameplay remains completely silent");
await button.listeners.click();
assert.equal(sound.enabled, true);
assert.equal(button.attributes["aria-pressed"], "true");
assert.equal(contexts.length, 1);
assert.equal(contexts[0].state, "running", "the sound toggle unlocks audio from a user action");
const effects = [];
const originalPlay = sound.play;
sound.play = function (kind) { effects.push(kind); return originalPlay.call(this, kind); };
for (const type of ["normal", "golden", "frozen"]) {
  game.startGame();
  game.spawnMole(type, 0);
  effects.length = 0;
  const before = contexts[0].sources.length;
  game.whackHole(1, "mouse");
  assert.equal(effects.length, 0, "clicking an empty hole has no sound");
  game.whackHole(0, "sensor");
  assert.deepEqual(effects, ["hit"]);
  assert(contexts[0].sources.length > before, "a successful hit schedules audio");
  game.whackHole(0, "sensor");
  assert.deepEqual(effects, ["hit"], "duplicate hit attempts do not repeat the sound");
}
game.startGame();
effects.length = 0;
game.spawnMole("bomb", 0);
game.whackHole(0, "mouse");
assert.deepEqual(effects, ["lifeLost"], "bombs play one loss effect");
assert.equal(game.game.lives, 2);
effects.length = 0;
game.spawnMole("normal", 0);
game.moleEscaped();
assert.deepEqual(effects, ["lifeLost"], "missing a normal mole also plays the loss effect");
effects.length = 0;
game.spawnMole("golden", 0);
game.moleEscaped();
assert.deepEqual(effects, [], "an escape without life loss remains silent");
const active = [...sound.voices];
await button.listeners.click();
assert.equal(sound.enabled, false);
assert.equal(sound.output.gain.value, 0);
assert(active.every((voice) => voice.stops.at(-1) === undefined), "muting stops scheduled and active voices immediately");
assert.equal(sound.voices.size, 0);
const before = contexts[0].sources.length;
sound.playHit();
assert.equal(contexts[0].sources.length, before);
contexts[0].rejectResume = true;
contexts[0].state = "suspended";
assert.equal(await sound.setEnabled(true), false);
assert.equal(sound.enabled, false, "failed browser audio activation returns to muted");
assert.equal(contexts[0].sources.length, before, "blocked sounds are never queued for later playback");
contexts[0].rejectResume = false;
await sound.setEnabled(true);
scope.document.hidden = true;
assert.equal(sound.playHit(), false, "background pages do not play effects");
scope.document.hidden = false;
assert.equal(sound.playHit(), true);
for (const voice of [...sound.voices]) voice.onended();
assert.equal(sound.voices.size, 0, "finished sounds release their audio nodes");
await sound.setEnabled(false);
scope.window.AudioContext = class { constructor() { throw new Error("Audio unavailable"); } };
sound.context = null;
assert.equal(await sound.setEnabled(true), false);
game.startGame();
game.spawnMole("normal", 0);
assert.equal(game.whackHole(0, "mouse").hit, true, "audio failures cannot break scoring");
console.log("PASS: silent startup, explicit audio activation, mouse/sensor hit effects, bomb/miss life-loss effects, duplicate rejection, immediate mute, blocked audio recovery and node cleanup.");
