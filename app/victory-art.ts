import { drawAccessory } from "./accessory-art";
import { drawSlimeSprout, slimeEyes, slimeSkin } from "./slime-art";
import { seededRandom } from "./banishment";
import { VICTORY_SECONDS, victoryProgress as progress, type MatchVictory, type VictoryAppearance } from "./match-victory";

const TAU = Math.PI * 2;
const ease = (x: number) => 1 - (1 - x) ** 3;

export function victoryLayout(width: number, height: number) {
  return { cx: width / 2, ground: height * .64, scale: Math.max(.2, Math.min(width / 820, height / 520)) };
}

/** Small, deterministic, code-native celebration. These are illustrative stage
 * companions, not an inferred/revealed roster of multiplayer allegiances. */
export class VictoryScene {
  private backdrop: HTMLCanvasElement | null = null;
  private readonly motes: { x: number; y: number; phase: number; size: number }[];

  constructor(private readonly victory: MatchVictory) {
    const random = seededRandom(`victory:${victory.kind}`);
    this.motes = Array.from({ length: 56 }, () => ({ x: (random() - .5) * 760, y: random() * 220, phase: random() * TAU, size: 1 + random() * 2 }));
  }

  private background(width: number, height: number) {
    if (this.backdrop?.width === Math.ceil(width) && this.backdrop.height === Math.ceil(height)) return this.backdrop;
    const layer = document.createElement("canvas");
    layer.width = Math.max(1, Math.ceil(width)); layer.height = Math.max(1, Math.ceil(height));
    const ctx = layer.getContext("2d");
    if (!ctx) return null;
    const hollow = this.victory.kind === "HOLLOW";
    const { cx, ground, scale: s } = victoryLayout(width, height);
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, hollow ? "#161329" : "#14283d");
    sky.addColorStop(.65, hollow ? "#34233f" : "#375961");
    sky.addColorStop(1, "#0b1826");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
    for (const depth of [0, 1]) {
      ctx.fillStyle = depth ? "#122433" : hollow ? "#302a49" : "#2b4859";
      for (let i = 0; i < 18; i++) {
        const x = i * width / 17;
        const h = (80 + (i * 43 % 110) + depth * 30) * s;
        const foot = ground + (depth ? 30 : -18) * s;
        ctx.beginPath(); ctx.moveTo(x, foot - h);
        ctx.lineTo(x + 38 * s, foot); ctx.lineTo(x - 38 * s, foot); ctx.closePath(); ctx.fill();
        ctx.fillRect(x - 3 * s, foot - 2 * s, 6 * s, 90 * s);
      }
    }
    const floor = ctx.createLinearGradient(0, ground + 24 * s, 0, height);
    floor.addColorStop(0, hollow ? "#25233b" : "#2d4852"); floor.addColorStop(1, "#0b1826");
    ctx.fillStyle = floor; ctx.fillRect(0, ground + 24 * s, width, Math.max(0, height - ground - 24 * s));
    const glow = ctx.createRadialGradient(cx, ground, 0, cx, ground, 280 * s);
    glow.addColorStop(0, hollow ? "#805b8b66" : "#b2d7cb66"); glow.addColorStop(1, "#789aa000");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = hollow ? "#25233b" : "#39545c";
    ctx.beginPath(); ctx.ellipse(cx, ground + 18 * s, 275 * s, 58 * s, 0, 0, TAU); ctx.fill();
    this.backdrop = layer;
    return layer;
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number, elapsed: number, still = false) {
    if (!(width > 0 && height > 0)) return;
    const { cx, ground, scale: s } = victoryLayout(width, height);
    const t = still ? VICTORY_SECONDS[this.victory.kind] : Math.max(0, Math.min(VICTORY_SECONDS[this.victory.kind], Number.isFinite(elapsed) ? elapsed : 0));
    const background = this.background(width, height);
    if (background) ctx.drawImage(background, 0, 0, width, height);
    const hollow = this.victory.kind === "HOLLOW";
    ctx.save(); ctx.translate(cx, ground); ctx.scale(s, s);

    // A gentle moonrise vs. a slow eclipse; neither uses flashes or screen shake.
    const moonY = -142;
    const moon = ctx.createRadialGradient(0, moonY, 20, 0, moonY, 135);
    moon.addColorStop(0, hollow ? "#d7a3d055" : "#f6e7a45c"); moon.addColorStop(1, "#d6e9c000");
    ctx.fillStyle = moon; ctx.fillRect(-150, moonY - 150, 300, 300);
    ctx.fillStyle = hollow ? "#cda4d6" : "#f5e9b7";
    ctx.beginPath(); ctx.arc(0, moonY, 44, 0, TAU); ctx.fill();
    if (hollow) {
      const eclipse = ease(progress(t, .3, 2.9));
      ctx.fillStyle = "#211c34"; ctx.beginPath(); ctx.arc(83 - eclipse * 72, moonY - 5, 43, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#c095c4"; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.ellipse(0, 12, 60 + eclipse * 148, 14 + eclipse * 26, 0, 0, TAU); ctx.stroke();
      this.roots(ctx, ease(progress(t, .7, 3.3)));
    } else {
      ctx.strokeStyle = `rgba(205,229,205,${.2 + .25 * progress(t, .4, 2)})`;
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, 16, 208, 42, 0, 0, TAU); ctx.stroke();
      for (let i = 0; i < 13; i++) {
        const angle = i / 13 * TAU;
        const bloom = ease(progress(t, .7 + i * .06, 2.1 + i * .06));
        this.flower(ctx, Math.cos(angle) * 205, 16 + Math.sin(angle) * 42, bloom);
      }
      const guest = (color: string): VictoryAppearance => ({ color, hat: "moth", eyeStyle: "JOYFUL" });
      this.slime(ctx, guest("#d9afc7"), -116, -6, t, still, .88, 1);
      this.slime(ctx, guest("#b9cd8b"), 116, -6, t, still, .88, 2);
    }
    this.slime(ctx, this.victory.hero, 0, 6, t, still, 1.2, 0);
    // Fixed particle budget, no per-frame allocations or random-number calls.
    const motion = still ? 0 : Math.sin(progress(t, 0, Math.max(1, VICTORY_SECONDS[this.victory.kind])) * Math.PI);
    for (const mote of this.motes) {
      const p = progress(t, .6, 2.8);
      const drift = Math.sin(t * .7 + mote.phase) * 12 * motion;
      const y = -mote.y - (18 + (t * 7 % 32 - 18) * motion);
      ctx.globalAlpha = p * (hollow ? .45 : .72);
      ctx.fillStyle = hollow ? "#c6a3dc" : "#f4e5ab";
      ctx.beginPath(); ctx.ellipse(mote.x + drift, y, mote.size, mote.size * .7, mote.phase, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  private slime(ctx: CanvasRenderingContext2D, look: VictoryAppearance, x: number, foot: number, t: number, still: boolean, size: number, phase: number) {
    const hollow = this.victory.kind === "HOLLOW";
    const reveal = ease(progress(t, .15 + phase * .12, 1.2 + phase * .12));
    const envelope = Math.sin(progress(t, 1, 4.6) * Math.PI);
    const hop = still || hollow ? 0 : (1 - Math.cos(t * 8 + phase * 1.4)) * 8 * envelope;
    const squash = still ? 1 : 1 + Math.cos(t * 8 + phase * 1.4) * .08 * envelope;
    ctx.save(); ctx.globalAlpha = reveal;
    ctx.fillStyle = "#080f264d"; ctx.beginPath(); ctx.ellipse(x, foot + 5, 43 * size - hop * .25, 9 * size, 0, 0, TAU); ctx.fill();
    ctx.translate(x, foot - 33 * size - hop + (1 - reveal) * 30);
    ctx.scale(size * squash, size / squash);
    ctx.drawImage(slimeSkin(look.color, true, false), -48, -54, 96, 112);
    drawSlimeSprout(ctx, look.color, still ? 0 : Math.sin(t * 6 + phase) * .1 * envelope);
    slimeEyes(ctx, false, false, look.eyeStyle);
    ctx.translate(0, -43); drawAccessory(ctx, look.hat, 0, 0, false);
    ctx.restore();
  }

  private flower(ctx: CanvasRenderingContext2D, x: number, y: number, bloom: number) {
    if (bloom <= 0) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(bloom, bloom);
    ctx.fillStyle = "#e5eee1";
    for (let petal = 0; petal < 5; petal++) {
      const a = petal / 5 * TAU;
      ctx.beginPath(); ctx.ellipse(Math.cos(a) * 4, Math.sin(a) * 4, 4.5, 2.5, a, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = "#e5cb87"; ctx.beginPath(); ctx.arc(0, 0, 2, 0, TAU); ctx.fill(); ctx.restore();
  }

  private roots(ctx: CanvasRenderingContext2D, spread: number) {
    ctx.save(); ctx.globalAlpha = spread;
    for (const side of [-1, 1]) {
      ctx.save(); ctx.scale(side, 1);
      for (let i = 0; i < 5; i++) {
        const reach = spread * (175 + i * 18);
        ctx.strokeStyle = i % 2 ? "#765f8c" : "#44394f"; ctx.lineWidth = 6 - i * .7; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(360, 40 + i * 8);
        ctx.bezierCurveTo(300, -25 + i * 15, 325 - reach, 60, 360 - reach, -4 + i * 10); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }
}
