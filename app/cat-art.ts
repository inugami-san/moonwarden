import type { EyeStyle } from "../server/appearance";
import { drawEyeShape } from "./cat-eyes";
import { mooncatHatAnchor } from "./mooncat-renderer";
export { drawMooncat as drawAnimatedCat } from "./mooncat-renderer";

const skins = new Map<string, HTMLCanvasElement>();
export const SLIME_SKIN_CACHE_LIMIT = 48;

type BodyCommand = ["M", number, number] | ["C", number, number, number, number, number, number] | ["Z"];
const pathString = (commands: readonly BodyCommand[]) => commands.map(([command, ...points]) => `${command}${points.join(" ")}`).join("");

/**
 * A 2.5D three-quarter 4-legged cat in angled top-down perspective, shared by
 * Canvas, portraits and concealed silhouettes. Pointed feline ears, a defined
 * head/neck overlap, plump horizontal torso, and four stubby legs with an
 * elevated under-belly arch follow the character reference sheet.
 */
const BODY: readonly BodyCommand[] = [
  ["M", -8, -12],
  ["C", -9, -20, -6, -28, -2, -33],
  ["C", 3, -28, 7, -21, 16, -21],
  ["C", 20, -26, 23, -30, 26, -32],
  ["C", 33, -19, 39, 1, 21, 10],
  ["C", 23, 16, 20, 24, 11, 23],
  ["C", 9, 30, -2, 30, -4, 18],
  ["C", -9, 17, -15, 17, -20, 17],
  ["C", -21, 28, -31, 28, -32, 14],
  ["C", -42, 1, -31, -19, -8, -12],
  ["Z"],
];

/** Grounded 4-legged 2.5D cat silhouette with pointed ears, neck, torso, and 4 legs. */
export const SLIME_PATH = pathString(BODY);
const CORE: readonly BodyCommand[] = [["M", 4, -18], ["C", 7, -20, 15, -20, 18, -18], ["C", 15, -15, 7, -15, 4, -18], ["Z"]];
export const SLIME_CORE_PATH = pathString(CORE);
const SPROUT: Readonly<Record<"stem" | "leafRight" | "leafLeft" | "vein", readonly BodyCommand[]>> = {
  stem: [
    ["M", -23, 1],
    ["C", -43, -3, -48, -27, -33, -38],
    ["C", -20, -45, -10, -34, -15, -22],
    ["C", -18, -15, -28, -16, -27, -24],
    ["C", -26, -30, -34, -29, -33, -19],
    ["C", -32, -11, -26, -6, -19, -4],
  ],
  leafLeft: [
    ["M", -23, 1],
    ["C", -43, -3, -48, -27, -33, -38],
    ["C", -20, -45, -10, -34, -15, -22],
    ["C", -18, -15, -28, -16, -27, -24],
    ["C", -26, -30, -34, -29, -33, -19],
    ["C", -32, -11, -26, -6, -19, -4],
    ["Z"],
  ],
  leafRight: [["M", 18, -19], ["C", 20, -25, 22, -29, 25, -30], ["C", 27, -25, 28, -21, 27, -16], ["C", 24, -17, 21, -18, 18, -19], ["Z"]],
  vein: [["M", -36, -10], ["C", -42, -22, -36, -35, -24, -37]],
};
/** Upturned hooked cat tail and inner-ear contour; hidden by concealment. */
export const SLIME_SPROUT = Object.freeze({
  stem: pathString(SPROUT.stem), leafRight: pathString(SPROUT.leafRight),
  leafLeft: pathString(SPROUT.leafLeft), vein: pathString(SPROUT.vein),
});
/** Physical light positions shared by SVG and Canvas, in body coordinates.
 * Object-bounding-box gradients made the portrait look like a different gel. */
export const SLIME_MATERIAL = Object.freeze({
  gel: { x1: -18, y1: -32, x2: 18, y2: 28 },
  volume: { x0: 6, y0: -10, r0: 8, x1: -4, y1: 2, r1: 48 },
  glow: { x0: 10, y0: -6, r0: 2, x1: 6, y1: 0, r1: 28 },
  rim: { x1: -32, y1: -28, x2: 14, y2: 8 },
  edge: { x1: -28, y1: -32, x2: 24, y2: 30 },
  bounce: { x1: -20, y1: -12, x2: 20, y2: 26 },
  bouncePath: "M-6 -19Q-8 -11 -5 -4M-8 -10Q-14 2 1 9Q11 12 21 10M-4 18Q-5 12 -2 8M11 23Q10 16 10 10M-20 17Q-17 10 -22 5",
});
/** Subtle top-down 2.5D lighting across the cat's back and forehead. */
export const SLIME_LIGHT = Object.freeze({
  sheen: { x: -16, y: -7, rx: 10, ry: 4.5, angle: -15 },
  glint: { x: 10, y: -17, rx: 4.0, ry: 1.8, angle: -10 },
  spark: { x: 5, y: -18, r: .5 },
  cheek: { x: 11, y: 1, rx: 3.5, ry: 1.8 },
});
/** Scale feline eyes to sit naturally on the 2.5D cat head. */
export const SLIME_EYE_SCALE = .84;
/** Bold dark feline eyeliner and socket shade. */
export const SLIME_EYE_SHADE = "rgba(18,14,32,.88)";

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
    body: blend(base, [220, 228, 242], .08),
    rim: blend(base, [232, 238, 255], .34),
    edge: blend(base, [28, 34, 58], .46),
    core: blend(base, [20, 26, 48], .58),
    shine: blend(base, [246, 244, 255], .78),
    glow: blend(base, [240, 244, 255], .28),
    deep: blend(base, [10, 12, 24], .78),
    blush: blend(base, [255, 132, 158], .64),
    leaf: blend(base, [224, 229, 250], .16),
    leafShade: blend(base, [16, 20, 40], .62),
    leafVein: blend(base, [245, 245, 255], .65),
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
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const leaf = ctx.createLinearGradient(-42, -36, -24, 2);
  leaf.addColorStop(0, rgb(c.leaf)); leaf.addColorStop(1, rgb(c.leafShade));
  ctx.fillStyle = leaf;
  tracePath(ctx, SPROUT.leafLeft); ctx.fill();
  // Shaded inner-ear fold on the right cat ear.
  ctx.fillStyle = rgba(c.deep, .52);
  tracePath(ctx, SPROUT.leafRight); ctx.fill();
  ctx.strokeStyle = rgb(c.deep); ctx.lineWidth = 2.3;
  tracePath(ctx, SPROUT.stem); ctx.stroke();
  ctx.globalAlpha = .28; ctx.strokeStyle = rgb(c.leafVein); ctx.lineWidth = 1.1;
  tracePath(ctx, SPROUT.vein); ctx.stroke();
  // Twinkling starry specks on the curled spiral tail.
  ctx.globalAlpha = .85;
  ctx.fillStyle = "#e8f9ff";
  ctx.beginPath();
  ctx.arc(-36, -24, .9, 0, Math.PI * 2);
  ctx.arc(-28, -35, .8, 0, Math.PI * 2);
  ctx.arc(-21, -28, .75, 0, Math.PI * 2);
  ctx.arc(-34, -14, .7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCrescentMoon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(cx - r * .52, cy - r * .82);
  ctx.bezierCurveTo(cx - r * 1.28, cy - r * .05, cx - r * .68, cy + r * 1.18, cx + r * .36, cy + r * .96);
  ctx.bezierCurveTo(cx + r * .92, cy + r * .84, cx + r * 1.12, cy + r * .28, cx + r * .92, cy - r * .26);
  ctx.bezierCurveTo(cx + r * .52, cy + r * .38, cx - r * .52, cy + r * .18, cx - r * .52, cy - r * .82);
  ctx.closePath();
  ctx.fill();
}

function drawStaticMoonwardenRegalia(ctx: CanvasRenderingContext2D, stroke: string) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // 1. Starry specks on the upper rump/back
  ctx.fillStyle = "rgba(228,248,255,.82)";
  ctx.beginPath();
  ctx.arc(-24, -4, .85, 0, Math.PI * 2);
  ctx.arc(-19, -8, .65, 0, Math.PI * 2);
  ctx.arc(-27, 1, .7, 0, Math.PI * 2);
  ctx.arc(-16, -2, .6, 0, Math.PI * 2);
  ctx.fill();

  // 2. Glowing Cyan Runic Bracer on the near foreleg
  ctx.fillStyle = "#2b8ec9";
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-4.8, 15.5);
  ctx.quadraticCurveTo(-.2, 17.2, 4.2, 15.2);
  ctx.lineTo(3.6, 20.4);
  ctx.quadraticCurveTo(-.3, 22.1, -4.2, 20.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "#9ef8ff";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-2.2, 17.2); ctx.lineTo(-2.0, 19.6);
  ctx.moveTo(-.1, 17.5); ctx.lineTo(0, 19.9);
  ctx.moveTo(2.0, 17.1); ctx.lineTo(1.8, 19.5);
  ctx.stroke();

  // 3. Celestial Moonwarden Scarf & Flaring Wing-Tips + Crescent Pendant
  ctx.fillStyle = "#5262cf";
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2.0;
  // Back wing-tip
  ctx.beginPath();
  ctx.moveTo(-9, -4);
  ctx.quadraticCurveTo(-19, -14, -15, -18);
  ctx.quadraticCurveTo(-8, -16, -5, -7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Main cosmic wing-tip & collar wrap
  ctx.fillStyle = "#48b8e8";
  ctx.beginPath();
  ctx.moveTo(-8, 1);
  ctx.quadraticCurveTo(-20, -4, -18, -11);
  ctx.quadraticCurveTo(-11, -11, -6, -3);
  ctx.quadraticCurveTo(2, 10, 18, 9);
  ctx.quadraticCurveTo(19, 13, 12, 14);
  ctx.quadraticCurveTo(-2, 14, -10, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Scarf inner trim & star specks
  ctx.strokeStyle = "#a8f8ff";
  ctx.lineWidth = .9;
  ctx.beginPath();
  ctx.moveTo(-14, -7);
  ctx.quadraticCurveTo(-7, 6, 14, 11);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(-12, -5, .65, 0, Math.PI * 2);
  ctx.arc(-7, 2, .6, 0, Math.PI * 2);
  ctx.fill();
  // Glowing Crescent Moon Collar Pendant
  ctx.fillStyle = "#262347";
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(10.5, 12.2, 4.0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#a8faff";
  drawCrescentMoon(ctx, 10.5, 12.2, 2.3);
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
  ctx.lineJoin = "round";

  // Far 4th hind leg tucked slightly behind the under-belly arch for 2.5D depth.
  ctx.fillStyle = rgb(c.edge);
  ctx.strokeStyle = rgb(c.deep);
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(-18, 16);
  ctx.quadraticCurveTo(-18, 24, -13.5, 24);
  ctx.quadraticCurveTo(-9.5, 24, -9.5, 16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Base 2.5D cat coat: vibrant top coat shading into rich underside shadow.
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
  // Smooth 2.5D cel/volume shading along the lower belly and hindquarter.
  const volume = ctx.createRadialGradient(material.volume.x0, material.volume.y0, material.volume.r0, material.volume.x1, material.volume.y1, material.volume.r1);
  volume.addColorStop(0, rgba(c.deep, 0)); volume.addColorStop(.6, rgba(c.deep, .1)); volume.addColorStop(1, rgba(c.deep, .48));
  ctx.fillStyle = volume; ctx.fillRect(-44, -40, 88, 78);
  // Subtle forehead/muzzle warmth on the front-right cat head.
  const glow = ctx.createRadialGradient(material.glow.x0, material.glow.y0, material.glow.r0, material.glow.x1, material.glow.y1, material.glow.r1);
  glow.addColorStop(0, rgba(c.glow, .22)); glow.addColorStop(.55, rgba(c.glow, .08)); glow.addColorStop(1, rgba(c.glow, 0));
  ctx.fillStyle = glow; ctx.fillRect(-38, -28, 76, 62);
  // Soft matte crown highlight between the cat's ears (no glossy slime sticker).
  ctx.save(); ctx.globalAlpha = .08;
  tracePath(ctx, CORE);
  ctx.fillStyle = rgb(c.glow); ctx.fill(); ctx.restore();
  // Sleek top rim highlight along the cat's arched back and ears.
  const rimLight = ctx.createLinearGradient(material.rim.x1, material.rim.y1, material.rim.x2, material.rim.y2);
  rimLight.addColorStop(0, rgba(c.shine, .28)); rimLight.addColorStop(.55, rgba(c.rim, .08)); rimLight.addColorStop(1, rgba(c.rim, 0));
  slimeOutline(ctx); ctx.strokeStyle = rimLight; ctx.lineWidth = 2.4; ctx.stroke();

  // Crisp 2.5D anatomical vector lines: left ear fold, head-to-body neck contour, forelegs, and hind thigh.
  const bounce = ctx.createLinearGradient(material.bounce.x1, material.bounce.y1, material.bounce.x2, material.bounce.y2);
  bounce.addColorStop(0, rgba(c.deep, .88)); bounce.addColorStop(1, rgba(c.deep, .95));
  ctx.strokeStyle = bounce; ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-6, -19);
  ctx.quadraticCurveTo(-8, -11, -5, -4);
  ctx.moveTo(-8, -10);
  ctx.quadraticCurveTo(-14, 2, 1, 9);
  ctx.quadraticCurveTo(11, 12, 21, 10);
  ctx.moveTo(-4, 18);
  ctx.quadraticCurveTo(-5, 12, -2, 8);
  ctx.moveTo(11, 23);
  ctx.quadraticCurveTo(10, 16, 10, 10);
  ctx.moveTo(-20, 17);
  ctx.quadraticCurveTo(-17, 10, -22, 5);
  ctx.stroke();
  ctx.restore();

  // Bold vector outline around the 4-legged cat silhouette.
  const edge = ctx.createLinearGradient(material.edge.x1, material.edge.y1, material.edge.x2, material.edge.y2);
  edge.addColorStop(0, rgba(c.deep, .88)); edge.addColorStop(.5, rgba(c.deep, .94)); edge.addColorStop(1, rgba(c.deep, .98));
  slimeOutline(ctx);
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  if (withSprout) {
    drawStaticMoonwardenRegalia(ctx, rgb(c.deep));
    drawSprout(ctx, c);
  }
  return canvas;
}

/** Moonwarden forehead crescent, golden-amber feline eyes, dark pupils, and cute triangular nose + 'w' mouth. */
export function slimeEyes(ctx: CanvasRenderingContext2D, blink: boolean, muted = false, style: EyeStyle = "FIERCE") {
  ctx.save();
  ctx.translate(12.5, -10.5); ctx.scale(SLIME_EYE_SCALE, SLIME_EYE_SCALE);
  if (!blink && !muted) {
    // Bold dark feline eye outline.
    ctx.save();
    ctx.translate(0, .8);
    ctx.fillStyle = SLIME_EYE_SHADE;
    ctx.beginPath(); drawEyeShape(ctx, style); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Glowing Pale-Cyan / White Crescent Moon Emblem on the forehead above the eyes
    ctx.fillStyle = "rgba(130, 232, 255, .28)";
    ctx.beginPath();
    ctx.arc(2.2, -5.0, 4.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ebfbff";
    drawCrescentMoon(ctx, 2.2, -5.0, 3.4);

    // Cute coral-pink triangular cat nose + delicate 'w' feline mouth (matches Moonwarden Redesign sheet)
    ctx.fillStyle = "#f27493";
    ctx.strokeStyle = "#161124";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(.2, 10.6);
    ctx.lineTo(3.6, 10.6);
    ctx.lineTo(1.9, 12.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "#161124";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-1.2, 13.8);
    ctx.quadraticCurveTo(.4, 15.1, 1.9, 13.1);
    ctx.quadraticCurveTo(3.4, 15.1, 5.0, 13.8);
    ctx.stroke();

    // Golden-amber cat irises.
    ctx.fillStyle = "#f5b83d";
    ctx.beginPath();
    drawEyeShape(ctx, style);
    ctx.fill();
    ctx.strokeStyle = "#161124";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // Dark vertical-oval feline pupils with plenty of warm golden iris around them.
    ctx.fillStyle = "#161124";
    ctx.beginPath();
    ctx.ellipse(-8.6, 7.6, 1.7, 2.8, 0, 0, Math.PI * 2);
    ctx.ellipse(12.8, 7.4, 1.6, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = muted ? "rgba(173,187,190,.3)" : "#f5ffef";
  ctx.beginPath();
  if (blink) {
    ctx.roundRect(-15, 8, 9, 1.5, .7);
    ctx.roundRect(8, 8, 9, 1.5, .7);
  } else if (muted) {
    drawEyeShape(ctx, style);
  } else {
    // Subtle white eye catchlight glints.
    ctx.arc(-10.2, 5.2, 1.2, 0, Math.PI * 2);
    ctx.moveTo(12.4, 5.2);
    ctx.arc(11.3, 5.2, 1.1, 0, Math.PI * 2);
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

/** Cached feline tail & ear-tuft layer: sways with gait without repainting the body. */
export function drawSlimeSprout(ctx: CanvasRenderingContext2D, color: string, tilt = 0) {
  color = normalizeColor(color);
  const key = `sprout:${color}`;
  let sprite = skins.get(key);
  if (!sprite) {
    sprite = document.createElement("canvas"); sprite.width = 192; sprite.height = 192;
    const paint = sprite.getContext("2d")!;
    paint.scale(2, 2); paint.translate(48, 54); drawSprout(paint, paletteChannels(color));
    cacheSkin(key, sprite);
  } else { skins.delete(key); skins.set(key, sprite); }
  ctx.save(); ctx.translate(-26, 8); ctx.rotate(Number.isFinite(tilt) ? tilt : 0); ctx.translate(26, -8);
  ctx.drawImage(sprite, -48, -54, 96, 96); ctx.restore();
}

function cacheSkin(key: string, canvas: HTMLCanvasElement) {
  if (skins.size >= SLIME_SKIN_CACHE_LIMIT) skins.delete(skins.keys().next().value!);
  skins.set(key, canvas);
}

export type CatDirection = "EAST" | "WEST" | "SOUTH" | "NORTH" | "SE" | "SW" | "NE" | "NW";

type CatGaitState = { dir: CatDirection; phase: number; stride: number; at: number; diagonalUntil: number; lastSpeed: number; settleSpeed: number; x?: number; y?: number };
const catGaits = new Map<string, CatGaitState>();
const isDiagonalDirection = (dir: CatDirection) => dir === "NE" || dir === "NW" || dir === "SE" || dir === "SW";
export const CAT_STRIDE_DISTANCE = 112;
const HEADING_ANGLES: Readonly<Record<CatDirection, number>> = { EAST: 0, SE: Math.PI / 4, SOUTH: Math.PI / 2, SW: Math.PI * 3 / 4, WEST: Math.PI, NW: -Math.PI * 3 / 4, NORTH: -Math.PI / 2, NE: -Math.PI / 4 };

/** Resolve a 2.5D cat heading direction from movement velocity, preserving the last heading when idle. */
export function resolveCatDirection(vx: number, vy: number, fallback: CatDirection = "SE"): CatDirection {
  const speed = Math.hypot(vx, vy);
  if (speed < .05) return fallback;
  const angle = Math.atan2(vy, vx) * (180 / Math.PI); // -180..180, 0 = East, 90 = South, -90 = North
  if (angle >= -112.5 && angle <= -67.5) return "NORTH";
  if (angle >= 67.5 && angle <= 112.5) return "SOUTH";
  if (angle > -67.5 && angle < -22.5) return "NE";
  if (angle < -112.5 && angle > -157.5) return "NW";
  if (angle >= -22.5 && angle <= 22.5) return "EAST";
  if (angle > 22.5 && angle < 67.5) return "SE";
  if (angle > 112.5 && angle < 157.5) return "SW";
  return "WEST";
}

/** Sample continuous 4-legged cat stride phase, stride intensity, and persistent 8-way heading direction. */
export function sampleCatGait(
  id: string,
  vx: number,
  vy: number,
  gazeX: number,
  gazeY: number,
  elapsed: number,
  reducedMotion = false,
  position?: { x: number; y: number },
): { direction: CatDirection; stridePhase: number; strideAmount: number } {
  let state = catGaits.get(id);
  if (!Number.isFinite(elapsed)) return { direction: state?.dir ?? "SE", stridePhase: 0, strideAmount: 0 };
  const hasPosition = position && Number.isFinite(position.x) && Number.isFinite(position.y);
  if (!state || elapsed < state.at || elapsed - state.at > .3) {
    const previousDirection = state?.dir ?? "SE";
    state = { dir: previousDirection, phase: 0, stride: 0, at: elapsed, diagonalUntil: 0, lastSpeed: 0, settleSpeed: 0, x: hasPosition ? position.x : undefined, y: hasPosition ? position.y : undefined };
    if (catGaits.size >= 64) catGaits.delete(catGaits.keys().next().value!);
    catGaits.set(id, state);
  }
  const frameElapsed = Math.max(0, elapsed - state.at);
  const dt = Math.min(.05, frameElapsed);
  state.at = elapsed;
  vx = Number.isFinite(vx) ? vx : 0; vy = Number.isFinite(vy) ? vy : 0;
  let traveled: number | undefined;
  if (hasPosition) {
    if (frameElapsed > 0 && state.x !== undefined && state.y !== undefined) {
      const dx = position.x - state.x, dy = position.y - state.y;
      const distance = Math.hypot(dx, dy), speed = distance / frameElapsed;
      // Interpolation and collisions use traveled distance; network teleports
      // reset the gait rather than turning into a burst of frantic foot motion.
      if (speed <= 600) { vx = dx / frameElapsed; vy = dy / frameElapsed; traveled = distance; }
      else { vx = 0; vy = 0; state.stride = 0; state.phase = 0; state.settleSpeed = 0; traveled = 0; }
    }
    state.x = position.x; state.y = position.y;
  }
  gazeX = Number.isFinite(gazeX) ? gazeX : 0; gazeY = Number.isFinite(gazeY) ? gazeY : 0;
  const rawSpeed = Math.hypot(vx, vy);
  const effVx = rawSpeed > 6 ? vx : gazeX * 135;
  const effVy = rawSpeed > 6 ? vy : gazeY * 165;
  const effSpeed = Math.hypot(effVx, effVy);
  if (effSpeed > 8) {
    const candidate = resolveCatDirection(effVx, effVy, state.dir);
    const angleDelta = Math.atan2(Math.sin(Math.atan2(effVy, effVx) - HEADING_ANGLES[state.dir]), Math.cos(Math.atan2(effVy, effVx) - HEADING_ANGLES[state.dir]));
    // A few degrees of angular hysteresis keep adjacent painted feet from
    // flickering between registrations when interpolation grazes a sector edge.
    const clearTurn = candidate === state.dir || Math.abs(angleDelta) > Math.PI / 8 + .07;
    if (clearTurn && isDiagonalDirection(candidate)) {
      state.dir = candidate;
      state.diagonalUntil = elapsed + .14;
    } else if (clearTurn && (!isDiagonalDirection(state.dir) || (elapsed >= state.diagonalUntil && effSpeed >= state.lastSpeed * .88))) {
      state.dir = candidate;
    }
  }
  state.lastSpeed = effSpeed;
  if (reducedMotion) {
    state.stride = 0;
    state.settleSpeed = 0;
    return { direction: state.dir, stridePhase: 0, strideAmount: 0 };
  }
  // Gaze may keep facing alive but must never make stationary paws walk.
  const targetStride = rawSpeed > 6 ? Math.min(1, rawSpeed / 130) : 0;
  const blend = 1 - Math.exp(-dt * (targetStride > state.stride ? 12 : 20));
  state.stride += (targetStride - state.stride) * blend;
  let phaseDistance = 0;
  if (rawSpeed > 6) {
    phaseDistance = Math.min(traveled ?? rawSpeed * frameElapsed, 360 * frameElapsed);
    state.settleSpeed = Math.min(200, rawSpeed);
  } else if (state.stride > .002) {
    // Finish a small fraction of the current swing while its amplitude fades.
    // This is visual-only: no blocked cat is moved, and it never starts a loop.
    const decay = Math.exp(-dt * 18);
    phaseDistance = state.settleSpeed * (1 - decay) / 18;
    state.settleSpeed *= decay;
  } else {
    state.stride = 0;
    state.settleSpeed = 0;
  }
  state.phase = (state.phase + phaseDistance * Math.PI * 2 / CAT_STRIDE_DISTANCE) % (Math.PI * 2);
  return { direction: state.dir, stridePhase: state.phase, strideAmount: state.stride };
}

/** Head/hat anchor coordinates for each of the 8 2.5D directional cat poses. */
export function catHatAnchor(direction: CatDirection): { x: number; y: number } {
  return mooncatHatAnchor(direction);
}

function drawSteppingLeg(
  ctx: CanvasRenderingContext2D,
  hipX: number,
  hipY: number,
  pawX: number,
  pawY: number,
  width: number,
  fill: string,
  stroke: string,
  openTop = true,
  withBracer = false,
  muted = false,
) {
  const topHalf = width * .52;
  const pawHalf = width * .36;
  const bend = (pawX - hipX) * .25;
  const midX = (hipX + pawX) * .5 + bend;
  const midY = (hipY + pawY) * .52;
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(hipX - topHalf, hipY);
  ctx.bezierCurveTo(hipX - topHalf, midY - 1.5, midX - pawHalf * 1.15, pawY - 3.5, pawX - pawHalf, pawY - 1.2);
  ctx.bezierCurveTo(pawX - pawHalf * .55, pawY + 3.2, pawX + pawHalf * .55, pawY + 3.2, pawX + pawHalf, pawY - 1.2);
  ctx.bezierCurveTo(midX + pawHalf * 1.15, pawY - 3.5, hipX + topHalf, midY - 1.5, hipX + topHalf, hipY);
  if (!openTop) ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Wide Double-Rimmed Glowing Cyan Runic Bracer / Cuff on the near front leg
  if (withBracer && !muted) {
    const bx = hipX * .26 + pawX * .74;
    const by = hipY * .30 + pawY * .70 - 1.5;
    const angle = Math.atan2(pawX - hipX, Math.max(4, pawY - hipY)) * -.58;
    const hw = pawHalf * 1.22;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(angle);
    const bracerGrad = ctx.createLinearGradient(-hw, -2.8, hw, 2.8);
    bracerGrad.addColorStop(0, "#8cf6ff");
    bracerGrad.addColorStop(.45, "#389fe0");
    bracerGrad.addColorStop(1, "#1c5491");
    ctx.fillStyle = bracerGrad;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(-hw, -2.8);
    ctx.quadraticCurveTo(0, -1.6, hw, -2.8);
    ctx.lineTo(hw * .94, 2.5);
    ctx.quadraticCurveTo(0, 3.7, -hw * .94, 2.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Top & bottom bright cyan rim bands + glowing vertical rune ticks
    ctx.strokeStyle = "#befdff";
    ctx.lineWidth = .9;
    ctx.beginPath();
    ctx.moveTo(-hw * .88, -1.8); ctx.quadraticCurveTo(0, -.8, hw * .88, -1.8);
    ctx.moveTo(-hw * .84, 1.6); ctx.quadraticCurveTo(0, 2.6, hw * .84, 1.6);
    ctx.moveTo(-hw * .52, -.7); ctx.lineTo(-hw * .48, 1.1);
    ctx.moveTo(-.2, -.4); ctx.lineTo(-.1, 1.4);
    ctx.moveTo(hw * .48, -.7); ctx.lineTo(hw * .44, 1.1);
    ctx.stroke();
    ctx.restore();
  }
}

/** Sculpted feline hind haunch & hock tapering to a neat rounded cat paw. */
function drawHindHaunchLeg(
  ctx: CanvasRenderingContext2D,
  hipX: number,
  hipY: number,
  pawX: number,
  pawY: number,
  fill: string,
  stroke: string,
) {
  const pawHalf = 3.7;
  const hockX = hipX - 4.2 + (pawX - hipX) * .45;
  const hockY = (hipY + pawY) * .54;
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  // Rear rump/thigh curve down to the hock (ankle), then neat paw, then front stifle/shin curve up into the belly
  ctx.moveTo(hipX - 6.2, hipY - 3.5);
  ctx.bezierCurveTo(hipX - 7.5, hipY + 3, hockX - 3.5, hockY - 2, pawX - pawHalf, pawY - 1.2);
  ctx.bezierCurveTo(pawX - pawHalf * .55, pawY + 3.1, pawX + pawHalf * .55, pawY + 3.1, pawX + pawHalf, pawY - 1.2);
  ctx.bezierCurveTo(pawX + pawHalf * 1.05, hockY, hipX + 6.2, hipY + 5.5, hipX + 6.5, hipY - 1.5);
  ctx.fill();
  ctx.stroke();
}

function drawCurledStarTail(
  ctx: CanvasRenderingContext2D,
  anchorX: number,
  anchorY: number,
  tailWag: number,
  c: ReturnType<typeof paletteChannels>,
  stroke: string,
  muted: boolean,
) {
  if (muted) return;
  ctx.save();
  ctx.translate(anchorX, anchorY);
  ctx.rotate(tailWag);
  ctx.translate(23, -1);
  const leaf = ctx.createLinearGradient(-44, -40, -18, 2);
  leaf.addColorStop(0, rgb(c.rim));
  leaf.addColorStop(.52, rgb(c.leaf));
  leaf.addColorStop(1, rgb(c.leafShade));
  ctx.fillStyle = leaf;
  tracePath(ctx, SPROUT.leafLeft);
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2.2;
  tracePath(ctx, SPROUT.stem);
  ctx.stroke();
  // Clean non-intersecting inner snail-shell spiral curl stroke inside the rounded tip
  ctx.beginPath();
  ctx.moveTo(-27, -24);
  ctx.bezierCurveTo(-26, -18, -19, -18, -19, -23.5);
  ctx.bezierCurveTo(-19, -27.5, -24, -27.5, -23.5, -24);
  ctx.stroke();
  // Soft inner spiral rim highlight
  ctx.save();
  ctx.globalAlpha = .38;
  ctx.strokeStyle = rgb(c.leafVein);
  ctx.lineWidth = 1.3;
  tracePath(ctx, SPROUT.vein);
  ctx.stroke();
  ctx.restore();
  // Starry cosmic specks along the curled tail
  ctx.fillStyle = "#ebfbff";
  ctx.beginPath();
  ctx.arc(-37, -22, .95, 0, Math.PI * 2);
  ctx.arc(-31, -34, .85, 0, Math.PI * 2);
  ctx.arc(-20, -33, .8, 0, Math.PI * 2);
  ctx.arc(-22, -23, .7, 0, Math.PI * 2);
  ctx.arc(-35, -11, .75, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPawStarlightWisps(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  stridePhase: number,
  muted: boolean,
) {
  if (muted) return;
  ctx.save();
  const pulse = .55 + .35 * Math.sin(stridePhase * 2);
  ctx.globalAlpha = pulse;
  ctx.strokeStyle = "rgba(182, 236, 255, .72)";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(x - 8, y + 1);
  ctx.quadraticCurveTo(x - 16, y - 1, x - 13, y - 6);
  ctx.moveTo(x - 3, y + 3);
  ctx.quadraticCurveTo(x - 11, y + 4.5, x - 15, y + .5);
  ctx.stroke();
  // Tiny 4-point star sparkles
  ctx.fillStyle = "#e8fbff";
  const sx = x - 16, sy = y - 4.5;
  ctx.beginPath();
  ctx.moveTo(sx, sy - 2.3);
  ctx.quadraticCurveTo(sx, sy, sx + 2.3, sy);
  ctx.quadraticCurveTo(sx, sy, sx, sy + 2.3);
  ctx.quadraticCurveTo(sx, sy, sx - 2.3, sy);
  ctx.quadraticCurveTo(sx, sy, sx, sy - 2.3);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - 19, y + 1, .8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Wide, draped Celestial Moonwarden Shawl / Mantle wrapping around the neck,
 * left cheek, and shoulder with dual cosmic wing-tips, pale-cyan inner trim,
 * stardust specks, and a glowing Crescent Moon Clasp at the throat.
 */
function drawMoonScarfSide(
  ctx: CanvasRenderingContext2D,
  bobY: number,
  stroke: string,
  muted: boolean,
  pendantX = 11.5,
  pendantY = 12.2,
  wingOffsetX = 0,
) {
  if (muted) return;
  ctx.save();
  ctx.translate(0, bobY);
  const wx = wingOffsetX;
  const scarfGrad = ctx.createLinearGradient(-20 + wx, -15, 16, 13);
  scarfGrad.addColorStop(0, "#72f4ff");
  scarfGrad.addColorStop(.46, "#7c60e0");
  scarfGrad.addColorStop(1, "#331f6b");

  ctx.fillStyle = scarfGrad;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  // Inner edge hugs the left cheek & chin while outer edge flares into two celestial wing-tips over the back/shoulder
  ctx.moveTo(-7.2 + wx, -11.5);
  ctx.bezierCurveTo(-12.5 + wx, -15.5, -17.5 + wx, -16.5, -19.5 + wx, -14.5);
  ctx.bezierCurveTo(-19.5 + wx, -11.5, -16.5 + wx, -8.5, -13.5 + wx, -6.5);
  ctx.bezierCurveTo(-17.5 + wx, -5.5, -20.5 + wx, -2.5, -19.0 + wx, 1.0);
  ctx.bezierCurveTo(-15.5 + wx, 4.5, -10.0 + wx, 7.2, -4.5 + wx, 9.2);
  ctx.bezierCurveTo(1.5, 12.8, 9.5, 14.0, 16.5, 11.8);
  ctx.bezierCurveTo(18.0, 9.8, 16.5, 7.2, 13.5, 7.5);
  ctx.bezierCurveTo(4.5, 9.2, -5.5 + wx * .6, 3.8, -7.2 + wx, -11.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Continuous pale-cyan inner trim line along the outer edge of the shawl
  ctx.strokeStyle = "#98f6ff";
  ctx.lineWidth = 1.05;
  ctx.beginPath();
  ctx.moveTo(-17.0 + wx, -13.2);
  ctx.quadraticCurveTo(-13.5 + wx, -9.2, -11.2 + wx, -6.2);
  ctx.moveTo(-16.5 + wx, .2);
  ctx.bezierCurveTo(-10.5 + wx, 5.5, 1.5, 12.2, 14.8, 10.5);
  ctx.stroke();

  // Starry cosmic specks inside the shawl
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(-14.0 + wx, -11.5, .75, 0, Math.PI * 2);
  ctx.arc(-10.0 + wx, -7.8, .6, 0, Math.PI * 2);
  ctx.arc(-14.2 + wx, -1.5, .75, 0, Math.PI * 2);
  ctx.arc(-8.2 + wx * .7, 3.5, .7, 0, Math.PI * 2);
  ctx.arc(-.5, 8.8, .65, 0, Math.PI * 2);
  ctx.fill();

  // Glowing Crescent Moon Collar Clasp at the front V-fold of the scarf
  ctx.fillStyle = "#1f193d";
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.arc(pendantX, pendantY, 4.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#aefbff";
  drawCrescentMoon(ctx, pendantX, pendantY, 2.6);
  ctx.restore();
}

/**
 * High-craft Moonwarden feline face: luminous vertical-gradient almond cat eyes,
 * thick upper lash arch, vertical slit pupils, bright white catchlights,
 * glowing forehead crescent moon, tiny pink nose, and delicate 'ㅅ' mouth.
 */
function drawMoonwardenFace(
  ctx: CanvasRenderingContext2D,
  blink: boolean,
  muted: boolean,
  stroke: string,
  threeQuarter = true,
) {
  const leftX = threeQuarter ? 4.2 : -8.0;
  const leftY = threeQuarter ? -.4 : -.6;
  const leftRx = threeQuarter ? 4.8 : 4.6;
  const leftRy = threeQuarter ? 4.4 : 4.4;
  const rightX = threeQuarter ? 18.6 : 8.0;
  const rightY = threeQuarter ? -1.0 : -.6;
  const rightRx = threeQuarter ? 3.6 : 4.6;
  const rightRy = threeQuarter ? 4.2 : 4.4;
  const centerX = threeQuarter ? 12.6 : 0;
  const crescentX = threeQuarter ? 13.0 : 0;
  const crescentY = threeQuarter ? -11.2 : -11.8;

  if (muted) {
    ctx.fillStyle = "rgba(173,187,190,.3)";
    ctx.beginPath();
    ctx.ellipse(leftX, leftY, leftRx * .9, leftRy, 0, 0, Math.PI * 2);
    ctx.ellipse(rightX, rightY, rightRx * .9, rightRy, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // 1. Glowing Forehead Crescent Moon Emblem (tilted C-crescent opening upper-right)
  ctx.fillStyle = "rgba(122, 228, 255, .28)";
  ctx.beginPath();
  ctx.arc(crescentX, crescentY, 4.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f0fcff";
  drawCrescentMoon(ctx, crescentX, crescentY, 3.3);

  // 2. Tiny soft coral-pink triangular-oval cat nose & delicate 'ㅅ' mouth
  ctx.fillStyle = "#f0829b";
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(centerX - 1.2, 2.5);
  ctx.quadraticCurveTo(centerX, 2.1, centerX + 1.2, 2.5);
  ctx.quadraticCurveTo(centerX + .6, 3.9, centerX, 4.0);
  ctx.quadraticCurveTo(centerX - .6, 3.9, centerX - 1.2, 2.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.35;
  ctx.beginPath();
  ctx.moveTo(centerX - 2.2, 5.3);
  ctx.quadraticCurveTo(centerX - 1.0, 5.9, centerX, 4.3);
  ctx.quadraticCurveTo(centerX + 1.0, 5.9, centerX + 2.2, 5.3);
  ctx.stroke();

  if (blink) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(leftX - leftRx, leftY); ctx.quadraticCurveTo(leftX, leftY + 2, leftX + leftRx, leftY);
    ctx.moveTo(rightX - rightRx, rightY); ctx.quadraticCurveTo(rightX, rightY + 2, rightX + rightRx, rightY);
    ctx.stroke();
    return;
  }

  // 3. Luminous Almond Golden-Amber Feline Eyes
  const eyeGrad = ctx.createLinearGradient(0, -5.5, 0, 4.2);
  eyeGrad.addColorStop(0, "#d96b12");
  eyeGrad.addColorStop(.48, "#f5a824");
  eyeGrad.addColorStop(1, "#ffe86e");

  const drawAlmondEye = (cx: number, cy: number, rx: number, ry: number, tilt: number, pupilX: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    ctx.fillStyle = eyeGrad;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.65;
    ctx.beginPath();
    ctx.moveTo(-rx, .3);
    ctx.bezierCurveTo(-rx * .75, -ry * 1.18, rx * .75, -ry * 1.18, rx, -.2);
    ctx.bezierCurveTo(rx * .78, ry * 1.15, -rx * .78, ry * 1.15, -rx, .3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Expressive thicker upper feline lash line
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-rx * 1.02, .2);
    ctx.bezierCurveTo(-rx * .72, -ry * 1.2, rx * .72, -ry * 1.2, rx * 1.02, -.2);
    ctx.stroke();

    // Sharp vertical pointed-oval feline pupil
    ctx.fillStyle = "#160f24";
    ctx.beginPath();
    ctx.moveTo(pupilX, -ry * .68);
    ctx.quadraticCurveTo(pupilX + 1.75, 0, pupilX, ry * .68);
    ctx.quadraticCurveTo(pupilX - 1.75, 0, pupilX, -ry * .68);
    ctx.closePath();
    ctx.fill();

    // Crisp white upper-left catchlight glint
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(pupilX - 1.25, -ry * .34, 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  drawAlmondEye(leftX, leftY, leftRx, leftRy, .06, threeQuarter ? .35 : .1);
  drawAlmondEye(rightX, rightY, rightRx, rightRy, -.05, threeQuarter ? .2 : -.1);
}

/**
 * Interactive 2.5D 4-legged Moonwarden cat renderer with articulated quadruped
 * walk cycle and 8-way directional views (N, NE, E, SE, S, SW, W, NW) matching
 * the Moonwarden Character Re-Design reference sheet.
 */
export function drawLegacyCat(
  ctx: CanvasRenderingContext2D,
  options: {
    color: string;
    muted?: boolean;
    direction: CatDirection;
    stridePhase: number;
    strideAmount: number;
    blink: boolean;
    eyeStyle?: EyeStyle;
    holdingLantern?: boolean;
    tailTilt?: number;
    drawEyes?: (ctx: CanvasRenderingContext2D) => void;
  },
) {
  const {
    color,
    muted = false,
    direction,
    stridePhase,
    strideAmount,
    blink,
    holdingLantern = false,
    tailTilt = 0,
    drawEyes,
  } = options;
  const c = paletteChannels(color);
  const stroke = muted ? "rgba(18,32,42,.92)" : rgb(c.deep);
  const bodyTop = muted ? "rgba(154,174,182,.9)" : rgb(c.rim);
  const bodyMid = muted ? "rgba(116,138,148,.92)" : rgb(c.body);
  const bodyLow = muted ? "rgba(62,82,94,.95)" : rgb(c.edge);
  const stride = Math.max(0, Math.min(1, strideAmount));
  // Grounded quadruped stride bob (2 cycles per full 4-paw stride, never a slime hop).
  const bobY = Math.sin(stridePhase * 2) * 1.5 * stride;
  const headBobY = Math.sin(stridePhase * 2 - .45) * 1.2 * stride;
  const tailWag = Math.sin(stridePhase) * .16 * stride + (Number.isFinite(tailTilt) ? tailTilt * .5 : 0);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (direction === "SOUTH") {
    // === 5. SOUTH (FRONT-DOWN) 2.5D MOONWARDEN CAT ===
    // Forward footstep math: when lifted (sin > 0), paw swings forward/downward (-cos goes -1 -> +1)
    const lLift = Math.max(0, Math.sin(stridePhase)) * 4.2 * stride;
    const rLift = Math.max(0, Math.sin(stridePhase + Math.PI)) * 4.2 * stride;
    const lSwing = -Math.cos(stridePhase) * stride;
    const rSwing = -Math.cos(stridePhase + Math.PI) * stride;

    const coat = ctx.createLinearGradient(0, -28, 0, 26);
    coat.addColorStop(0, bodyTop);
    coat.addColorStop(.5, bodyMid);
    coat.addColorStop(1, bodyLow);

    // 1. Curled spiral tail rising behind the upper back
    if (!muted) {
      ctx.save();
      ctx.translate(2, -19 + bobY);
      ctx.rotate(tailWag * 1.1);
      ctx.fillStyle = bodyMid;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2.3;
      ctx.beginPath();
      ctx.moveTo(-4, 5);
      ctx.bezierCurveTo(-11, -10, -9, -28, 3, -30);
      ctx.bezierCurveTo(13, -31, 15, -19, 7, -14);
      ctx.bezierCurveTo(2, -11, -1, -16, 2, -21);
      ctx.bezierCurveTo(0, -10, 1, -2, 3, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ebfbff";
      ctx.beginPath();
      ctx.arc(-2, -18, .85, 0, Math.PI * 2);
      ctx.arc(4, -25, .8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 2. Far hind paws peeking out behind the flanks
    drawSteppingLeg(ctx, -14.5, 9 + bobY, -15.5, 22 - rLift + rSwing * 2.2, 8.8, bodyLow, stroke, false);
    drawSteppingLeg(ctx, 14.5, 9 + bobY, 15.5, 22 - lLift + lSwing * 2.2, 8.8, bodyLow, stroke, false);

    // 3. Plump front-perspective torso & chest
    ctx.fillStyle = coat;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    ctx.ellipse(0, 7 + bobY, 18.5, 13.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 4. Foreground front legs stepping alternately toward the camera (left-screen leg has runic bracer)
    drawSteppingLeg(ctx, -7.8, 11 + bobY, -8.2, 26.5 - lLift + lSwing * 3.0, 10.2, bodyMid, stroke, true, true, muted);
    drawSteppingLeg(ctx, 7.8, 11 + bobY, 8.2, 26.5 - rLift + rSwing * 3.0, 10.2, bodyMid, stroke, true, false, muted);

    // 5. Symmetrical front-facing sculpted feline head with large pointed ears
    ctx.save();
    ctx.translate(0, headBobY + 1.5);
    ctx.fillStyle = coat;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    ctx.moveTo(-17.5, -12);
    ctx.bezierCurveTo(-20.5, -22, -18, -31, -13, -35.5);
    ctx.bezierCurveTo(-8, -29.5, -4.5, -22, 0, -22);
    ctx.bezierCurveTo(4.5, -22, 8, -29.5, 13, -35.5);
    ctx.bezierCurveTo(18, -31, 20.5, -22, 17.5, -12);
    ctx.bezierCurveTo(24.0, -2, 21.0, 9.5, 0, 9.5);
    ctx.bezierCurveTo(-21.0, 9.5, -24.0, -2, -17.5, -12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (!muted) {
      ctx.fillStyle = rgba(c.deep, .62);
      ctx.beginPath();
      ctx.moveTo(-15, -14); ctx.lineTo(-12.5, -29.5); ctx.lineTo(-6.5, -18); ctx.closePath();
      ctx.moveTo(15, -14); ctx.lineTo(12.5, -29.5); ctx.lineTo(6.5, -18); ctx.closePath();
      ctx.fill();
    }

    // Symmetrical Moonwarden face on South head
    ctx.save();
    ctx.translate(0, 1.0);
    if (drawEyes) drawEyes(ctx);
    else drawMoonwardenFace(ctx, blink, muted, stroke, false);
    ctx.restore();

    if (holdingLantern && !muted) {
      ctx.strokeStyle = "#161124";
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(0, 6.5, 2.4, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#6ff7ff";
      ctx.beginPath(); ctx.roundRect(-3, 8.5, 6, 7.5, 1.5); ctx.fill(); ctx.stroke();
    }
    ctx.restore();

    // 6. Symmetrical Moonwarden Scarf & Centered Crescent Pendant hugging the chin
    if (!muted) {
      const scarfGrad = ctx.createLinearGradient(-20, 4, 20, 15);
      scarfGrad.addColorStop(0, "#72f0ff");
      scarfGrad.addColorStop(.5, "#6754d6");
      scarfGrad.addColorStop(1, "#72f0ff");
      ctx.fillStyle = scarfGrad;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(-15.5, 8.5 + bobY);
      ctx.quadraticCurveTo(-21.5, 5.5 + bobY, -19.5, .5 + bobY);
      ctx.quadraticCurveTo(-13.5, 8.5 + bobY, 0, 10.5 + bobY);
      ctx.quadraticCurveTo(13.5, 8.5 + bobY, 19.5, .5 + bobY);
      ctx.quadraticCurveTo(21.5, 5.5 + bobY, 15.5, 8.5 + bobY);
      ctx.quadraticCurveTo(8, 15.2 + bobY, 0, 15.2 + bobY);
      ctx.quadraticCurveTo(-8, 15.2 + bobY, -15.5, 8.5 + bobY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#9ef8ff";
      ctx.lineWidth = .95;
      ctx.beginPath();
      ctx.moveTo(-13.5, 9.8 + bobY); ctx.quadraticCurveTo(0, 14.0 + bobY, 13.5, 9.8 + bobY);
      ctx.stroke();

      ctx.fillStyle = "#1f193d";
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.arc(0, 14.2 + bobY, 4.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#aefbff";
      drawCrescentMoon(ctx, 0, 14.2 + bobY, 2.4);
    }
    ctx.restore();
    return;
  }

  if (direction === "NORTH") {
    // === 1. NORTH (BACK-DOWN) 2.5D MOONWARDEN CAT ===
    // Forward footstep math for walking UP (-y): when lifted (sin > 0), paw swings upward (-y)
    const lLift = Math.max(0, Math.sin(stridePhase)) * 4.2 * stride;
    const rLift = Math.max(0, Math.sin(stridePhase + Math.PI)) * 4.2 * stride;
    const lSwing = -Math.cos(stridePhase) * stride;
    const rSwing = -Math.cos(stridePhase + Math.PI) * stride;
    const coat = ctx.createLinearGradient(0, -34, 0, 26);
    coat.addColorStop(0, bodyTop);
    coat.addColorStop(.5, bodyMid);
    coat.addColorStop(1, bodyLow);

    // 1. Far front paws peeking out at the upper flanks + foreground hind legs stepping under the rump
    drawSteppingLeg(ctx, -15, 7 + bobY, -15.5, 19.5 - rLift - rSwing * 2.2, 8.2, bodyLow, stroke, false);
    drawSteppingLeg(ctx, 15, 7 + bobY, 15.5, 19.5 - lLift - lSwing * 2.2, 8.2, bodyLow, stroke, false);
    drawSteppingLeg(ctx, -8.5, 12 + bobY, -9, 26.5 - lLift - lSwing * 2.8, 10.0, bodyMid, stroke, false);
    drawSteppingLeg(ctx, 8.5, 12 + bobY, 9, 26.5 - rLift - rSwing * 2.8, 10.0, bodyMid, stroke, false);

    // 2. Unified back-of-head, ears, neck, and plump rump silhouette
    ctx.fillStyle = coat;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    ctx.moveTo(-14.5, -11 + headBobY);
    ctx.bezierCurveTo(-18, -21 + headBobY, -16, -31 + headBobY, -11, -36 + headBobY);
    ctx.bezierCurveTo(-6, -30 + headBobY, -3, -24 + headBobY, 0, -24 + headBobY);
    ctx.bezierCurveTo(3, -24 + headBobY, 6, -30 + headBobY, 11, -36 + headBobY);
    ctx.bezierCurveTo(16, -31 + headBobY, 18, -21 + headBobY, 14.5, -11 + headBobY);
    ctx.bezierCurveTo(20.5, -2 + bobY, 19.5, 18 + bobY, 0, 19 + bobY);
    ctx.bezierCurveTo(-19.5, 18 + bobY, -20.5, -2 + bobY, -14.5, -11 + headBobY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 3. Symmetrical Starry Moonwarden Shawl hugging the upper shoulders + S-Curved Spiral Tail + "x" mark
    if (!muted) {
      const scarfGrad = ctx.createLinearGradient(-19, -11, 19, 3);
      scarfGrad.addColorStop(0, "#72f4ff");
      scarfGrad.addColorStop(.5, "#5c46c9");
      scarfGrad.addColorStop(1, "#72f4ff");
      ctx.fillStyle = scarfGrad;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(-14.5, -10.5 + bobY);
      ctx.bezierCurveTo(-18.5, -7.5 + bobY, -20.5, -2 + bobY, -19.0, 2.0 + bobY);
      ctx.bezierCurveTo(-14.5, 2.0 + bobY, -11.5, -1.5 + bobY, -8.5, -4.0 + bobY);
      ctx.quadraticCurveTo(0, -1.5 + bobY, 8.5, -4.0 + bobY);
      ctx.bezierCurveTo(11.5, -1.5 + bobY, 14.5, 2.0 + bobY, 19.0, 2.0 + bobY);
      ctx.bezierCurveTo(20.5, -2 + bobY, 18.5, -7.5 + bobY, 14.5, -10.5 + bobY);
      ctx.quadraticCurveTo(0, -6.5 + bobY, -14.5, -10.5 + bobY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#98f6ff";
      ctx.lineWidth = .95;
      ctx.beginPath();
      ctx.moveTo(-17.0, .5 + bobY); ctx.quadraticCurveTo(0, -4.2 + bobY, 17.0, .5 + bobY);
      ctx.stroke();

      // Star specks on back
      ctx.fillStyle = "rgba(232,250,255,.85)";
      ctx.beginPath();
      ctx.arc(-9, 3 + bobY, .75, 0, Math.PI * 2);
      ctx.arc(10, 2 + bobY, .7, 0, Math.PI * 2);
      ctx.arc(-6, 9 + bobY, .65, 0, Math.PI * 2);
      ctx.arc(8, 8 + bobY, .65, 0, Math.PI * 2);
      ctx.fill();

      // Cute "x" mark below the tail base
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-1.8, 10.5 + bobY); ctx.lineTo(1.8, 14.0 + bobY);
      ctx.moveTo(1.8, 10.5 + bobY); ctx.lineTo(-1.8, 14.0 + bobY);
      ctx.stroke();

      // Upright S-Curved Spiral Tail centered on rump
      ctx.save();
      ctx.translate(0, 6 + bobY);
      ctx.rotate(tailWag * 1.2);
      ctx.fillStyle = bodyMid;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2.3;
      ctx.beginPath();
      ctx.moveTo(-3.2, 2);
      ctx.bezierCurveTo(-5, -12, -3, -32, 3.5, -39);
      ctx.bezierCurveTo(10, -43, 12, -33, 6, -28);
      ctx.bezierCurveTo(2, -25, 0, -29, 2.5, -32);
      ctx.bezierCurveTo(2, -20, 2.8, -8, 3.2, 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ebfbff";
      ctx.beginPath();
      ctx.arc(0, -18, .85, 0, Math.PI * 2);
      ctx.arc(3.5, -34, .8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    return;
  }

  // === 6 SIDE & DIAGONAL DIRECTIONS: EAST, WEST, SE, SW, NE, NW ===
  const flipLeft = direction === "WEST" || direction === "SW" || direction === "NW";
  const isUpDiagonal = direction === "NE" || direction === "NW";
  const isDownDiagonal = direction === "SE" || direction === "SW";
  if (flipLeft) ctx.scale(-1, 1);

  // Quadruped 4-beat diagonal gait phases
  const pNearFore = stridePhase;
  const pFarHind = stridePhase + .35;
  const pFarFore = stridePhase + Math.PI;
  const pNearHind = stridePhase + Math.PI + .35;

  // Forward footstep math: when paw is in the air (sin(p) > 0), swing (-cos(p)) moves FORWARD (-1 -> +1)!
  // When paw is on the ground (sin(p) <= 0), lift is 0 and swing (-cos(p)) pushes BACKWARD (+1 -> -1)!
  const lift = (p: number, amp: number) => Math.max(0, Math.sin(p)) * amp * stride;
  const swing = (p: number, amp: number) => -Math.cos(p) * amp * stride;

  const coat = ctx.createLinearGradient(-26, -32, 20, 28);
  coat.addColorStop(0, bodyTop);
  coat.addColorStop(.48, bodyMid);
  coat.addColorStop(1, bodyLow);

  // Subtle starlight wisp near the stepping hind paw
  drawPawStarlightWisps(ctx, -22, 24, stridePhase, muted);

  if (isUpDiagonal) {
    // === 2. NE / 8. NW (45° BACK-DIAGONAL 3/4 VIEW) ===
    // 1. Far hind leg under the inner rump
    drawSteppingLeg(ctx, -10.5, 11 + bobY, -9.5 + swing(pFarHind, 5.8), 25.0 - lift(pFarHind, 4.2), 8.8, bodyLow, stroke, false);

    // 2. Sleek arched feline back & rump + 3/4 rear head angled 45° up-right
    ctx.save();
    ctx.translate(0, bobY);
    ctx.fillStyle = coat;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    ctx.moveTo(-7, -11);
    ctx.bezierCurveTo(-9, -21, -6.5, -29, -2, -34.5);
    ctx.bezierCurveTo(2.5, -29, 6.5, -22, 13.5, -22);
    ctx.bezierCurveTo(17.5, -28, 20.5, -31.5, 23, -34);
    ctx.bezierCurveTo(27.5, -21, 28.5, -3, 16, 5);
    ctx.bezierCurveTo(8, 12, -4, 15, -16, 15);
    ctx.bezierCurveTo(-29, 15, -35, 7, -33.5, -3);
    ctx.bezierCurveTo(-32, -13, -19, -13, -7, -11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Starry specks on the upper rump
    if (!muted) {
      ctx.fillStyle = "rgba(232,250,255,.88)";
      ctx.beginPath();
      ctx.arc(-22, -4, .85, 0, Math.PI * 2);
      ctx.arc(-16, -7, .7, 0, Math.PI * 2);
      ctx.arc(-26, 1, .75, 0, Math.PI * 2);
      ctx.arc(-18, 0, .65, 0, Math.PI * 2);
      ctx.arc(-21, 4, .6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 3. Sculpted Near Hind Haunch & Near Right Foreleg (with Runic Bracer) under the shoulder
    drawHindHaunchLeg(ctx, -23.5, 8.5 + bobY, -23.5 + swing(pNearHind, 6.8), 24.8 - lift(pNearHind, 4.6), bodyMid, stroke);
    drawSteppingLeg(ctx, 11.5, 6.5 + bobY, 13.0 + swing(pNearFore, 6.8), 20.5 - lift(pNearFore, 4.6), 10.0, bodyMid, stroke, true, true, muted);

    // 4. 3/4 Back-Diagonal Draped Celestial Shawl / Scarf Mantle wrapping the neck & shoulder
    if (!muted) {
      const scarfGrad = ctx.createLinearGradient(-18, -14, 18, 10);
      scarfGrad.addColorStop(0, "#72f4ff");
      scarfGrad.addColorStop(.5, "#7b5fe0");
      scarfGrad.addColorStop(1, "#331f6b");
      ctx.fillStyle = scarfGrad;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.moveTo(-6, -11.5 + bobY);
      ctx.bezierCurveTo(-14, -14.5 + bobY, -19, -11.5 + bobY, -16.5, -6.0 + bobY);
      ctx.bezierCurveTo(-14.5, -3.5 + bobY, -17.5, .5 + bobY, -12.5, 3.5 + bobY);
      ctx.bezierCurveTo(-6.5, 6.0 + bobY, 1.5, 4.5 + bobY, 7.5, 4.5 + bobY);
      ctx.quadraticCurveTo(13.5, 6.5 + bobY, 17.5, 8.5 + bobY);
      ctx.quadraticCurveTo(19.5, 4.5 + bobY, 16.5, -.5 + bobY);
      ctx.quadraticCurveTo(6.5, -8.5 + bobY, -6, -11.5 + bobY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = "#98f6ff";
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(-12.5, 1.0 + bobY);
      ctx.quadraticCurveTo(2.5, .5 + bobY, 15.0, 5.8 + bobY);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(-11.5, -6.5 + bobY, .75, 0, Math.PI * 2);
      ctx.arc(-8.5, -.5 + bobY, .7, 0, Math.PI * 2);
      ctx.arc(4.5, -.5 + bobY, .65, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5. Curled Spiral Tail + cute "x" mark on the lower-left rump
    drawCurledStarTail(ctx, -25, -2 + bobY, tailWag, c, stroke, muted);
    if (!muted) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-29, 4 + bobY); ctx.lineTo(-25.5, 7.5 + bobY);
      ctx.moveTo(-25.5, 4 + bobY); ctx.lineTo(-29, 7.5 + bobY);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (isDownDiagonal) {
    // === 4. SE / 6. SW (45° FRONT-DIAGONAL 3/4 VIEW & WALK FRAMES 1-4) ===
    // 1. Far legs on downward-right diagonal plane
    drawSteppingLeg(ctx, -11.5, 8.0 + bobY, -10.5 + swing(pFarHind, 6.2), 21.0 - lift(pFarHind, 4.0), 8.6, bodyLow, stroke, false);
    drawSteppingLeg(ctx, 14.5, 9.5 + bobY, 15.8 + swing(pFarFore, 6.8), 24.0 - lift(pFarFore, 4.2), 9.0, bodyLow, stroke, false);

    // 2. Curled Spiral Star Tail rising from the upper-left rump
    drawCurledStarTail(ctx, -25.5, -3.5 + bobY, tailWag + .06, c, stroke, muted);

    // 3. Sleek arched feline torso & rump angled downward-right
    ctx.save();
    ctx.translate(-12.5, 1 + bobY);
    ctx.rotate(.11 + Math.sin(stridePhase) * .025 * stride);
    ctx.fillStyle = coat;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    ctx.moveTo(-4, -13);
    ctx.bezierCurveTo(8, -14, 19, -9, 21, 2);
    ctx.bezierCurveTo(21, 11, 10, 13.5, -4, 13);
    ctx.bezierCurveTo(-18, 12.5, -25, 7, -24, -3);
    ctx.bezierCurveTo(-23, -12, -14, -14, -4, -13);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (!muted) {
      ctx.fillStyle = "rgba(232,250,255,.88)";
      ctx.beginPath();
      ctx.arc(-14, -7, .85, 0, Math.PI * 2);
      ctx.arc(-9, -9.5, .65, 0, Math.PI * 2);
      ctx.arc(-18, -3, .75, 0, Math.PI * 2);
      ctx.arc(-11, -3.5, .65, 0, Math.PI * 2);
      ctx.arc(-15, 1, .6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 4. Sculpted Near Hind Haunch & Near Foreleg (with Wide Runic Bracer)
    drawHindHaunchLeg(ctx, -23.5, 5.5 + bobY, -23.5 + swing(pNearHind, 7.0), 23.0 - lift(pNearHind, 4.6), bodyMid, stroke);
    drawSteppingLeg(ctx, 4.2, 10.5 + bobY, 5.0 + swing(pNearFore, 7.4), 26.8 - lift(pNearFore, 5.0), 10.2, bodyMid, stroke, true, true, muted);

    // 5. Sculpted 3/4 Front-Diagonal Feline Head with large pointed ears & Almond Golden Eyes
    ctx.save();
    ctx.translate(1.5, 1.5 + headBobY);
    ctx.fillStyle = coat;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    // Smooth pear/apple-shaped feline cheeks flowing seamlessly into large pointed cat ears
    ctx.moveTo(-8.5, -10.5);
    ctx.bezierCurveTo(-10.0, -20.5, -7.5, -29.5, -3.0, -34.5);
    ctx.bezierCurveTo(2.0, -28.5, 5.5, -21.0, 14.0, -21.0);
    ctx.bezierCurveTo(18.0, -27.0, 21.0, -31.0, 24.0, -33.5);
    ctx.bezierCurveTo(28.5, -21.0, 31.5, -1.0, 19.5, 9.0);
    ctx.bezierCurveTo(11.0, 12.5, -1.5, 11.5, -7.5, 4.0);
    ctx.bezierCurveTo(-11.0, -.5, -10.0, -6.5, -8.5, -10.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Recessed dark inner-ear triangles on both ears
    if (!muted) {
      ctx.fillStyle = rgba(c.deep, .62);
      ctx.beginPath();
      ctx.moveTo(16.5, -18.5); ctx.lineTo(22.2, -28.5); ctx.lineTo(24.2, -16.0); ctx.closePath();
      ctx.moveTo(-6.2, -15.5); ctx.lineTo(-2.8, -29.5); ctx.lineTo(2.0, -19.0); ctx.closePath();
      ctx.fill();
    }

    // Moonwarden 3/4 Face (Almond golden-amber eyes, vertical pupils, forehead crescent, tiny pink nose & 'ㅅ' mouth)
    if (drawEyes) {
      ctx.save();
      ctx.translate(0, 1);
      drawEyes(ctx);
      ctx.restore();
    } else {
      drawMoonwardenFace(ctx, blink, muted, stroke, true);
    }

    if (holdingLantern && !muted) {
      ctx.strokeStyle = "#161124";
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(13, 4.5, 2.4, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#6ff7ff";
      ctx.beginPath(); ctx.roundRect(10, 6.5, 6, 7.5, 1.5); ctx.fill(); ctx.stroke();
    }
    ctx.restore();

    // 6. Wide Draped Celestial Moonwarden Shawl / Scarf Mantle hugging the left cheek & chin
    drawMoonScarfSide(ctx, bobY + .8, stroke, muted, 11.5, 12.4, -.5);
    ctx.restore();
    return;
  }

  // === 3. EAST / 7. WEST (PURE HORIZONTAL SIDE PROFILE VIEW) ===
  // 1. Far legs stepping along a level horizontal ground plane
  drawSteppingLeg(ctx, -12.5, 9 + bobY, -11.5 + swing(pFarHind, 6.6), 22.5 - lift(pFarHind, 4.0), 8.6, bodyLow, stroke, false);
  drawSteppingLeg(ctx, 14.5, 9 + bobY, 15.8 + swing(pFarFore, 6.8), 22.8 - lift(pFarFore, 4.2), 8.8, bodyLow, stroke, false);

  // 2. Curled Spiral Star Tail extending from the back-left rump
  drawCurledStarTail(ctx, -26.5, -2.5 + bobY, tailWag - .05, c, stroke, muted);

  // 3. Sleek horizontal 2.5D cat torso + starry back specks
  ctx.save();
  ctx.translate(-13, 1.5 + bobY);
  ctx.rotate(Math.sin(stridePhase) * .02 * stride);
  ctx.fillStyle = coat;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2.3;
  ctx.beginPath();
  ctx.moveTo(-4, -13);
  ctx.bezierCurveTo(8, -14, 19, -9, 21, 2);
  ctx.bezierCurveTo(21, 11, 10, 13.5, -4, 13);
  ctx.bezierCurveTo(-18, 12.5, -25, 7, -24, -3);
  ctx.bezierCurveTo(-23, -12, -14, -14, -4, -13);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (!muted) {
    ctx.fillStyle = "rgba(232,250,255,.88)";
    ctx.beginPath();
    ctx.arc(-14, -7, .85, 0, Math.PI * 2);
    ctx.arc(-9, -9.5, .65, 0, Math.PI * 2);
    ctx.arc(-18, -3, .75, 0, Math.PI * 2);
    ctx.arc(-11, -3.5, .65, 0, Math.PI * 2);
    ctx.arc(-15, 1, .6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 4. Sculpted Near Hind Haunch & Near Foreleg (with Runic Bracer) on level horizontal ground line
  drawHindHaunchLeg(ctx, -24.5, 7.5 + bobY, -24.5 + swing(pNearHind, 7.2), 25.0 - lift(pNearHind, 4.8), bodyMid, stroke);
  drawSteppingLeg(ctx, 5.2, 9.0 + bobY, 6.2 + swing(pNearFore, 7.6), 25.5 - lift(pNearFore, 5.0), 10.2, bodyMid, stroke, true, true, muted);

  // 5. True Side-Profile Cat Head facing horizontally right/left (matches "3. East" & "7. West" on Moonwarden sheet)
  ctx.save();
  ctx.translate(3.5, -1.5 + headBobY);
  ctx.fillStyle = coat;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2.3;
  ctx.beginPath();
  ctx.moveTo(-7.5, -9.5);
  ctx.bezierCurveTo(-9.0, -19.5, -5.0, -28.0, 1.0, -34.0);
  ctx.bezierCurveTo(5.5, -28.5, 8.5, -22.5, 11.5, -21.5);
  ctx.bezierCurveTo(14.5, -26.5, 17.5, -30.5, 20.5, -33.0);
  ctx.bezierCurveTo(24.0, -24.5, 24.5, -17.5, 23.5, -13.5);
  ctx.bezierCurveTo(31.0, -8.5, 33.5, .5, 29.5, 6.0);
  ctx.bezierCurveTo(24.5, 10.5, 11.0, 11.5, -3.5, 5.5);
  ctx.bezierCurveTo(-8.0, 1.5, -8.5, -4.5, -7.5, -9.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Inner ear shading + foreshortened Forehead Crescent Moon mark on side profile
  if (!muted) {
    ctx.fillStyle = rgba(c.deep, .62);
    ctx.beginPath();
    ctx.moveTo(13.5, -20.5); ctx.lineTo(19.2, -29.0); ctx.lineTo(21.2, -18.5); ctx.closePath();
    ctx.moveTo(-4.5, -15.5); ctx.lineTo(.5, -28.5); ctx.lineTo(5.5, -18.5); ctx.closePath();
    ctx.fill();

    // Side-profile glowing Forehead Crescent Moon mark
    ctx.fillStyle = "rgba(122, 228, 255, .28)";
    ctx.beginPath();
    ctx.arc(22.2, -9.2, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f0fcff";
    drawCrescentMoon(ctx, 22.2, -9.2, 2.5);
  }

  // Single side-profile almond golden-amber cat eye + clean feline muzzle
  if (blink) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(14.5, .8);
    ctx.quadraticCurveTo(19.0, 2.3, 23.5, .8);
    ctx.stroke();
  } else if (muted) {
    ctx.fillStyle = "rgba(173,187,190,.3)";
    ctx.beginPath();
    ctx.ellipse(19.0, .8, 4.2, 4.5, -.06, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const eyeGrad = ctx.createLinearGradient(19.0, -4.2, 19.0, 5.2);
    eyeGrad.addColorStop(0, "#d96b12");
    eyeGrad.addColorStop(.48, "#f5a824");
    eyeGrad.addColorStop(1, "#ffe86e");
    ctx.fillStyle = eyeGrad;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.65;
    ctx.beginPath();
    ctx.moveTo(14.2, 1.0);
    ctx.bezierCurveTo(15.6, -4.4, 22.2, -4.4, 23.6, .4);
    ctx.bezierCurveTo(22.5, 5.2, 16.0, 5.2, 14.2, 1.0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Upper lash arch
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.moveTo(14.0, .9);
    ctx.bezierCurveTo(15.6, -4.5, 22.2, -4.5, 23.8, .3);
    ctx.stroke();
    // Pointed vertical feline pupil
    ctx.fillStyle = "#160f24";
    ctx.beginPath();
    ctx.moveTo(20.2, -2.2);
    ctx.quadraticCurveTo(21.9, .8, 20.2, 3.8);
    ctx.quadraticCurveTo(18.5, .8, 20.2, -2.2);
    ctx.closePath();
    ctx.fill();
    // White eye catchlight glint
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(18.7, -.7, 1.15, 0, Math.PI * 2);
    ctx.fill();
    // Subtle side-profile mouth tuck
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.moveTo(29.8, 3.8);
    ctx.quadraticCurveTo(27.2, 5.2, 25.2, 4.2);
    ctx.stroke();
  }

  if (holdingLantern && !muted) {
    ctx.strokeStyle = "#161124";
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(26, 6.5, 2.4, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#6ff7ff";
    ctx.beginPath(); ctx.roundRect(23, 8.5, 6, 7.5, 1.5); ctx.fill(); ctx.stroke();
  }
  ctx.restore();

  // 6. Wide Draped Celestial Moonwarden Shawl & Crescent Clasp wrapping the neck in side profile
  drawMoonScarfSide(ctx, bobY - 1.0, stroke, muted, 14.5, 11.2, 1.0);
  ctx.restore();
}
