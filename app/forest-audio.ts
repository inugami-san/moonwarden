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

  async toggle() {
    if (this.enabled) { this.enabled = false; return false; }
    try {
      this.context ??= new AudioContext();
      await this.context.resume();
      this.enabled = this.context.state === "running";
    } catch { this.enabled = false; }
    return this.enabled;
  }

  rustle(listener: Point, source: Point) {
    const context = this.context;
    const distance = Math.hypot(source.x - listener.x, source.y - listener.y);
    if (!this.enabled || !context || context.state !== "running" || distance > HEARING_RANGE) return;
    if (!this.noise) {
      this.noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.18), context.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const noise = context.createBufferSource();
    noise.buffer = this.noise;
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

  destroy() { this.enabled = false; void this.context?.close().catch(() => undefined); this.context = null; }
}
