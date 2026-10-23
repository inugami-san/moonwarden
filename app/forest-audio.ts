import { HEARING_RANGE } from "../server/ordeal-rules";

type Point = { x: number; y: number };
export type ForestCue = "ui" | "task-open" | "task-correct" | "task-error" | "task-complete" | "item-use" | "vote" | "ordeal-start" | "calm" | "victory" | "defeat" | "step";
type Voice = { nodes: AudioNode[]; sources: Set<AudioScheduledSourceNode>; output: GainNode; finished: boolean };

export function soundDirection(listener: Point, source: Point) {
  const dx = source.x - listener.x;
  const dy = source.y - listener.y;
  if (Math.hypot(dx, dy) > HEARING_RANGE) return "";
  if (Math.hypot(dx, dy) < 45) return "Rustling nearby";
  const vertical = Math.abs(dy) > 50 ? dy < 0 ? "north" : "south" : "";
  const horizontal = Math.abs(dx) > 50 ? dx < 0 ? "west" : "east" : "";
  const direction = [vertical, horizontal].filter(Boolean).join("-");
  return direction ? `Rustling ${direction}` : "Rustling nearby";
}

const CUE_COOLDOWN: Record<Exclude<ForestCue, "step">, number> = {
  ui: .075, "task-open": .25, "task-correct": .12, "task-error": .32,
  "task-complete": .65, "item-use": .24, vote: .35, "ordeal-start": .9,
  calm: .9, victory: 1.5, defeat: 1.5,
};

/** Quiet, entirely synthesized forest foley. Only unlock/toggle (gesture handlers) create an AudioContext. */
export class ForestAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = new Set<Voice>();
  private lastPlayed = new Map<string, number>();
  private active = false;

  get enabled() { return this.active; }
  set enabled(value: boolean) {
    this.active = value;
    if (this.master && this.context) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setValueAtTime(value ? .8 : 0, this.context.currentTime);
    }
    // Cancel future notes as well as audible ones: unmuting must never replay an old tail.
    if (!value) {
      for (const voice of [...this.voices]) this.release(voice, true);
      this.lastPlayed.clear();
    }
  }

  async unlock() {
    if (!this.enabled) return false;
    try {
      if (!this.context) {
        const Context = globalThis.AudioContext ?? (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Context) return false;
        this.context = new Context();
        this.master = this.context.createGain();
        this.master.gain.value = .8;
        this.master.connect(this.context.destination);
      }
      const context = this.context;
      if (context.state === "suspended") await context.resume();
      return this.context === context && this.enabled && context.state === "running";
    } catch {
      return false;
    }
  }

  async toggle() {
    if (this.enabled) { this.enabled = false; return false; }
    this.enabled = true;
    if (!await this.unlock()) this.enabled = false;
    return this.enabled;
  }

  private release(voice: Voice, cancel = false) {
    if (voice.finished) return;
    voice.finished = true;
    this.voices.delete(voice);
    for (const source of voice.sources) {
      source.onended = null;
      if (cancel) { try { source.stop(); } catch { /* Already stopped. */ } }
    }
    voice.sources.clear();
    for (const node of voice.nodes) node.disconnect();
  }

  private voice(key: string, cooldown: number, level: number, listener?: Point, source?: Point): Voice | null {
    const context = this.context;
    if (!this.enabled || !context || !this.master || context.state !== "running") return null;
    if (this.voices.size >= 10 || context.currentTime - (this.lastPlayed.get(key) ?? -Infinity) < cooldown) return null;
    this.lastPlayed.set(key, context.currentTime);
    const output = context.createGain();
    output.gain.value = level;
    const voice: Voice = { output, nodes: [output], sources: new Set(), finished: false };
    if (listener && source) {
      const panner = context.createPanner();
      panner.panningModel = "HRTF";
      panner.positionX.value = (source.x - listener.x) / 100;
      panner.positionZ.value = (source.y - listener.y) / 100;
      output.connect(panner).connect(this.master);
      voice.nodes.push(panner);
    } else output.connect(this.master);
    this.voices.add(voice);
    return voice;
  }

  private source(voice: Voice, source: AudioScheduledSourceNode, nodes: AudioNode[], start: number, duration: number) {
    voice.nodes.push(source, ...nodes);
    voice.sources.add(source);
    source.onended = () => {
      source.onended = null;
      voice.sources.delete(source);
      if (voice.sources.size === 0) this.release(voice);
    };
    source.start(start);
    source.stop(start + duration + .015);
  }

  private tone(voice: Voice, offset: number, duration: number, from: number, to = from, peak = .4, shape: OscillatorType = "sine") {
    const context = this.context!;
    const start = context.currentTime + offset;
    const tone = context.createOscillator();
    const envelope = context.createGain();
    tone.type = shape;
    tone.frequency.setValueAtTime(from, start);
    tone.frequency.exponentialRampToValueAtTime(to, start + duration);
    envelope.gain.setValueAtTime(.0001, start);
    envelope.gain.exponentialRampToValueAtTime(peak, start + Math.min(.018, duration / 4));
    envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    tone.connect(envelope).connect(voice.output);
    this.source(voice, tone, [envelope], start, duration);
  }

  private bell(voice: Voice, offset: number, note: number, duration = .4, peak = .4) {
    this.tone(voice, offset, duration, note, note, peak);
    this.tone(voice, offset, duration * .6, note * 2.01, note * 2, peak * .16);
  }

  private leaves(voice: Voice, offset: number, duration: number, cutoff: number, peak = .5) {
    const context = this.context!;
    if (!this.noise) {
      this.noise = context.createBuffer(1, Math.ceil(context.sampleRate * .4), context.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const start = context.currentTime + offset;
    noise.buffer = this.noise;
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    envelope.gain.setValueAtTime(.0001, start);
    envelope.gain.exponentialRampToValueAtTime(peak, start + .015);
    envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    noise.connect(filter).connect(envelope).connect(voice.output);
    this.source(voice, noise, [filter, envelope], start, duration);
  }

  /** Interaction vocabulary: glass taps, wooden replies, and soft moon-bell rewards. */
  cue(name: ForestCue) {
    if (name === "step") return this.step();
    if (!Object.hasOwn(CUE_COOLDOWN, name)) return false;
    const voice = this.voice(`cue:${name}`, CUE_COOLDOWN[name], name === "ui" ? .12 : .21);
    if (!voice) return false;
    switch (name) {
      case "ui": this.bell(voice, 0, 880, .11, .32); break;
      case "task-open":
        this.bell(voice, 0, 392, .32); this.bell(voice, .09, 587.33, .38); break;
      case "task-correct":
        this.bell(voice, 0, 659.25, .2); this.bell(voice, .07, 880, .26); break;
      case "task-error":
        this.tone(voice, 0, .18, 220, 196, .36, "triangle");
        this.tone(voice, .12, .18, 196, 174.61, .25); break;
      case "task-complete":
        [523.25, 659.25, 783.99, 1046.5].forEach((note, i) => this.bell(voice, i * .1, note, .52, .36)); break;
      case "item-use":
        this.tone(voice, 0, .25, 293.66, 587.33, .26);
        this.bell(voice, .12, 1174.66, .34, .25); break;
      case "vote":
        this.tone(voice, 0, .09, 310, 220, .4, "triangle"); this.bell(voice, .08, 659.25, .32, .28); break;
      case "ordeal-start":
        this.bell(voice, 0, 293.66, .8); this.bell(voice, .18, 440, .8, .3);
        this.tone(voice, .12, .72, 110, 82.41, .24); break;
      case "calm":
        [392, 493.88, 587.33].forEach((note, i) => this.bell(voice, i * .14, note, .65, .3)); break;
      case "victory":
        [392, 493.88, 587.33, 783.99, 987.77].forEach((note, i) => this.bell(voice, i * .13, note, .58, .32)); break;
      case "defeat":
        [392, 349.23, 293.66].forEach((note, i) => this.bell(voice, i * .2, note, .65, .3)); break;
    }
    return true;
  }

  /** Local movement only; callers can use stone at the central moon dais, moss elsewhere. */
  step(speed = 1, surface: "moss" | "stone" = "moss") {
    if (!Number.isFinite(speed) || speed <= .1) return false;
    const voice = this.voice("step", speed > .75 ? .3 : .4, .065);
    if (!voice) return false;
    this.leaves(voice, 0, .095, surface === "stone" ? 1200 : 650, .45);
    this.tone(voice, 0, .1, surface === "stone" ? 240 : 145, surface === "stone" ? 150 : 105, .24);
    return true;
  }

  rustle(listener: Point, source: Point) {
    const distance = Math.hypot(source.x - listener.x, source.y - listener.y);
    if (!Number.isFinite(distance) || distance >= HEARING_RANGE) return false;
    const voice = this.voice("rustle", .1, .18 * (1 - distance / HEARING_RANGE), listener, source);
    if (!voice) return false;
    this.leaves(voice, 0, .18, 1100);
    return true;
  }

  ritualHum(listener: Point, source: Point) {
    const distance = Math.hypot(source.x - listener.x, source.y - listener.y);
    if (!Number.isFinite(distance) || distance >= HEARING_RANGE) return false;
    const voice = this.voice("ritual-hum", .7, .13 * (1 - distance / HEARING_RANGE), listener, source);
    if (!voice) return false;
    this.tone(voice, 0, .65, 261.63, 261.63, .3);
    this.bell(voice, .08, 523.25, .55, .2);
    return true;
  }

  /** A 1.6s visual: wrap at .2s, absorption at .45s, one gulp at .98s, then a gentle settle. */
  devour(listener: Point, source: Point, direct = false) {
    const distance = Math.hypot(source.x - listener.x, source.y - listener.y);
    if (!Number.isFinite(distance) || (!direct && distance >= HEARING_RANGE)) return false;
    const voice = this.voice("devour", .8, direct ? .3 : .21 * (1 - distance / HEARING_RANGE), listener, source);
    if (!voice) return false;
    this.tone(voice, .16, .36, 155, 260, .25);
    this.tone(voice, .46, .48, 270, 150, .2);
    this.tone(voice, .98, .25, 155, 58, .55);
    this.tone(voice, 1.24, .21, 95, 130, .12);
    return true;
  }

  /** Distinct bronze-like call, without a startling full-volume impact. */
  meetingAlert(isBodyReport = false) {
    const voice = this.voice("meeting", .8, .28);
    if (!voice) return false;
    const notes = isBodyReport ? [392, 466.16, 349.23] : [392, 493.88, 587.33];
    notes.forEach((note, i) => this.bell(voice, i * .16, note, .75, .4));
    this.tone(voice, 0, .55, 130.81, 98, .2);
    return true;
  }

  /** The Moon's Judgment: suspenseful opening as fireflies hush and rune kindles. */
  banishmentOpening() {
    const voice = this.voice("banish:open", 1.0, .24);
    if (!voice) return false;
    this.bell(voice, 0, 392, .7, .24);
    this.tone(voice, .08, .85, 196, 146.83, .2);
    return true;
  }

  /** The Moon's Judgment: delicate, slightly sad bell accompanying "[Name] was a Warden." */
  banishmentWarden() {
    const voice = this.voice("banish:warden", 1.5, .28);
    if (!voice) return false;
    [659.25, 523.25, 440].forEach((note, i) => this.bell(voice, i * .22, note, .8, .3));
    this.tone(voice, .2, .75, 220, 220, .14);
    return true;
  }

  /** The Moon's Judgment: deep thump and resonance as the rune seals over The Hollow. */
  banishmentHollow() {
    const voice = this.voice("banish:hollow", 1.5, .34);
    if (!voice) return false;
    this.tone(voice, 0, .4, 130, 55, .5);
    this.tone(voice, .06, .5, 82.41, 41.2, .4);
    this.leaves(voice, 0, .16, 500, .26);
    return true;
  }

  /** Shared forest recovery: gentle milestone bells and non-positional birdsong. */
  restoration(tier: number, milestone = false) {
    if (!Number.isInteger(tier) || tier < 1 || tier > 3) return false;
    const voice = this.voice(milestone ? "forest:bloom" : "forest:life", milestone ? 2 : 9, milestone ? .17 : .065);
    if (!voice) return false;
    if (milestone) [523.25, 659.25, 783.99].slice(0, tier).forEach((note, i) => this.bell(voice, i * .18, note, .7, .22));
    for (let i = 0; i < tier; i++) {
      this.tone(voice, .15 + i * .28, .12, 1250 + i * 140, 1610 + i * 150, .18);
      this.tone(voice, .3 + i * .28, .1, 1590 + i * 150, 1310 + i * 140, .12);
    }
    return true;
  }

  /** Final-match flourish, after the short personal win/loss cue has settled. */
  celebration(kind: "WARDEN" | "HOLLOW") {
    const voice = this.voice(`celebration:${kind}`, 6, .26);
    if (!voice) return false;
    if (kind === "WARDEN") {
      [523.25, 659.25, 783.99, 1046.5].forEach((note, i) => this.bell(voice, i * .25, note, .85, .25));
      this.tone(voice, .55, .9, 261.63, 261.63, .13);
    } else {
      this.tone(voice, 0, .9, 146.83, 73.42, .32);
      [293.66, 349.23, 440].forEach((note, i) => this.bell(voice, .25 + i * .3, note, .8, .19));
      this.leaves(voice, .45, .24, 650, .12);
    }
    return true;
  }

  destroy() {
    this.enabled = false;
    this.master?.disconnect();
    this.master = null;
    const context = this.context;
    this.context = null;
    this.noise = null;
    if (context) void context.close().catch(() => undefined);
  }
}
