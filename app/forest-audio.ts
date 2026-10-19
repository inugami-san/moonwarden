import { HEARING_RANGE } from "../server/ordeal-rules";

type Point = { x: number; y: number };

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

/** Short synthesized leaf/footstep texture; created only after a user gesture. */
export class ForestAudio {
  private context: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  enabled = false;

  async unlock() {
    if (!this.enabled) return false;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === "suspended") {
        await this.context.resume();
      }
      return this.context.state === "running";
    } catch {
      return false;
    }
  }

  async toggle() {
    if (this.enabled && this.context?.state === "running") {
      this.enabled = false;
      return false;
    }
    try {
      this.context ??= new AudioContext();
      await this.context.resume();
      this.enabled = this.context.state === "running";
    } catch {
      this.enabled = false;
    }
    return this.enabled;
  }

  private ensureNoise(context: AudioContext) {
    if (!this.noise) {
      this.noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.35), context.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }

  rustle(listener: Point, source: Point) {
    const context = this.context;
    const distance = Math.hypot(source.x - listener.x, source.y - listener.y);
    if (!this.enabled || !context || context.state !== "running" || distance > HEARING_RANGE) return;
    const noise = context.createBufferSource();
    noise.buffer = this.ensureNoise(context);
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1100;
    const volume = context.createGain();
    const level = 0.14 * (1 - distance / HEARING_RANGE);
    volume.gain.setValueAtTime(0, context.currentTime);
    volume.gain.linearRampToValueAtTime(level, context.currentTime + 0.015);
    volume.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.17);
    const panner = context.createPanner();
    panner.panningModel = "HRTF";
    panner.positionX.value = (source.x - listener.x) / 100;
    panner.positionZ.value = (source.y - listener.y) / 100;
    noise.connect(filter).connect(volume).connect(panner).connect(context.destination);
    noise.onended = () => { noise.disconnect(); filter.disconnect(); volume.disconnect(); panner.disconnect(); };
    noise.start();
    noise.stop(context.currentTime + 0.18);
  }

  /** Soft membrane stretch, bubbling absorption, then a single low gulp. */
  devour(listener: Point, source: Point, direct = false) {
    if (!this.enabled) return;
    const distance = Math.hypot(source.x - listener.x, source.y - listener.y);
    if (!direct && distance > HEARING_RANGE) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === "suspended") void this.context.resume();
    } catch { return; }
    const context = this.context;
    if (!context || context.state !== "running") return;
    const now = context.currentTime;
    const master = context.createGain();
    master.gain.value = direct ? .48 : Math.max(.08, .35 * (1 - distance / HEARING_RANGE));
    const panner = context.createPanner();
    panner.panningModel = "HRTF";
    panner.positionX.value = (source.x - listener.x) / 100;
    panner.positionZ.value = (source.y - listener.y) / 100;
    master.connect(panner).connect(context.destination);
    for (const [offset, duration, from, to, level] of [
      [.08, .42, 180, 310, .16],
      [.52, .28, 290, 110, .24],
      [1.03, .36, 155, 48, .5],
    ]) {
      const tone = context.createOscillator();
      const volume = context.createGain();
      const filter = context.createBiquadFilter();
      const start = now + offset;
      tone.type = "sine";
      tone.frequency.setValueAtTime(from, start);
      tone.frequency.exponentialRampToValueAtTime(to, start + duration);
      filter.type = "lowpass";
      filter.frequency.value = 650;
      filter.Q.value = 5;
      volume.gain.setValueAtTime(.0001, start);
      volume.gain.exponentialRampToValueAtTime(level, start + .045);
      volume.gain.exponentialRampToValueAtTime(.0001, start + duration);
      tone.connect(filter).connect(volume).connect(master);
      tone.onended = () => {
        tone.disconnect(); filter.disconnect(); volume.disconnect();
        if (offset > 1) { master.disconnect(); panner.disconnect(); }
      };
      tone.start(start);
      tone.stop(start + duration + .02);
    }
  }

  /** Resonant sanctuary bronze bell & urgent sub-pulse when a voting meeting is called. */
  meetingAlert(isBodyReport = false) {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === "suspended") void this.context.resume();
    } catch {
      return;
    }
    const context = this.context;
    if (!context || context.state !== "running") return;

    const now = context.currentTime;
    const master = context.createGain();
    master.gain.setValueAtTime(0.55, now);
    master.connect(context.destination);

    // 1. Deep resonant shockwave impact
    const sub = context.createOscillator();
    const subGain = context.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(isBodyReport ? 118 : 136, now);
    sub.frequency.exponentialRampToValueAtTime(38, now + 0.48);
    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.45, now + 0.02);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    sub.connect(subGain).connect(master);
    sub.start(now);
    sub.stop(now + 0.52);

    // 2. Two-strike sanctuary chime (urgent minor interval for body report, fourth for warden bell)
    const notes = isBodyReport ? [523.25, 622.25, 415.3] : [523.25, 659.25, 783.99];
    for (const [idx, freq] of notes.entries()) {
      const t = now + idx * 0.14;
      const bell = context.createOscillator();
      const overtone = context.createOscillator();
      const bellGain = context.createGain();
      const overtoneGain = context.createGain();

      bell.type = "triangle";
      bell.frequency.setValueAtTime(freq, t);
      overtone.type = "sine";
      overtone.frequency.setValueAtTime(freq * 2.41, t);

      bellGain.gain.setValueAtTime(0.001, t);
      bellGain.gain.linearRampToValueAtTime(0.28, t + 0.012);
      bellGain.gain.exponentialRampToValueAtTime(0.001, t + 0.68);

      overtoneGain.gain.setValueAtTime(0.001, t);
      overtoneGain.gain.linearRampToValueAtTime(0.11, t + 0.008);
      overtoneGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

      bell.connect(bellGain).connect(master);
      overtone.connect(overtoneGain).connect(master);
      bell.start(t);
      overtone.start(t);
      bell.stop(t + 0.7);
      overtone.stop(t + 0.3);
    }
  }

  destroy() { this.enabled = false; void this.context?.close().catch(() => undefined); this.context = null; }
}
