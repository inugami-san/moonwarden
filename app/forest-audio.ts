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

  /** Intense multi-chomp predator devour sound: lunge snarl, 3 wet bone-crunch bites, and heavy swallow gulp. */
  devour(listener: Point, source: Point, direct = false) {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === "suspended") void this.context.resume();
    } catch {
      return;
    }
    const context = this.context;
    if (!context || context.state !== "running") return;

    const distance = Math.hypot(source.x - listener.x, source.y - listener.y);
    if (!direct && distance > HEARING_RANGE) return;

    const now = context.currentTime;
    const intensity = direct ? 0.92 : Math.max(0.18, 0.72 * (1 - distance / HEARING_RANGE));
    const noiseBuffer = this.ensureNoise(context);

    const master = context.createGain();
    master.gain.setValueAtTime(intensity, now);
    if (!direct && distance > 12) {
      const panner = context.createPanner();
      panner.panningModel = "HRTF";
      panner.positionX.value = (source.x - listener.x) / 90;
      panner.positionZ.value = (source.y - listener.y) / 90;
      master.connect(panner).connect(context.destination);
    } else {
      master.connect(context.destination);
    }

    // 1. Abyssal lunge snarl (0.00s - 0.26s)
    const snarl = context.createOscillator();
    const snarlGain = context.createGain();
    const snarlFilter = context.createBiquadFilter();
    snarl.type = "sawtooth";
    snarl.frequency.setValueAtTime(158, now);
    snarl.frequency.exponentialRampToValueAtTime(42, now + 0.25);
    snarlFilter.type = "lowpass";
    snarlFilter.frequency.setValueAtTime(640, now);
    snarlFilter.Q.value = 4.5;
    snarlGain.gain.setValueAtTime(0.001, now);
    snarlGain.gain.linearRampToValueAtTime(0.32, now + 0.025);
    snarlGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    snarl.connect(snarlFilter).connect(snarlGain).connect(master);
    snarl.start(now);
    snarl.stop(now + 0.27);

    // 2. Three violent chomps (jaw snap + bone crunch + wet slime squelch)
    const chompOffsets = [0.08, 0.31, 0.54];
    for (const [idx, offset] of chompOffsets.entries()) {
      const t = now + offset;
      const biteBoost = idx === 2 ? 1.22 : 1.0;

      // Crunch noise burst
      const crunch = context.createBufferSource();
      crunch.buffer = noiseBuffer;
      const crunchFilter = context.createBiquadFilter();
      crunchFilter.type = "bandpass";
      crunchFilter.frequency.setValueAtTime(1180 - idx * 130, t);
      crunchFilter.Q.value = 2.8;
      const crunchGain = context.createGain();
      crunchGain.gain.setValueAtTime(0.001, t);
      crunchGain.gain.linearRampToValueAtTime(0.42 * biteBoost, t + 0.008);
      crunchGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      crunch.connect(crunchFilter).connect(crunchGain).connect(master);
      crunch.start(t);
      crunch.stop(t + 0.15);

      // Wet gelatinous rip / squelch
      const squelch = context.createOscillator();
      const lfo = context.createOscillator();
      const lfoGain = context.createGain();
      const squelchFilter = context.createBiquadFilter();
      const squelchGain = context.createGain();
      squelch.type = "triangle";
      squelch.frequency.setValueAtTime(370 - idx * 35, t);
      squelch.frequency.exponentialRampToValueAtTime(68, t + 0.18);
      lfo.type = "sine";
      lfo.frequency.value = 34;
      lfoGain.gain.value = 88;
      lfo.connect(lfoGain).connect(squelch.frequency);
      squelchFilter.type = "lowpass";
      squelchFilter.frequency.setValueAtTime(980, t);
      squelchFilter.frequency.exponentialRampToValueAtTime(190, t + 0.18);
      squelchFilter.Q.value = 6.2;
      squelchGain.gain.setValueAtTime(0.001, t);
      squelchGain.gain.linearRampToValueAtTime(0.34 * biteBoost, t + 0.015);
      squelchGain.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
      squelch.connect(squelchFilter).connect(squelchGain).connect(master);
      lfo.start(t);
      squelch.start(t);
      lfo.stop(t + 0.2);
      squelch.stop(t + 0.2);
    }

    // 3. Heavy swallow gulp & bone pop (0.76s - 1.04s)
    const gulpTime = now + 0.76;
    const gulp = context.createOscillator();
    const gulpFilter = context.createBiquadFilter();
    const gulpGain = context.createGain();
    gulp.type = "sine";
    gulp.frequency.setValueAtTime(145, gulpTime);
    gulp.frequency.exponentialRampToValueAtTime(34, gulpTime + 0.24);
    gulpFilter.type = "lowpass";
    gulpFilter.frequency.setValueAtTime(420, gulpTime);
    gulpFilter.frequency.exponentialRampToValueAtTime(60, gulpTime + 0.24);
    gulpFilter.Q.value = 7;
    gulpGain.gain.setValueAtTime(0.001, gulpTime);
    gulpGain.gain.linearRampToValueAtTime(0.46, gulpTime + 0.03);
    gulpGain.gain.exponentialRampToValueAtTime(0.001, gulpTime + 0.26);
    gulp.connect(gulpFilter).connect(gulpGain).connect(master);
    gulp.start(gulpTime);
    gulp.stop(gulpTime + 0.27);
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
