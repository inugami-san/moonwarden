import {
  BANISHMENT_TIMELINE, clamp01, easeIn, easeInOut, easeOut, easeOutBack, seededRandom, span,
  type BanishmentOutcome,
} from "./banishment";
import { drawAccessory } from "./accessory-art";
import { slimeEyes, slimeSkin } from "./slime-art";

/**
 * Code-native Canvas art for "The Moon's Judgment". The voted slime uses the
 * exact gameplay skin, eyes and headdress. No raster assets, filters or
 * full-screen shake; reduced motion receives a still crossfade instead.
 */

type Layout = { width: number; height: number; s: number; cx: number; groundY: number; k: number; runeRx: number; runeRy: number };
type SlimeState = { x: number; footY: number; sx: number; sy: number; tilt: number; alpha: number; gazeX: number; gazeY: number };
type Firefly = { x: number; y: number; phase: number; f1: number; f2: number; amp: number; size: number; front: boolean };
type Mote = { lx: number; ly: number; life: number; rise: number; drift: number; phase: number; size: number; warm: boolean };
type Polyline = readonly (readonly [number, number])[];

const TAU = Math.PI * 2;
const SILVER: readonly [number, number, number] = [204, 224, 255];
const VIOLET: readonly [number, number, number] = [178, 112, 255];
const DISSOLVE_START = 1.85;
const DISSOLVE_END = 2.45;
const EDGE_TOP = -96;
const EDGE_BOTTOM = 54;

/** Elder-futhark-like marks; meaningless, decorative, drawn in unit space. */
const GLYPHS: readonly (readonly Polyline[])[] = [
  [[[0, -1], [0, 1]], [[0, -.35], [.62, -.95]], [[0, .2], [.62, -.4]]],
  [[[-.45, -1], [-.45, 1]], [[-.45, -1], [.5, -.1]], [[.5, -.1], [-.45, .55]]],
  [[[0, -1], [0, 1]], [[-.62, -.5], [.62, .5]]],
  [[[-.6, 1], [0, -1], [.6, 1]], [[-.3, .2], [.3, .2]]],
  [[[-.5, -1], [.5, 1]], [[.5, -1], [-.5, 1]]],
  [[[0, -1], [0, 1]], [[0, -1], [.55, -.45]], [[0, -.45], [.55, .1]]],
];

const sprites = new Map<string, HTMLCanvasElement>();
function glowSprite(color: string) {
  let sprite = sprites.get(color);
  if (sprite) return sprite;
  sprite = document.createElement("canvas");
  sprite.width = sprite.height = 64;
  const paint = sprite.getContext("2d");
  if (paint) {
    const gradient = paint.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(.12, color);
    gradient.addColorStop(.42, color.replace(/,\s*[\d.]+\)$/, ",.28)"));
    gradient.addColorStop(1, color.replace(/,\s*[\d.]+\)$/, ",0)"));
    paint.fillStyle = gradient;
    paint.fillRect(0, 0, 64, 64);
  }
  sprites.set(color, sprite);
  return sprite;
}

const rgba = ([r, g, b]: readonly number[], alpha: number) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${clamp01(alpha).toFixed(3)})`;
const mix = (a: readonly number[], b: readonly number[], amount: number) => a.map((value, index) => value + (b[index] - value) * amount);

/** Bell-shaped half width of the shared slime outline at a local height. */
const bodyHalfWidth = (y: number) => y < -36 || y > 30 ? 0 : 34 * Math.sqrt(clamp01((y + 37) / 62));

export function banishmentLayout(width: number, height: number): Layout {
  const s = Math.max(.35, Math.min(width / 960, height / 540));
  const groundY = height * .655;
  return { width, height, s, cx: width / 2, groundY, k: 1.86 * s, runeRx: 126 * s, runeRy: 34 * s };
}

export class BanishmentScene {
  private readonly outcome: BanishmentOutcome;
  private readonly fireflies: Firefly[] = [];
  private readonly stars: { x: number; y: number; size: number; phase: number }[] = [];
  private readonly trees: { x: number; height: number; width: number; back: boolean }[] = [];
  private readonly tufts: { angle: number; radius: number; lean: number; height: number }[] = [];
  private readonly cracks: Polyline[] = [];
  private readonly motes: Mote[] = [];
  private readonly glyphOrder: number[] = [];
  private layer: HTMLCanvasElement | null = null;
  private layerContext: CanvasRenderingContext2D | null = null;
  /** Master opacity for the still reduced-motion crossfade. */
  private alpha = 1;

  constructor(outcome: BanishmentOutcome) {
    this.outcome = outcome;
    // Seeded by the banished slime, not by a local counter or Math.random.
    const random = seededRandom(`${outcome.kind}:${outcome.playerId ?? "none"}:${outcome.name}`);
    for (let i = 0; i < 28; i++) {
      let x = (random() * 2 - 1) * 470;
      const y = -20 - random() * 250;
      if (Math.abs(x) < 110 && y > -230) x = Math.sign(x || 1) * (110 + random() * 80);
      this.fireflies.push({ x, y, phase: random() * TAU, f1: .5 + random() * .7, f2: .4 + random() * .6, amp: 8 + random() * 14, size: 2 + random() * 2.4, front: random() < .3 });
    }
    for (let i = 0; i < 70; i++) this.stars.push({ x: (random() * 2 - 1) * 1300, y: .02 + random() * .36, size: .5 + random() * 1.2, phase: random() * TAU });
    for (const back of [true, false]) {
      for (let x = -1300; x < 1300; x += (back ? 30 : 44) + random() * 26) {
        this.trees.push({ x, height: (back ? 110 : 80) + random() * (back ? 110 : 120), width: 26 + random() * 22, back });
      }
    }
    for (let i = 0; i < 90; i++) {
      const angle = random() * TAU;
      this.tufts.push({ angle, radius: .78 + random() * .55, lean: (random() - .5) * .6, height: 6 + random() * 9 });
    }
    for (let i = 0; i < 7; i++) {
      const base = (i / 7) * TAU + (random() - .5) * .5;
      const points: [number, number][] = [];
      let angle = base;
      for (let step = 0; step <= 6; step++) {
        const radius = .1 + step * .175;
        angle += (random() - .5) * .34;
        points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
      }
      this.cracks.push(points);
    }
    for (let i = 0; i < 8; i++) this.glyphOrder.push(Math.floor(random() * GLYPHS.length));
    // Motes are born exactly where the dissolving edge passes the body.
    while (this.motes.length < 84) {
      const hat = this.motes.length < 14 && outcome.hat;
      const lx = hat ? (random() * 2 - 1) * 20 : (random() * 2 - 1) * 34;
      const ly = hat ? -74 + random() * 34 : -36 + random() * 64;
      if (!hat && Math.abs(lx) > bodyHalfWidth(ly)) continue;
      this.motes.push({ lx, ly, life: 1.05 + random() * .7, rise: 26 + random() * 52, drift: (random() - .5) * 26, phase: random() * TAU, size: 1.6 + random() * 2.6, warm: Boolean(hat) || random() < .12 });
    }
  }

  /** Paint one frame. `t` is seconds since the cinematic began. */
  draw(ctx: CanvasRenderingContext2D, width: number, height: number, t: number, reducedMotion: boolean, pixelRatio: number) {
    const layout = banishmentLayout(width, height);
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    if (!reducedMotion) {
      this.alpha = 1;
      this.drawBackground(ctx, layout, t, true);
      this.drawStage(ctx, layout, t, true, pixelRatio);
    } else {
      // A still, opening-to-ending crossfade: no travel, particles or wobble.
      const fade = easeInOut(span(t, BANISHMENT_TIMELINE.branch, BANISHMENT_TIMELINE.branch + .55));
      this.alpha = 1;
      this.drawBackground(ctx, layout, 0, false);
      if (fade < 1) { this.alpha = 1 - fade; this.drawStage(ctx, layout, .98, false, pixelRatio); }
      if (fade > 0) { this.alpha = fade; this.drawStage(ctx, layout, this.endTime(), false, pixelRatio); }
      this.alpha = 1;
    }
    this.drawVignette(ctx, layout);
    ctx.restore();
  }

  private endTime() {
    return { WARDEN: 3.05, HOLLOW: 3.1, UNREVEALED: 2.8, NONE: 2.3 }[this.outcome.kind];
  }

  private set(ctx: CanvasRenderingContext2D, alpha: number) { ctx.globalAlpha = clamp01(alpha * this.alpha); }

  // ——— Setting ———

  private drawBackground(ctx: CanvasRenderingContext2D, L: Layout, t: number, animate: boolean) {
    const { width, height, s, cx, groundY } = L;
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#040711");
    sky.addColorStop(.42, "#0a1426");
    sky.addColorStop(groundY / height - .06, "#14243c");
    sky.addColorStop(groundY / height + .02, "#0b1820");
    sky.addColorStop(1, "#050b10");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    // The moon sits just above the frame; its halo falls on the clearing.
    const halo = ctx.createRadialGradient(cx, -60 * s, 10 * s, cx, -60 * s, 520 * s);
    halo.addColorStop(0, "rgba(186,208,246,.30)");
    halo.addColorStop(.45, "rgba(120,148,204,.10)");
    halo.addColorStop(1, "rgba(60,80,130,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);

    for (const star of this.stars) {
      const x = cx + star.x * s;
      if (x < 0 || x > width) continue;
      const twinkle = animate ? .55 + .45 * Math.sin(t * 1.3 + star.phase) : .8;
      ctx.globalAlpha = .55 * twinkle;
      ctx.fillStyle = "#dfe8ff";
      ctx.fillRect(x, star.y * height, star.size * Math.max(1, s), star.size * Math.max(1, s));
    }
    ctx.globalAlpha = 1;

    // Two ridges of pines frame the clearing without competing with it.
    const horizon = groundY - 44 * s;
    for (const back of [true, false]) {
      ctx.fillStyle = back ? "#0c1a2c" : "#08121f";
      ctx.beginPath();
      for (const tree of this.trees) {
        if (tree.back !== back) continue;
        const x = cx + tree.x * s;
        const half = tree.width * s * .5;
        if (x + half < 0 || x - half > width) continue;
        const base = horizon + (back ? -6 : 14) * s;
        const top = base - tree.height * s;
        for (let tier = 0; tier < 3; tier++) {
          const tierTop = top + (base - top) * tier * .26;
          const tierBase = tierTop + (base - top) * .48;
          const tierHalf = half * (.62 + tier * .24);
          ctx.moveTo(x, tierTop);
          ctx.lineTo(x + tierHalf, tierBase);
          ctx.lineTo(x - tierHalf, tierBase);
          ctx.closePath();
        }
        ctx.rect(x - 1.6 * s, base - 8 * s, 3.2 * s, 10 * s);
      }
      ctx.fill();
    }
    ctx.fillStyle = "#08121f";
    ctx.fillRect(0, horizon + 12 * s, width, height);

    const mist = ctx.createLinearGradient(0, horizon - 40 * s, 0, horizon + 40 * s);
    mist.addColorStop(0, "rgba(140,166,206,0)");
    mist.addColorStop(.5, "rgba(140,166,206,.10)");
    mist.addColorStop(1, "rgba(140,166,206,0)");
    ctx.fillStyle = mist;
    ctx.fillRect(0, horizon - 40 * s, width, 80 * s);

    // Moonlit clearing: a soft grassy pool rather than a hard stage disc.
    ctx.save();
    ctx.translate(cx, groundY + 8 * s);
    ctx.scale(1, .25);
    const grass = ctx.createRadialGradient(0, 0, 0, 0, 0, 380 * s);
    grass.addColorStop(0, "rgba(82,118,128,.62)");
    grass.addColorStop(.45, "rgba(42,72,78,.48)");
    grass.addColorStop(1, "rgba(14,30,34,0)");
    ctx.fillStyle = grass;
    ctx.beginPath();
    ctx.arc(0, 0, 380 * s, 0, TAU);
    ctx.fill();
    const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, 200 * s);
    pool.addColorStop(0, "rgba(206,224,248,.18)");
    pool.addColorStop(1, "rgba(206,224,248,0)");
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(0, 0, 200 * s, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1, 1.3 * s);
    for (const tuft of this.tufts) {
      const x = cx + Math.cos(tuft.angle) * 300 * s * tuft.radius;
      const y = groundY + 8 * s + Math.sin(tuft.angle) * 78 * s * tuft.radius;
      const sway = animate ? Math.sin(t * 1.1 + tuft.angle * 3) * .08 : 0;
      ctx.strokeStyle = tuft.radius > 1.05 ? "rgba(32,58,58,.9)" : "rgba(52,86,82,.75)";
      ctx.beginPath();
      for (const blade of [-1, 0, 1]) {
        ctx.moveTo(x + blade * 2.2 * s, y);
        ctx.quadraticCurveTo(x + blade * 3 * s, y - tuft.height * s * .6, x + (blade * 2.6 + (tuft.lean + sway) * 10) * s, y - tuft.height * s * (blade ? .8 : 1));
      }
      ctx.stroke();
    }
  }

  private drawVignette(ctx: CanvasRenderingContext2D, L: Layout) {
    const { width, height } = L;
    const vignette = ctx.createRadialGradient(width / 2, height * .55, Math.min(width, height) * .3, width / 2, height * .55, Math.max(width, height) * .75);
    vignette.addColorStop(0, "rgba(2,4,10,0)");
    vignette.addColorStop(1, "rgba(2,4,10,.78)");
    ctx.globalAlpha = 1;
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    // Quiet bands keep the HTML name and verdict legible on any device.
    const top = ctx.createLinearGradient(0, 0, 0, height * .24);
    top.addColorStop(0, "rgba(3,6,14,.72)");
    top.addColorStop(1, "rgba(3,6,14,0)");
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, width, height * .24);
    const bottom = ctx.createLinearGradient(0, height * .72, 0, height);
    bottom.addColorStop(0, "rgba(3,6,14,0)");
    bottom.addColorStop(1, "rgba(3,6,14,.82)");
    ctx.fillStyle = bottom;
    ctx.fillRect(0, height * .72, width, height * .28);
  }

  // ——— Stage ———

  private drawStage(ctx: CanvasRenderingContext2D, L: Layout, t: number, animate: boolean, pixelRatio: number) {
    const kind = this.outcome.kind;
    const hasSlime = kind !== "NONE" && Boolean(this.outcome.color);
    this.drawBeam(ctx, L, t);
    this.drawFireflies(ctx, L, t, animate, false);
    this.drawRune(ctx, L, t, animate);
    if (kind === "HOLLOW") this.drawVortex(ctx, L, t);
    if (!hasSlime) { this.drawFireflies(ctx, L, t, animate, true); return; }
    const state = this.slimeState(L, t, animate);
    this.drawShadow(ctx, L, state, t);
    if (kind === "HOLLOW") this.drawTendrils(ctx, L, state, t, animate);
    ctx.save();
    if (kind === "HOLLOW") this.clipAboveHollow(ctx, L, t);
    this.drawSlime(ctx, L, state, t, pixelRatio);
    if (kind === "HOLLOW") this.drawRoots(ctx, L, state, t);
    ctx.restore();
    if (kind === "HOLLOW") this.drawHollowSeal(ctx, L, t);
    if (kind === "WARDEN") { this.drawMotes(ctx, L, t); this.drawFlower(ctx, L, t, animate); }
    if (kind === "UNREVEALED") this.drawMist(ctx, L, t);
    this.drawFireflies(ctx, L, t, animate, true);
  }

  private slimeState(L: Layout, t: number, animate: boolean): SlimeState {
    const breathe = animate ? Math.sin(t * 2.6) * .016 : 0;
    const glance = animate ? Math.sin(t * 1.7) * 1.6 * span(t, .35, .85) * (1 - span(t, .95, 1.1)) : 0;
    const state: SlimeState = { x: L.cx, footY: L.groundY, sx: 1 - breathe * .6, sy: 1 + breathe, tilt: 0, alpha: 1, gazeX: glance, gazeY: 0 };
    const kind = this.outcome.kind;
    if (kind === "WARDEN") {
      const lift = easeInOut(span(t, 1.2, 2.25));
      const stretch = easeInOut(span(t, 1.7, 2.4));
      state.footY -= lift * 50 * L.s;
      state.sx *= 1 - stretch * .26;
      state.sy *= 1 + stretch * .3;
      state.tilt = animate ? Math.sin(t * 2.1) * .025 * lift : 0;
      // A glance up at the moon, then back at the circle that chose them.
      const up = span(t, 1.0, 1.25) * (1 - span(t, 1.35, 1.6));
      const back = span(t, 1.4, 1.75);
      state.gazeX += -1.6 * back;
      state.gazeY = -2.2 * up + 2.1 * back;
    } else if (kind === "HOLLOW") {
      const struggle = span(t, 1.3, 1.55) * (1 - span(t, 2.3, 2.5));
      if (animate) {
        state.x += Math.sin(t * 27) * 2.2 * L.s * struggle;
        state.sx *= 1 + Math.sin(t * 13) * .045 * struggle;
        state.tilt = Math.sin(t * 9.5) * .05 * struggle;
      }
      const pull = easeIn(span(t, 1.95, 2.5));
      state.footY += pull * 112 * L.k;
      state.sx *= 1 - pull * .18;
      state.sy *= 1 + pull * .1;
      state.alpha = 1 - span(t, 2.38, 2.52);
      state.gazeY = 1.2 * span(t, 1.15, 1.4);
    } else if (kind === "UNREVEALED") {
      state.alpha = 1 - easeInOut(span(t, 1.25, 2.05));
      state.footY -= easeOut(span(t, 1.25, 2.05)) * 14 * L.s;
    }
    return state;
  }

  private drawBeam(ctx: CanvasRenderingContext2D, L: Layout, t: number) {
    const { s, cx, groundY } = L;
    let intensity = .32;
    if (this.outcome.kind === "WARDEN") intensity += .68 * easeOut(span(t, 1.0, 1.5)) - .45 * span(t, 2.45, 3.2);
    if (this.outcome.kind === "HOLLOW") intensity *= 1 - .75 * span(t, 1.0, 1.5) + .5 * span(t, 2.55, 3.1);
    if (this.outcome.kind === "NONE") intensity *= 1 - .4 * span(t, 1.1, 2.0);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const beam = ctx.createLinearGradient(0, 0, 0, groundY + 30 * s);
    beam.addColorStop(0, `rgba(196,216,255,${(.20 * intensity).toFixed(3)})`);
    beam.addColorStop(.75, `rgba(196,216,255,${(.11 * intensity).toFixed(3)})`);
    beam.addColorStop(1, "rgba(196,216,255,0)");
    this.set(ctx, 1);
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(cx - 70 * s, 0);
    ctx.lineTo(cx + 70 * s, 0);
    ctx.lineTo(cx + 150 * s, groundY + 30 * s);
    ctx.lineTo(cx - 150 * s, groundY + 30 * s);
    ctx.closePath();
    ctx.fill();
    // A narrower core for the Warden's lifting light.
    if (this.outcome.kind === "WARDEN") {
      const core = ctx.createLinearGradient(cx - 60 * s, 0, cx + 60 * s, 0);
      const strength = .16 * clamp01(intensity - .32);
      core.addColorStop(0, "rgba(226,236,255,0)");
      core.addColorStop(.5, `rgba(226,236,255,${strength.toFixed(3)})`);
      core.addColorStop(1, "rgba(226,236,255,0)");
      ctx.fillStyle = core;
      ctx.fillRect(cx - 60 * s, 0, 120 * s, groundY + 10 * s);
    }
    ctx.restore();
  }

  private fireflyMotionTime(t: number) {
    // Fireflies slow to a hush during the opening, then may resume.
    const settle = span(t, .3, .95);
    let motion = Math.min(t, .3) + .65 * (settle - settle * settle / 2);
    if (this.outcome.kind === "NONE" || this.outcome.kind === "WARDEN") {
      const resume = Math.max(0, t - (this.outcome.kind === "NONE" ? 1.3 : 2.5));
      motion += resume < .7 ? resume * resume / 1.4 : .35 + (resume - .7);
    }
    return motion;
  }

  private drawFireflies(ctx: CanvasRenderingContext2D, L: Layout, t: number, animate: boolean, front: boolean) {
    const { s, cx, groundY } = L;
    const motion = animate ? this.fireflyMotionTime(t) : 0;
    const sprite = glowSprite("rgba(232,246,176,.95)");
    const hollow = this.outcome.kind === "HOLLOW";
    const scatter = hollow ? easeOut(span(t, 1.0, 1.9)) : 0;
    const dim = hollow ? 1 - .7 * span(t, 1.0, 1.5) + .45 * span(t, 2.6, 3.2) : 1;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const fly of this.fireflies) {
      if (fly.front !== front) continue;
      let x = fly.x + Math.sin(motion * fly.f1 * 2 + fly.phase) * fly.amp;
      let y = fly.y + Math.cos(motion * fly.f2 * 2 + fly.phase) * fly.amp * .6;
      if (scatter) {
        const length = Math.hypot(x, y + 60) || 1;
        x += (x / length) * 90 * scatter;
        y += ((y + 60) / length) * 40 * scatter;
      }
      const pulse = animate ? .62 + .38 * Math.sin(t * (1.4 + fly.f1) + fly.phase) : .85;
      const size = fly.size * s * 7;
      this.set(ctx, pulse * dim);
      ctx.drawImage(sprite, cx + x * s - size / 2, groundY + y * s - size / 2, size, size);
    }
    ctx.restore();
  }

  private runeColor(t: number) {
    const kind = this.outcome.kind;
    if (kind !== "HOLLOW") return SILVER;
    const fracture = span(t, 1.0, 1.3);
    const sealed = span(t, 2.55, 3.0);
    return mix(mix(SILVER, VIOLET, fracture), [196, 186, 238], sealed);
  }

  private drawRune(ctx: CanvasRenderingContext2D, L: Layout, t: number, animate: boolean) {
    const { s, cx, groundY, runeRx, runeRy } = L;
    const kind = this.outcome.kind;
    const drawn = easeInOut(span(t, .3, 1.0));
    if (drawn <= 0) return;
    let strength = .9;
    let scale = 1;
    if (kind === "WARDEN") strength = .9 + .3 * span(t, 1.0, 1.4) - .75 * span(t, 1.9, 2.9);
    if (kind === "NONE") { strength = .9 * (1 - easeInOut(span(t, 1.1, 2.1))); scale = 1 + .06 * span(t, 1.1, 2.1); }
    if (kind === "UNREVEALED") strength = .9 - .7 * span(t, 1.6, 2.5);
    if (kind === "HOLLOW") strength = .9 + .2 * span(t, 1.0, 1.3) - .45 * span(t, 2.6, 3.1);
    const color = this.runeColor(t);
    const pulse = animate ? 1 + Math.sin(t * 3) * .05 : 1;
    const rx = runeRx * scale;
    const ry = runeRy * scale;

    ctx.save();
    // Underglow, violet once the rune fractures.
    const glow = ctx.createRadialGradient(cx, groundY, 0, cx, groundY, rx * 1.25);
    glow.addColorStop(0, rgba(color, .22 * strength * drawn));
    glow.addColorStop(1, rgba(color, 0));
    ctx.translate(cx, groundY);
    ctx.scale(1, ry / rx);
    ctx.translate(-cx, -groundY);
    ctx.fillStyle = glow;
    this.set(ctx, 1);
    ctx.beginPath();
    ctx.arc(cx, groundY, rx * 1.25, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = "lighter";
    const stroke = (width: number, alpha: number, path: () => void) => {
      ctx.lineWidth = width * 4.5 * s;
      ctx.strokeStyle = rgba(color, alpha * .16 * pulse);
      this.set(ctx, strength);
      path(); ctx.stroke();
      ctx.lineWidth = width * s;
      ctx.strokeStyle = rgba(mix(color, [255, 255, 255], .35), alpha);
      path(); ctx.stroke();
    };
    const start = -Math.PI / 2;
    stroke(1.6, .9, () => { ctx.beginPath(); ctx.ellipse(cx, groundY, rx, ry, 0, start, start + TAU * drawn); });
    const inner = easeInOut(span(t, .42, 1.0));
    if (inner > 0) stroke(1.1, .75, () => { ctx.beginPath(); ctx.ellipse(cx, groundY, rx * .76, ry * .76, 0, start, start - TAU * inner, true); });
    // Eight marks kindle in order around the band.
    for (let i = 0; i < 8; i++) {
      const appear = span(drawn, i / 8, i / 8 + .18);
      if (appear <= 0) continue;
      const angle = start + (i / 8) * TAU + TAU / 16;
      const gx = cx + Math.cos(angle) * rx * .88;
      const gy = groundY + Math.sin(angle) * ry * .88;
      const glyph = GLYPHS[this.glyphOrder[i]];
      stroke(1, .85 * appear, () => {
        ctx.beginPath();
        for (const line of glyph) {
          line.forEach(([x, y], index) => {
            const px = gx + x * 6.5 * s;
            const py = gy + y * 4.4 * s;
            if (index) ctx.lineTo(px, py); else ctx.moveTo(px, py);
          });
        }
      });
    }
    // A small crescent sigil at the centre, beneath the slime.
    const sigil = span(t, .7, 1.0);
    if (sigil > 0) stroke(1, .6 * sigil, () => { ctx.beginPath(); ctx.ellipse(cx, groundY, 14 * s, 4 * s, 0, 0, TAU); });

    if (kind === "HOLLOW") this.drawCracks(ctx, L, t, stroke);
    ctx.restore();
  }

  private drawCracks(ctx: CanvasRenderingContext2D, L: Layout, t: number, stroke: (width: number, alpha: number, path: () => void) => void) {
    const { cx, groundY, runeRx, runeRy } = L;
    const grow = easeOut(span(t, 1.0, 1.35));
    const heal = span(t, 2.5, 2.8);
    if (grow <= 0 || heal >= 1) return;
    for (const crack of this.cracks) {
      const count = Math.max(2, Math.ceil(crack.length * grow));
      stroke(1.4, .95 * (1 - heal), () => {
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const [x, y] = crack[i];
          const px = cx + x * runeRx;
          const py = groundY + y * runeRy;
          if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
      });
    }
  }

  private drawVortex(ctx: CanvasRenderingContext2D, L: Layout, t: number) {
    const { s, cx, groundY } = L;
    const open = easeOut(span(t, 1.8, 2.15)) * (1 - easeIn(span(t, 2.45, 2.6)));
    if (open <= 0) return;
    const rx = 104 * s * open;
    const ry = rx * .3;
    ctx.save();
    ctx.translate(cx, groundY);
    ctx.scale(1, ry / rx);
    const hole = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    hole.addColorStop(0, "rgba(3,0,8,.98)");
    hole.addColorStop(.6, "rgba(22,6,40,.9)");
    hole.addColorStop(1, "rgba(70,30,120,0)");
    this.set(ctx, 1);
    ctx.fillStyle = hole;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (let arm = 0; arm < 4; arm++) {
      ctx.beginPath();
      for (let step = 0; step <= 24; step++) {
        const f = step / 24;
        const angle = arm * TAU / 4 + f * 3.2 + t * 4.2;
        const radius = rx * (1 - f * .85);
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (step) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = "rgba(160,96,240,.42)";
      ctx.lineWidth = 2.2 * s;
      ctx.stroke();
    }
    ctx.restore();
  }

  private clipAboveHollow(ctx: CanvasRenderingContext2D, L: Layout, t: number) {
    const { width, s, cx, groundY } = L;
    const open = easeOut(span(t, 1.8, 2.15));
    ctx.beginPath();
    ctx.rect(0, 0, width, groundY + 2 * s);
    if (open > 0) ctx.ellipse(cx, groundY, 100 * s * open, 30 * s * open, 0, 0, Math.PI);
    ctx.clip();
  }

  private drawShadow(ctx: CanvasRenderingContext2D, L: Layout, state: SlimeState, t: number) {
    const { s, k, groundY } = L;
    const lift = Math.max(0, groundY - state.footY) / (50 * s);
    let alpha = .5 * (1 - .7 * clamp01(lift));
    if (this.outcome.kind === "WARDEN") alpha *= 1 - span(t, 2.0, 2.45);
    if (this.outcome.kind === "HOLLOW") alpha *= 1 - span(t, 1.95, 2.2);
    if (this.outcome.kind === "UNREVEALED") alpha *= state.alpha;
    if (alpha <= 0) return;
    const scale = 1 - .35 * clamp01(lift);
    ctx.save();
    ctx.translate(state.x, groundY + 2 * s);
    ctx.scale(1, .27);
    const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, 40 * k * scale);
    shadow.addColorStop(0, "rgba(1,6,12,.85)");
    shadow.addColorStop(1, "rgba(1,6,12,0)");
    this.set(ctx, alpha);
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.arc(0, 0, 40 * k * scale, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /** Render the voted slime into a private layer so dissolve/tint only touch the slime. */
  private drawSlime(ctx: CanvasRenderingContext2D, L: Layout, state: SlimeState, t: number, pixelRatio: number) {
    if (state.alpha <= 0 || !this.outcome.color) return;
    const { k } = L;
    const box = { left: 72, top: 150, width: 144, height: 205 };
    const unit = k * pixelRatio;
    const pixelWidth = Math.ceil(box.width * unit);
    const pixelHeight = Math.ceil(box.height * unit);
    if (!this.layer) {
      this.layer = document.createElement("canvas");
      this.layerContext = this.layer.getContext("2d");
    }
    const layer = this.layer;
    const paint = this.layerContext;
    if (!paint) return;
    if (layer.width !== pixelWidth || layer.height !== pixelHeight) { layer.width = pixelWidth; layer.height = pixelHeight; }
    paint.setTransform(1, 0, 0, 1, 0, 0);
    paint.globalCompositeOperation = "source-over";
    paint.globalAlpha = 1;
    paint.clearRect(0, 0, pixelWidth, pixelHeight);
    paint.setTransform(unit, 0, 0, unit, box.left * unit, box.top * unit);
    // Same feet-anchored deformation as gameplay: body, eyes and costume share it.
    paint.translate(0, 31);
    paint.scale(state.sx, state.sy);
    paint.translate(0, -31);

    const kind = this.outcome.kind;
    const twist = kind === "HOLLOW" ? easeInOut(span(t, 1.12, 1.45)) : 0;
    paint.drawImage(slimeSkin(this.outcome.color, true), -48, -54, 96, 112);
    paint.save();
    paint.translate(state.gazeX, state.gazeY);
    if (twist < 1) { paint.globalAlpha = 1 - twist; slimeEyes(paint, false, false, this.outcome.eyeStyle); }
    if (twist > 0) { paint.globalAlpha = twist; twistedFace(paint); }
    paint.restore();
    paint.globalAlpha = 1;
    if (this.outcome.hat) {
      paint.save();
      paint.translate(0, -43);
      paint.rotate(state.tilt * .6);
      drawAccessory(paint, this.outcome.hat, 0, 0, false);
      paint.restore();
    }

    if (kind === "WARDEN") {
      // Silver moonlight saturates the jelly, then the body unravels upward.
      const silver = span(t, 1.55, 2.1);
      if (silver > 0) {
        paint.globalCompositeOperation = "source-atop";
        const light = paint.createLinearGradient(0, -80, 0, 32);
        light.addColorStop(0, `rgba(240,246,255,${(.85 * silver).toFixed(3)})`);
        light.addColorStop(1, `rgba(196,214,250,${(.45 * silver).toFixed(3)})`);
        paint.fillStyle = light;
        paint.fillRect(-72, -150, 144, 205);
      }
      const edge = dissolveEdge(t);
      if (edge > EDGE_TOP) {
        paint.globalCompositeOperation = "destination-out";
        const erase = paint.createLinearGradient(0, edge - 16, 0, edge + 4);
        erase.addColorStop(0, "rgba(0,0,0,1)");
        erase.addColorStop(1, "rgba(0,0,0,0)");
        paint.fillStyle = erase;
        paint.fillRect(-72, -150, 144, edge + 4 + 150);
      }
    } else if (kind === "HOLLOW") {
      // Violet shadow rises through the gel as the disguise fails.
      if (twist > 0) {
        paint.globalCompositeOperation = "source-atop";
        const shade = paint.createLinearGradient(0, 32, 0, -40);
        shade.addColorStop(0, `rgba(20,4,36,${(.82 * twist).toFixed(3)})`);
        shade.addColorStop(1, `rgba(96,40,160,${(.3 * twist).toFixed(3)})`);
        paint.fillStyle = shade;
        paint.fillRect(-72, -150, 144, 205);
        // Keep the twisted eyes luminous above the shade.
        paint.globalCompositeOperation = "source-over";
        paint.save();
        paint.translate(state.gazeX, state.gazeY);
        paint.globalAlpha = twist;
        twistedFace(paint);
        paint.restore();
      }
    }

    ctx.save();
    ctx.translate(state.x, state.footY);
    ctx.rotate(state.tilt);
    this.set(ctx, state.alpha);
    ctx.drawImage(layer, -box.left * k, -31 * k - box.top * k, box.width * k, box.height * k);
    if (kind === "WARDEN") {
      // Soft rim of moonlight at the dissolving edge.
      const silver = span(t, 1.55, 2.1);
      if (silver > 0 && t < DISSOLVE_END + .1) {
        ctx.globalCompositeOperation = "lighter";
        const glow = ctx.createRadialGradient(0, -6 * k * state.sy, 0, 0, -6 * k * state.sy, 52 * k);
        glow.addColorStop(0, "rgba(220,232,255,.30)");
        glow.addColorStop(1, "rgba(220,232,255,0)");
        this.set(ctx, silver * (1 - span(t, 2.2, 2.55)));
        ctx.fillStyle = glow;
        ctx.fillRect(-60 * k, -70 * k, 120 * k, 120 * k);
      }
    }
    ctx.restore();
  }

  private toScreen(L: Layout, state: SlimeState, lx: number, ly: number) {
    return { x: state.x + lx * L.k * state.sx, y: state.footY + (ly - 31) * L.k * state.sy };
  }

  private drawMotes(ctx: CanvasRenderingContext2D, L: Layout, t: number) {
    const silver = glowSprite("rgba(226,236,255,.95)");
    const warm = glowSprite("rgba(244,232,190,.95)");
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const mote of this.motes) {
      const birth = DISSOLVE_START + ((mote.ly - EDGE_TOP) / (EDGE_BOTTOM - EDGE_TOP)) * (DISSOLVE_END - DISSOLVE_START);
      const age = t - birth;
      if (age < 0 || age > mote.life) continue;
      const origin = this.toScreen(L, this.slimeState(L, birth, true), mote.lx, mote.ly);
      const f = age / mote.life;
      const x = origin.x + (mote.drift * age + Math.sin(age * 2.6 + mote.phase) * 7) * L.s;
      const y = origin.y - (mote.rise * age + 10 * age * age) * L.s;
      const size = mote.size * L.s * 6 * (1 - f * .4);
      this.set(ctx, Math.sin(Math.PI * Math.min(1, f * 1.25 + .1)) * .95);
      ctx.drawImage(mote.warm ? warm : silver, x - size / 2, y - size / 2, size, size);
    }
    ctx.restore();
  }

  private drawFlower(ctx: CanvasRenderingContext2D, L: Layout, t: number, animate: boolean) {
    const grow = span(t, 2.12, 2.72);
    if (grow <= 0) return;
    const { s, cx, groundY } = L;
    const stem = easeOut(span(t, 2.12, 2.45));
    const bloom = easeOutBack(span(t, 2.32, 2.72));
    const sway = animate ? Math.sin(t * 1.8) * .05 : 0;
    ctx.save();
    ctx.translate(cx, groundY + 2 * s);
    ctx.scale(s * 1.15, s * 1.15);
    ctx.rotate(sway);
    // Halo
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const halo = ctx.createRadialGradient(0, -24, 0, 0, -24, 30);
    halo.addColorStop(0, "rgba(232,240,255,.42)");
    halo.addColorStop(1, "rgba(232,240,255,0)");
    this.set(ctx, bloom);
    ctx.fillStyle = halo;
    ctx.fillRect(-32, -56, 64, 64);
    ctx.restore();
    this.set(ctx, 1);
    ctx.lineCap = "round";
    ctx.strokeStyle = "#5f8f73";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(3, -12 * stem, 0, -24 * stem);
    ctx.stroke();
    if (stem > .45) {
      const leaf = (side: number, y: number) => {
        ctx.save();
        ctx.translate(side * .8, y);
        ctx.rotate(side * .9);
        ctx.scale(clamp01((stem - .45) * 2), clamp01((stem - .45) * 2));
        ctx.fillStyle = "#79aa86";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(side * 3, -6, 0, -11);
        ctx.quadraticCurveTo(-side * 3, -5, 0, 0);
        ctx.fill();
        ctx.restore();
      };
      leaf(-1, -6);
      leaf(1, -11);
    }
    if (bloom > 0) {
      ctx.translate(0, -25 * stem);
      ctx.scale(bloom, bloom);
      for (let petal = 0; petal < 6; petal++) {
        ctx.save();
        ctx.rotate(petal * TAU / 6 + .2);
        const shade = ctx.createLinearGradient(0, 0, 0, -10);
        shade.addColorStop(0, "#d7def0");
        shade.addColorStop(1, "#fbfcff");
        ctx.fillStyle = shade;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(4.2, -3, 3.6, -9.5, 0, -10.5);
        ctx.bezierCurveTo(-3.6, -9.5, -4.2, -3, 0, 0);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = "#f1dd96";
      ctx.beginPath();
      ctx.arc(0, 0, 2.3, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawTendrils(ctx: CanvasRenderingContext2D, L: Layout, state: SlimeState, t: number, animate: boolean) {
    const grow = easeOut(span(t, 1.22, 1.7));
    const fade = 1 - span(t, 2.3, 2.5);
    if (grow <= 0 || fade <= 0) return;
    const anchors: readonly [number, number, number][] = [[-30, 16, -2.7], [-27, -4, -2.3], [-13, -26, -1.9], [13, -27, -1.2], [27, -5, -.8], [31, 16, -.4]];
    ctx.save();
    ctx.translate(state.x, state.footY);
    ctx.rotate(state.tilt);
    ctx.scale(L.k * state.sx, L.k * state.sy);
    ctx.translate(0, -31);
    ctx.lineCap = "round";
    anchors.forEach(([x, y, angle], index) => {
      const length = (20 + (index % 3) * 6) * grow;
      const wave = animate ? Math.sin(t * 7 + index * 1.7) : .4;
      const ex = x + Math.cos(angle) * length;
      const ey = y + Math.sin(angle) * length;
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      const c1x = x + Math.cos(angle) * length * .4 + nx * wave * 7;
      const c1y = y + Math.sin(angle) * length * .4 + ny * wave * 7;
      const c2x = x + Math.cos(angle) * length * .75 - nx * wave * 6;
      const c2y = y + Math.sin(angle) * length * .75 - ny * wave * 6;
      const path = () => { ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey); };
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(150,80,240,.35)";
      ctx.lineWidth = 6;
      this.set(ctx, fade);
      path(); ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(24,6,40,.92)";
      ctx.lineWidth = 3.2;
      path(); ctx.stroke();
      ctx.strokeStyle = "rgba(200,150,255,.55)";
      ctx.lineWidth = .8;
      path(); ctx.stroke();
    });
    ctx.restore();
  }

  private drawRoots(ctx: CanvasRenderingContext2D, L: Layout, state: SlimeState, t: number) {
    const { s, cx, groundY, runeRx, runeRy } = L;
    const roots: readonly { angle: number; height: number; side: number }[] = [
      { angle: 2.75, height: 18, side: -1 }, { angle: .45, height: 4, side: 1 }, { angle: 2.2, height: -9, side: -1 },
      { angle: .95, height: 12, side: 1 }, { angle: 3.6, height: -20, side: -1 },
    ];
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    roots.forEach((root, index) => {
      const grow = easeOut(span(t, 1.5 + index * .06, 2.02 + index * .06));
      if (grow <= 0) return;
      const start = { x: cx + Math.cos(root.angle) * runeRx * 1.08, y: groundY + Math.sin(root.angle) * runeRy * 1.08 };
      const side = this.toScreen(L, state, root.side * (bodyHalfWidth(root.height) + 1.5), root.height);
      const across = this.toScreen(L, state, -root.side * bodyHalfWidth(root.height + 6) * .55, root.height + 6);
      const bulge = this.toScreen(L, state, root.side * bodyHalfWidth(root.height) * .25, root.height + 12);
      const points: { x: number; y: number }[] = [];
      for (let i = 0; i <= 18; i++) {
        const u = i / 18;
        const c1 = { x: start.x + root.side * 6 * s, y: start.y - 46 * s };
        const c2 = { x: side.x + root.side * 26 * s, y: side.y + 12 * s };
        const a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, d = u ** 3;
        points.push({ x: a * start.x + b * c1.x + c * c2.x + d * side.x, y: a * start.y + b * c1.y + c * c2.y + d * side.y });
      }
      for (let i = 1; i <= 10; i++) {
        const u = i / 10;
        const a = (1 - u) ** 2, b = 2 * (1 - u) * u, c = u * u;
        points.push({ x: a * side.x + b * bulge.x + c * across.x, y: a * side.y + b * bulge.y + c * across.y });
      }
      const count = Math.max(2, Math.round(points.length * grow));
      const visible = points.slice(0, count);
      const path = () => { ctx.beginPath(); visible.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); };
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(178,224,140,.30)";
      ctx.lineWidth = 9 * s;
      this.set(ctx, 1);
      path(); ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "#3b3122";
      ctx.lineWidth = 4.2 * s;
      path(); ctx.stroke();
      ctx.strokeStyle = "#f2e2a0";
      ctx.lineWidth = 1.5 * s;
      path(); ctx.stroke();
      // Small luminous buds along the grown length.
      ctx.globalCompositeOperation = "lighter";
      const bud = glowSprite("rgba(214,240,170,.95)");
      for (let i = 5; i < visible.length; i += 6) {
        const size = 9 * s;
        ctx.drawImage(bud, visible[i].x - size / 2, visible[i].y - size / 2, size, size);
      }
    });
    ctx.restore();
  }

  private drawHollowSeal(ctx: CanvasRenderingContext2D, L: Layout, t: number) {
    const { s, cx, groundY, runeRx, runeRy } = L;
    // Darken whatever of the slime is still inside the shadow well.
    const open = easeOut(span(t, 1.8, 2.15)) * (1 - easeIn(span(t, 2.45, 2.6)));
    if (open > 0) {
      ctx.save();
      ctx.translate(cx, groundY);
      ctx.scale(1, .3);
      const well = ctx.createRadialGradient(0, 0, 0, 0, 0, 100 * s * open);
      well.addColorStop(0, "rgba(4,0,10,.9)");
      well.addColorStop(1, "rgba(4,0,10,0)");
      this.set(ctx, .85);
      ctx.fillStyle = well;
      ctx.beginPath();
      ctx.arc(0, 0, 100 * s * open, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    const flash = span(t, 2.55, 3.05);
    if (flash <= 0 || flash >= 1) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = (4 - flash * 3) * s;
    ctx.strokeStyle = `rgba(226,206,255,${(.85 * (1 - flash)).toFixed(3)})`;
    this.set(ctx, 1);
    const grow = 1 + easeOut(flash) * .45;
    ctx.beginPath();
    ctx.ellipse(cx, groundY, runeRx * grow, runeRy * grow, 0, 0, TAU);
    ctx.stroke();
    const bloom = ctx.createRadialGradient(cx, groundY, 0, cx, groundY, runeRx);
    bloom.addColorStop(0, `rgba(190,150,255,${(.32 * (1 - flash)).toFixed(3)})`);
    bloom.addColorStop(1, "rgba(190,150,255,0)");
    ctx.translate(cx, groundY);
    ctx.scale(1, runeRy / runeRx);
    ctx.translate(-cx, -groundY);
    ctx.fillStyle = bloom;
    ctx.beginPath();
    ctx.arc(cx, groundY, runeRx, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  private drawMist(ctx: CanvasRenderingContext2D, L: Layout, t: number) {
    const veil = Math.sin(Math.PI * span(t, 1.15, 2.4));
    if (veil <= 0) return;
    const { s, cx, groundY } = L;
    ctx.save();
    const mist = ctx.createRadialGradient(cx, groundY - 40 * s, 0, cx, groundY - 40 * s, 150 * s);
    mist.addColorStop(0, "rgba(176,196,222,.42)");
    mist.addColorStop(1, "rgba(176,196,222,0)");
    this.set(ctx, veil);
    ctx.fillStyle = mist;
    ctx.fillRect(cx - 160 * s, groundY - 200 * s, 320 * s, 260 * s);
    ctx.restore();
  }
}

/** Erasing edge, in the slime's local units, moving from above the hat to the feet. */
function dissolveEdge(t: number) {
  return EDGE_TOP + (EDGE_BOTTOM - EDGE_TOP) * easeInOut(span(t, DISSOLVE_START, DISSOLVE_END)) - (t < DISSOLVE_START ? 40 : 0);
}

/** The Hollow's friendly face slips: narrowed slanted eyes and a jagged grin. */
function twistedFace(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.translate(0, 1.5);
  ctx.scale(.84, .84);
  ctx.shadowColor = "rgba(190,120,255,.9)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = "#f3e8ff";
  ctx.beginPath();
  ctx.moveTo(-18, 2); ctx.quadraticCurveTo(-10, 1.5, -5, 9); ctx.quadraticCurveTo(-13, 9.5, -18, 2); ctx.closePath();
  ctx.moveTo(18, 2); ctx.quadraticCurveTo(10, 1.5, 5, 9); ctx.quadraticCurveTo(13, 9.5, 18, 2); ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(30,6,48,.9)";
  ctx.lineWidth = 1.7;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-8, 19); ctx.lineTo(-4.5, 16.4); ctx.lineTo(-1.5, 19.2); ctx.lineTo(1.5, 16.4); ctx.lineTo(4.5, 19.2); ctx.lineTo(8, 16.6);
  ctx.stroke();
  ctx.restore();
}

/** Exposed for tests: the opening is shared and draws nothing role-specific. */
export const BANISHMENT_ART_BEATS = Object.freeze({ dissolveStart: DISSOLVE_START, dissolveEnd: DISSOLVE_END, roleSpecificFrom: BANISHMENT_TIMELINE.branch });
