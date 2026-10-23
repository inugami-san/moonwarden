import type { EyeStyle } from "../server/appearance";
import { drawEyeShape } from "./slime-eyes";

const skins = new Map<string, HTMLCanvasElement>();
export const SLIME_SKIN_CACHE_LIMIT = 48;

type BodyCommand = ["M", number, number] | ["C", number, number, number, number, number, number] | ["Z"];
const pathString = (commands: readonly BodyCommand[]) => commands.map(([command, ...points]) => `${command}${points.join(" ")}`).join("");

/**
 * A woodland wisp, shared by Canvas, portraits and concealed silhouettes.
 * An off-centre rising crest and shallow gel lobes make the outline itself
 * distinctive; identity never depends on a decorative layer or a hidden role.
 */
const BODY: readonly BodyCommand[] = [
  ["M", -35, 21],
  ["C", -40, 6, -31, -13, -16, -21],
  ["C", -8, -26, -12, -36, -2, -39],
  ["C", -3, -30, 9, -33, 15, -26],
  ["C", 29, -18, 40, -2, 37, 18],
  ["C", 40, 29, 27, 35, 17, 30],
  ["C", 9, 37, -1, 36, -8, 31],
  ["C", -18, 36, -31, 33, -35, 21],
  ["Z"],
];

/** No humanoid legs or capsule body; even a fog silhouette is a forest wisp. */
export const SLIME_PATH = pathString(BODY);
const CORE: readonly BodyCommand[] = [["M", -9, 15], ["C", -12, 5, -5, -7, 2, -9], ["C", 12, -2, 14, 12, 6, 20], ["C", 0, 27, -7, 24, -9, 15], ["Z"]];
export const SLIME_CORE_PATH = pathString(CORE);
const SPROUT: Readonly<Record<"stem" | "leafRight" | "leafLeft" | "vein", readonly BodyCommand[]>> = {
  stem: [["M", 2, -32], ["C", 2.6, -36, 4, -39.5, 6.5, -42]],
  leafRight: [["M", 6.5, -42], ["C", 9.5, -46.5, 15.5, -47.5, 19, -45.5], ["C", 16.5, -41.5, 11, -39.8, 6.5, -42], ["Z"]],
  leafLeft: [["M", 5.2, -40.2], ["C", 2.5, -44.6, -2.6, -46, -6, -44.8], ["C", -4.3, -41, -.4, -39.4, 5.2, -40.2], ["Z"]],
  vein: [["M", 7.5, -42.4], ["C", 10.5, -44, 13.8, -44.8, 16.5, -45.2]],
};
/** A small two-leaf sprout at the crown; decorative, hidden by concealment. */
export const SLIME_SPROUT = Object.freeze({
  stem: pathString(SPROUT.stem), leafRight: pathString(SPROUT.leafRight),
  leafLeft: pathString(SPROUT.leafLeft), vein: pathString(SPROUT.vein),
});
/** Physical light positions shared by SVG and Canvas, in body coordinates.
 * Object-bounding-box gradients made the portrait look like a different gel. */
export const SLIME_MATERIAL = Object.freeze({
  gel: { x1: -20, y1: -34, x2: 18, y2: 32 },
  volume: { x0: -7, y0: -8, r0: 6, x1: -2, y1: 0, r1: 46 },
  glow: { x0: 3, y0: 17, r0: 1, x1: 2, y1: 13, r1: 27 },
  rim: { x1: -30, y1: -30, x2: 8, y2: 6 },
  edge: { x1: -26, y1: -34, x2: 22, y2: 32 },
  bounce: { x1: 0, y1: 22, x2: 0, y2: 32 },
  bouncePath: "M-27 27.5Q0 33 27 27.5",
});
/** Moonlight arrives from the upper left: one broad sheen, one crisp glint. */
export const SLIME_LIGHT = Object.freeze({
  sheen: { x: -13, y: -17, rx: 15, ry: 7.5, angle: -38 },
  glint: { x: -18.5, y: -19, rx: 4.2, ry: 2.3, angle: -50 },
  spark: { x: -10, y: -25.5, r: .9 },
  cheek: { x: 18.5, y: 16.5, rx: 5, ry: 2.6 },
});
/** Keep every expression, but seat smaller eyes inside the translucent material. */
export const SLIME_EYE_SCALE = .84;
/** Eyes sit in the gel: a faint shade below each one gives them depth. */
export const SLIME_EYE_SHADE = "rgba(18,40,56,.24)";

type Rgb = readonly number[];
function normalizeColor(color: string): string {
  if (typeof color !== "string") return "#54dbef";
  if (/^#[\da-f]{6}$/i.test(color)) return color.toLowerCase();
  if (/^#[\da-f]{3}$/i.test(color)) return `#${[...color.slice(1)].map(channel => channel + channel).join("")}`.toLowerCase();
  return "#54dbef";
}
const hexRgb = (color: string): Rgb => [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16));
const blend = (from: Rgb, to: Rgb, amount: number) => from.map((channel, index) => Math.round(channel * (1 - amount) + to[index] * amount));
const rgb = (channels: Rgb) => `rgb(${channels.join(",")})`;
const rgba = (channels: Rgb, alpha: number) => `rgba(${channels.join(",")},${alpha})`;

function paletteChannels(color: string) {
  const base = hexRgb(normalizeColor(color));
  return {
    body: blend(base, [210, 224, 236], .20),
    rim: blend(base, [224, 229, 250], .57),
    edge: blend(base, [52, 78, 106], .36),
    core: blend(base, [33, 53, 79], .53),
    shine: blend(base, [244, 239, 225], .91),
    glow: blend(base, [255, 248, 228], .38),
    deep: blend(base, [18, 34, 54], .64),
    blush: blend(base, [255, 148, 166], .62),
    leaf: blend([168, 214, 160], base, .16),
    leafShade: blend([78, 132, 106], base, .14),
    leafVein: blend(blend([168, 214, 160], base, .16), [240, 246, 228], .55),
  };
}

export function slimePalette(color: string) {
  const channels = paletteChannels(color);
  return Object.fromEntries(Object.entries(channels).map(([key, value]) => [key, rgb(value)])) as Record<keyof typeof channels, string>;
}

/** Concealed silhouettes use exactly the same body, without decorative details. */
export function slimeOutline(ctx: CanvasRenderingContext2D) {
  tracePath(ctx, BODY);
}

function tracePath(ctx: CanvasRenderingContext2D, commands: readonly BodyCommand[]) {
  ctx.beginPath();
  for (const command of commands) {
    if (command[0] === "M") ctx.moveTo(command[1], command[2]);
    else if (command[0] === "C") ctx.bezierCurveTo(command[1], command[2], command[3], command[4], command[5], command[6]);
    else ctx.closePath();
  }
}

function softEllipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, angle: number, inner: string, outer: string) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle * Math.PI / 180); ctx.scale(1, ry / rx);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  gradient.addColorStop(0, inner); gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawSprout(ctx: CanvasRenderingContext2D, c: ReturnType<typeof paletteChannels>) {
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = rgb(c.leafShade); ctx.lineWidth = 1.7;
  tracePath(ctx, SPROUT.stem); ctx.stroke();
  const leaf = ctx.createLinearGradient(-6, -47, 18, -40);
  leaf.addColorStop(0, rgb(c.leaf)); leaf.addColorStop(1, rgb(c.leafShade));
  ctx.fillStyle = leaf;
  tracePath(ctx, SPROUT.leafLeft); ctx.fill();
  tracePath(ctx, SPROUT.leafRight); ctx.fill();
  ctx.globalAlpha = .55; ctx.strokeStyle = rgb(c.leafVein); ctx.lineWidth = .6;
  tracePath(ctx, SPROUT.vein); ctx.stroke();
  ctx.restore();
}

function referenceSkin(color: string, withSprout: boolean): HTMLCanvasElement {
  const c = paletteChannels(color);
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 224;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);
  ctx.translate(48, 54);
  ctx.lineCap = "round";

  // Base gel: moonlit crown fading into a saturated, settled base.
  slimeOutline(ctx);
  const material = SLIME_MATERIAL;
  const gel = ctx.createLinearGradient(material.gel.x1, material.gel.y1, material.gel.x2, material.gel.y2);
  gel.addColorStop(0, rgb(c.rim));
  gel.addColorStop(.46, rgb(c.body));
  gel.addColorStop(1, rgb(c.edge));
  ctx.fillStyle = gel;
  ctx.fill();

  ctx.save();
  ctx.clip();
  // Ambient occlusion pools toward the edges, giving the dome real volume.
  const volume = ctx.createRadialGradient(material.volume.x0, material.volume.y0, material.volume.r0, material.volume.x1, material.volume.y1, material.volume.r1);
  volume.addColorStop(0, rgba(c.deep, 0)); volume.addColorStop(.6, rgba(c.deep, .06)); volume.addColorStop(1, rgba(c.deep, .42));
  ctx.fillStyle = volume; ctx.fillRect(-42, -40, 84, 76);
  // Subsurface glow: moonlight scattering through the jelly and gathering low.
  const glow = ctx.createRadialGradient(material.glow.x0, material.glow.y0, material.glow.r0, material.glow.x1, material.glow.y1, material.glow.r1);
  glow.addColorStop(0, rgba(c.glow, .62)); glow.addColorStop(.55, rgba(c.glow, .2)); glow.addColorStop(1, rgba(c.glow, 0));
  ctx.fillStyle = glow; ctx.fillRect(-36, -16, 72, 50);
  // A translucent seed suspended inside the gel, not a flat face patch.
  ctx.save(); ctx.globalAlpha = .24;
  tracePath(ctx, CORE);
  ctx.fillStyle = rgb(c.glow); ctx.fill(); ctx.restore();
  // Soft inner rim of cool moonlight hugging the upper-left edge.
  const rimLight = ctx.createLinearGradient(material.rim.x1, material.rim.y1, material.rim.x2, material.rim.y2);
  rimLight.addColorStop(0, rgba(c.shine, .62)); rimLight.addColorStop(.55, rgba(c.rim, .14)); rimLight.addColorStop(1, rgba(c.rim, 0));
  slimeOutline(ctx); ctx.strokeStyle = rimLight; ctx.lineWidth = 6; ctx.stroke();
  // Reflected floor light: a faint caustic band along the base.
  const bounce = ctx.createLinearGradient(material.bounce.x1, material.bounce.y1, material.bounce.x2, material.bounce.y2);
  bounce.addColorStop(0, rgba(c.glow, 0)); bounce.addColorStop(1, rgba(c.glow, .38));
  ctx.strokeStyle = bounce; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-27, 27.5); ctx.quadraticCurveTo(0, 33, 27, 27.5); ctx.stroke();
  // Cheeks: a gentle warmth beside the eyes, identical for every role.
  const { cheek, sheen, glint, spark } = SLIME_LIGHT;
  for (const side of [-1, 1]) softEllipse(ctx, side * cheek.x, cheek.y, cheek.rx, cheek.ry, 0, rgba(c.blush, .34), rgba(c.blush, 0));
  // Broad, feathered sheen plus one crisp glint: refined gel, not hard candy.
  softEllipse(ctx, sheen.x, sheen.y, sheen.rx, sheen.ry, sheen.angle, rgba(c.shine, .5), rgba(c.shine, 0));
  softEllipse(ctx, glint.x, glint.y, glint.rx, glint.ry, glint.angle, "rgba(255,255,250,.92)", "rgba(255,255,250,.18)");
  ctx.fillStyle = "rgba(255,255,250,.78)";
  ctx.beginPath(); ctx.arc(spark.x, spark.y, spark.r, 0, Math.PI * 2); ctx.fill();
  // Stable, very fine grain is baked once; no per-frame noise or filters.
  for (let i = 0; i < 150; i++) {
    const x = (i * 37 % 73) - 36, y = (i * 53 % 71) - 35;
    ctx.globalAlpha = i % 3 ? .03 : .05;
    ctx.fillStyle = i % 2 ? rgb(c.shine) : rgb(c.core);
    ctx.beginPath(); ctx.ellipse(x, y, .45 + i % 3 * .12, .25, -.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // A thin edge, lit on the moon side and deepening underneath, keeps the
  // silhouette readable on pale clearings without a hard cartoon outline.
  const edge = ctx.createLinearGradient(material.edge.x1, material.edge.y1, material.edge.x2, material.edge.y2);
  edge.addColorStop(0, rgba(c.rim, .55)); edge.addColorStop(.5, rgba(c.edge, .5)); edge.addColorStop(1, rgba(c.deep, .8));
  slimeOutline(ctx);
  ctx.strokeStyle = edge;
  ctx.lineWidth = .9;
  ctx.stroke();
  if (withSprout) drawSprout(ctx, c);
  return canvas;
}

/** Soft, tapered white eyes; every role has the same expression. */
export function slimeEyes(ctx: CanvasRenderingContext2D, blink: boolean, muted = false, style: EyeStyle = "FIERCE") {
  ctx.save();
  ctx.translate(0, 1.5); ctx.scale(SLIME_EYE_SCALE, SLIME_EYE_SCALE);
  if (!blink && !muted) {
    // The same shape, nudged down, reads as a soft socket in the gel.
    ctx.save(); ctx.translate(0, 1.1);
    ctx.fillStyle = SLIME_EYE_SHADE;
    ctx.beginPath(); drawEyeShape(ctx, style); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = muted ? "rgba(173,187,190,.3)" : "#f5ffef";
  ctx.beginPath();
  if (blink) {
    ctx.roundRect(-15, 8, 9, 1.3, .6);
    ctx.roundRect(8, 8, 9, 1.3, .6);
  } else {
    drawEyeShape(ctx, style);
  }
  ctx.fill();
  ctx.restore();
}

/** Bake translucent material, surface grain, and reflected light once per color. */
export function slimeSkin(color: string, moonlit = true, withSprout = true): HTMLCanvasElement {
  color = normalizeColor(color);
  // Fog/Blackout keep their subdued material, separate from the brighter normal skin.
  const cacheKey = `${color}:${moonlit}:${moonlit && withSprout}`;
  const cached = skins.get(cacheKey);
  if (cached) {
    skins.delete(cacheKey); skins.set(cacheKey, cached);
    return cached;
  }
  if (moonlit) {
    const skin = referenceSkin(color, withSprout);
    cacheSkin(cacheKey, skin);
    return skin;
  }
  const rgb = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16));
  const pigment = rgb.map((channel, index) => Math.round(channel * 0.74 + [91, 116, 125][index] * 0.26));
  const tone = (light: number, alpha: number) => `rgba(${pigment.map((channel) => Math.round(channel * light)).join(",")},${alpha})`;
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 224;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);
  ctx.translate(48, 54);
  slimeOutline(ctx);
  const body = ctx.createLinearGradient(-24, -37, 22, 37);
  body.addColorStop(0, moonlit ? "rgba(202,223,229,.84)" : "rgba(164,186,195,.76)");
  body.addColorStop(0.17, tone(moonlit ? 1.06 : 0.95, 0.88));
  body.addColorStop(0.46, tone(moonlit ? 0.97 : 0.75, moonlit ? 0.82 : 0.64));
  body.addColorStop(0.8, tone(moonlit ? 0.73 : 0.51, 0.89));
  body.addColorStop(1, moonlit ? "rgba(39,70,79,.94)" : "rgba(12,29,39,.96)");
  ctx.fillStyle = body;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const depth = ctx.createRadialGradient(-10, -18, 3, 5, 4, 47);
  depth.addColorStop(0, "rgba(207,229,231,.13)");
  depth.addColorStop(0.48, "rgba(13,38,49,0)");
  depth.addColorStop(1, moonlit ? "rgba(15,41,53,.32)" : "rgba(3,17,28,.57)");
  ctx.fillStyle = depth;
  ctx.fillRect(-42, -46, 84, 94);
  const core = ctx.createRadialGradient(4, 16, 1, 4, 16, 27);
  core.addColorStop(0, tone(1.05, 0.18));
  core.addColorStop(1, tone(0.8, 0));
  ctx.fillStyle = core;
  ctx.fillRect(-34, -15, 70, 58);

  // Soft reflected moonlight, without a painted white shine.
  ctx.save();
  ctx.translate(-12, -20);
  ctx.rotate(-0.5);
  ctx.scale(1, 0.4);
  const reflection = ctx.createRadialGradient(0, 0, 0, 0, 0, 18);
  reflection.addColorStop(0, moonlit ? "rgba(229,244,242,.52)" : "rgba(218,234,237,.34)");
  reflection.addColorStop(0.5, "rgba(184,207,217,.14)");
  reflection.addColorStop(1, "rgba(184,207,217,0)");
  ctx.fillStyle = reflection;
  ctx.fillRect(-20, -20, 40, 40);
  ctx.restore();

  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(206,229,234,.2)";
  ctx.lineWidth = 3;
  slimeOutline(ctx);
  ctx.stroke();

  // Fine surface grain is identical across players and baked into the cache.
  let grain = 173;
  for (let i = 0; i < 280; i++) {
    grain = (grain * 16807) % 2147483647;
    const x = (grain % 800) / 10 - 40;
    grain = (grain * 16807) % 2147483647;
    const y = (grain % 900) / 10 - 45;
    ctx.fillStyle = i % 2 ? "rgba(218,235,231,.035)" : "rgba(3,17,27,.06)";
    ctx.fillRect(x, y, 0.55, 0.55);
  }
  ctx.restore();
  const rim = ctx.createLinearGradient(-27, -35, 24, 32);
  rim.addColorStop(0, "rgba(202,225,230,.55)");
  rim.addColorStop(0.36, tone(0.9, 0.25));
  rim.addColorStop(0.75, "rgba(12,26,35,.5)");
  rim.addColorStop(1, "rgba(110,153,166,.27)");
  slimeOutline(ctx);
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1;
  ctx.stroke();
  cacheSkin(cacheKey, canvas);
  return canvas;
}

/** Small cached crown layer: it can lag behind the gel without repainting it. */
export function drawSlimeSprout(ctx: CanvasRenderingContext2D, color: string, tilt = 0) {
  color = normalizeColor(color);
  const key = `sprout:${color}`;
  let sprite = skins.get(key);
  if (!sprite) {
    sprite = document.createElement("canvas"); sprite.width = 96; sprite.height = 64;
    const paint = sprite.getContext("2d")!;
    paint.scale(2, 2); paint.translate(16, 52); drawSprout(paint, paletteChannels(color));
    cacheSkin(key, sprite);
  } else { skins.delete(key); skins.set(key, sprite); }
  ctx.save(); ctx.translate(2, -32); ctx.rotate(Number.isFinite(tilt) ? tilt : 0); ctx.translate(-2, 32);
  ctx.drawImage(sprite, -16, -52, 48, 32); ctx.restore();
}

function cacheSkin(key: string, canvas: HTMLCanvasElement) {
  if (skins.size >= SLIME_SKIN_CACHE_LIMIT) skins.delete(skins.keys().next().value!);
  skins.set(key, canvas);
}
