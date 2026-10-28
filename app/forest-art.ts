import type { SanctuaryObstacle, WorldPoint } from "../server/sanctuary-map";
import { drawForestAsset, forestSpritesReady } from "./forest-sprites";

/** Palette shared by ground, canopy and shrine matter; light stays readable. */
export const FOREST_PALETTE = Object.freeze({
  floorLight: "#577e81", floorMid: "#3f606b", floorShade: "#304957",
  moon: "#d8e4f5", amber: "#5ef2ff", leafLight: "#4bc8e8",
  leafMid: "#295f98", leafShade: "#16254d", stone: "#8390a8",
});

function randomBrush(seed: number) {
  let state = seed || 1;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
function variantFor(id: string) {
  let seed = 7;
  for (const char of id) seed = (Math.imul(seed, 31) + char.charCodeAt(0)) >>> 0;
  return seed % 4;
}
function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string | CanvasGradient, rotation = 0) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2); ctx.fill();
}
function stonePath(ctx: CanvasRenderingContext2D, radius: number, height: number, variant: number) {
  ctx.beginPath(); ctx.moveTo(-radius * .7, 5); ctx.lineTo(-radius * .86, -height * .47);
  ctx.lineTo(-radius * .5, -height * .88); ctx.lineTo(radius * (.08 + variant * .06), -height);
  ctx.lineTo(radius * .62, -height * .85); ctx.lineTo(radius * .8, -height * .31);
  ctx.lineTo(radius * .75, 5); ctx.quadraticCurveTo(0, 12, -radius * .7, 5); ctx.closePath();
}

/** Paint a bioluminescent mushroom cap with glowing cyan gills and speckled spots. */
function mushroomCap(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, random: () => number, shaggy: boolean) {
  ctx.save(); ctx.translate(cx, cy);
  // Glowing cyan-teal underside gills visible beneath the 2.5D angled cap rim.
  const gills = ctx.createRadialGradient(0, ry * .32, rx * .08, 0, ry * .28, rx * .92);
  gills.addColorStop(0, "#66fcff"); gills.addColorStop(.52, "#1ca8db"); gills.addColorStop(1, "#112858");
  ellipse(ctx, 0, ry * .26, rx * .88, ry * .42, gills);
  ctx.strokeStyle = "#88ffff88"; ctx.lineWidth = 1;
  for (let i = -7; i <= 7; i++) {
    const gx = (i / 8) * rx * .82;
    ctx.beginPath(); ctx.moveTo(gx * .22, ry * .35); ctx.quadraticCurveTo(gx * .65, ry * .18, gx, ry * .32); ctx.stroke();
  }
  // Domed indigo-cobalt mushroom umbrella cap with crisp scalloped rim.
  const cap = ctx.createLinearGradient(-rx * .5, -ry, rx * .5, ry * .45);
  cap.addColorStop(0, shaggy ? "#2e7ab8" : "#2264bd");
  cap.addColorStop(.48, shaggy ? "#1b467d" : "#1a357a");
  cap.addColorStop(1, "#0e1942");
  ctx.fillStyle = cap; ctx.strokeStyle = "#09112e"; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-rx, ry * .18);
  ctx.bezierCurveTo(-rx * 1.04, -ry * .58, -rx * .48, -ry * 1.05, 0, -ry);
  ctx.bezierCurveTo(rx * .48, -ry * 1.05, rx * 1.04, -ry * .58, rx, ry * .18);
  ctx.bezierCurveTo(rx * .55, ry * .02, -rx * .55, ry * .02, -rx, ry * .18);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Glowing cyan rim highlight and bioluminescent cap spots.
  ctx.strokeStyle = "#4ef6ff99"; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-rx * .92, ry * .14); ctx.quadraticCurveTo(0, -ry * .04, rx * .92, ry * .14); ctx.stroke();
  ctx.save(); ctx.clip();
  for (let i = 0; i < 18; i++) {
    const sx = (random() * 1.6 - .8) * rx, sy = -ry * (.12 + random() * .76);
    const sr = 2.2 + random() * (rx * .09);
    ellipse(ctx, sx, sy, sr * 1.35, sr * .78, i % 3 === 0 ? "#7affffdd" : "#29c5ffaa", (random() - .5) * .6);
  }
  ctx.restore();
  ctx.restore();
}

/** Paint a glowing cyan fern frond at the base of an obstacle. */
function cyanFern(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, length: number) {
  ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
  ctx.strokeStyle = "#3df5ff"; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(length * .5, -length * .45, length, -length * .65); ctx.stroke();
  for (let leaf = 1; leaf <= 4; leaf++) {
    const t = leaf / 5, lx = length * t, ly = -length * .55 * t;
    ellipse(ctx, lx, ly - 2.2, 3.2, 1.2, "#5cfaffcc", -.6);
    ellipse(ctx, lx, ly + 1.8, 3.2, 1.2, "#28b8e8cc", .5);
  }
  ctx.restore();
}

type Sprite = { base: HTMLCanvasElement; crown: HTMLCanvasElement; width: number; height: number; anchorX: number; anchorY: number };
const sprites = new Map<string, Sprite>();
const SPRITE_LIMIT = 32;

function paintObstacle(obs: SanctuaryObstacle, variant: number): Sprite {
  const width = Math.ceil(obs.canopyRadius * 2 + 44), height = Math.ceil(obs.canopyHeight + 64);
  const anchorX = width / 2, anchorY = height - 34;
  const layer = () => {
    const canvas = document.createElement("canvas"); canvas.width = width * 2; canvas.height = height * 2;
    const ctx = canvas.getContext("2d")!; ctx.scale(2, 2); ctx.translate(anchorX, anchorY); ctx.lineCap = "round";
    return { canvas, ctx };
  };
  const base = layer(), crown = layer(), random = randomBrush(91 + variant * 739);
  const ctx = base.ctx, r = obs.r, h = obs.canopyHeight;
  const shadow = ctx.createRadialGradient(4, 6, 2, 4, 6, r * 1.85);
  shadow.addColorStop(0, "#0b132b88"); shadow.addColorStop(1, "#0b132b00");
  ellipse(ctx, 4, 7, r * 1.85, r * .72, shadow);
  const paintedTree = obs.kind === "ANCIENT_TREE" || obs.kind === "WEEPING_WILLOW";
  if (forestSpritesReady() && (paintedTree || obs.kind === "MOSS_PILLAR")) {
    const asset = obs.kind === "WEEPING_WILLOW" ? 2 : obs.kind === "MOSS_PILLAR" ? 3 : variant % 2;
    // Keep a grounded trunk footprint even when the overhead artwork fades.
    ellipse(ctx, 0, 3, r, r * .58, "#182746");
    const maxWidth = obs.canopyRadius * 2, maxHeight = h;
    drawForestAsset(ctx, asset, 0, 8, maxWidth, maxHeight, "base");
    drawForestAsset(crown.ctx, asset, 0, 8, maxWidth, maxHeight, "crown");
    drawForestAsset(ctx, 6, -r * .65, 8, r * 1.1, 15);
    return { base: base.canvas, crown: crown.canvas, width, height, anchorX, anchorY };
  }
  // Dark midnight-indigo mossy turf & Tiny Spore Clusters matching the exact collider foot.
  ellipse(ctx, 0, 3, r, r * .58, "#141d3b");
  for (let i = 0; i < 14; i++) {
    const a = random() * Math.PI * 2, distance = Math.sqrt(random()) * r * .88;
    ellipse(ctx, Math.cos(a) * distance, 3 + Math.sin(a) * distance * .5, 2.8 + random() * 2.2, 1.4, i % 2 ? "#1e3a5f99" : "#0d1329aa", -.3);
  }
  // Tiny glowing cyan mini-mushrooms and spore dots around the base collider.
  for (const side of [-1, 1]) {
    const mx = side * r * .62, my = 4;
    ctx.strokeStyle = "#2d4373"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(mx, my + 2); ctx.lineTo(mx, my - 4); ctx.stroke();
    ellipse(ctx, mx, my - 5, 4.2, 2.4, "#3bf5ff");
    ellipse(ctx, mx - side * 5, my + 1, 1.6, 1.2, "#7affff");
  }

  const tree = obs.kind === "ANCIENT_TREE" || obs.kind === "WEEPING_WILLOW";
  const upper = crown.ctx;
  if (tree) {
    const shaggy = obs.kind === "WEEPING_WILLOW";
    // Ribbed dark violet-indigo mushroom stalk (or mossy shaggy trunk) rooted at the collider.
    const stalk = ctx.createLinearGradient(-r, -h * .55, r * .8, 6);
    stalk.addColorStop(0, shaggy ? "#2b4f60" : "#37336b");
    stalk.addColorStop(.45, shaggy ? "#1e334d" : "#231e4a");
    stalk.addColorStop(1, "#110e29");
    ctx.strokeStyle = stalk; ctx.lineWidth = r * .68;
    ctx.beginPath(); ctx.moveTo(-r * .18, 6); ctx.quadraticCurveTo(2, -h * .24, -1, -h * .58); ctx.stroke();
    ctx.lineWidth = r * .36;
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * r * .72, 6); ctx.quadraticCurveTo(side * r * .22, -4, 0, -h * .38); ctx.stroke();
    }
    // Glowing cyan bioluminescent veins & bark ridges along the stalk.
    for (let i = 0; i < 12; i++) {
      const x = -6 + random() * 12, y = -h * .52 + random() * h * .44;
      ctx.strokeStyle = i % 3 === 0 ? "#4df8ff99" : "#120d2688"; ctx.lineWidth = .9 + random() * .7;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 1.5, y + 5, x + .5, y + 10); ctx.stroke();
    }
    // Shelf fungi climbing the Ancient Shaggy Giant trunk.
    for (const [sx, sy, srx] of [[-r * .42, -14, 7], [r * .45, -22, 6.5], [-r * .35, -31, 5.5]]) {
      ellipse(ctx, sx, sy, srx, 2.6, shaggy ? "#5a4b82" : "#364b85");
      ellipse(ctx, sx, sy - .8, srx * .7, 1.3, "#4df8ff88");
    }
    // Double-Cap Giant secondary mushroom sprouting off the side of Ancient Trees.
    if (!shaggy) {
      upper.strokeStyle = "#231e4a"; upper.lineWidth = r * .38;
      upper.beginPath(); upper.moveTo(r * .35, 2); upper.quadraticCurveTo(r * .78, -h * .18, r * .92, -h * .36); upper.stroke();
      mushroomCap(upper, r * .88, -h * .42, obs.canopyRadius * .46, h * .22, random, false);
    }
    // Towering Canopy Mushroom / Ancient Shaggy Giant overhead umbrella cap.
    mushroomCap(upper, -2, -h * .68, obs.canopyRadius * .94, h * .34, random, shaggy);
    if (shaggy) {
      // Hanging moss tendrils and glowing cyan spore droplets beneath the Ancient Shaggy Giant.
      for (let i = 0; i < 16; i++) {
        const x = -obs.canopyRadius * .68 + i * obs.canopyRadius * .09;
        const y = -h * (.52 + random() * .08), length = 14 + random() * 20;
        upper.strokeStyle = i % 2 ? "#2d6e7ec4" : "#1c3c5ca6"; upper.lineWidth = 1.2;
        upper.beginPath(); upper.moveTo(x, y); upper.quadraticCurveTo(x - 3, y + length * .6, x + 1, y + length); upper.stroke();
        ellipse(upper, x + 1, y + length, 1.8, 1.8, "#5efaffcc");
      }
    }
  } else if (obs.kind === "CRYSTAL_SPIRE") {
    cyanFern(upper, -r * .6, 2, -1, 18); cyanFern(upper, r * .6, 2, 1, 18);
    for (const [x, y, w, height] of [[-15, 0, 8, h * .48], [16, 1, 7, h * .42], [0, -2, 15, h * .88]]) {
      const mineral = upper.createLinearGradient(x - w, y - height, x + w, y);
      mineral.addColorStop(0, "#66f7ff"); mineral.addColorStop(.4, "#256db5"); mineral.addColorStop(1, "#162352");
      upper.fillStyle = mineral; upper.beginPath(); upper.moveTo(x - w, y); upper.lineTo(x - w * .68, y - height * .72);
      upper.lineTo(x + w * .14, y - height); upper.lineTo(x + w * .8, y - height * .62); upper.lineTo(x + w, y); upper.closePath(); upper.fill();
      upper.strokeStyle = "#9effffb3"; upper.lineWidth = 1;
      upper.beginPath(); upper.moveTo(x + w * .14, y - height); upper.lineTo(x - w * .14, y - height * .55); upper.lineTo(x + 2, y - 2); upper.stroke();
    }
    mushroomCap(upper, -12, -h * .28, 13, 8, random, false);
    mushroomCap(upper, 13, -h * .22, 11, 7, random, false);
  } else if (obs.kind === "MOSS_PILLAR") {
    // Clustered Forest Obstacles & Glow-Patch Shrubs: multi-stem bioluminescent mushroom cluster.
    cyanFern(upper, -r * .75, 2, -1, 22); cyanFern(upper, r * .75, 2, 1, 22);
    const stems: readonly (readonly [number, number, number, number])[] = [
      [-14, 2, -18, -h * .46], [13, 2, 17, -h * .38], [-4, 3, -2, -h * .76], [7, 4, 9, -h * .58],
    ];
    for (const [sx, sy, tx, ty] of stems) {
      upper.strokeStyle = "#222452"; upper.lineWidth = 6.5;
      upper.beginPath(); upper.moveTo(sx, sy); upper.quadraticCurveTo((sx + tx) * .5, (sy + ty) * .5, tx, ty); upper.stroke();
      upper.strokeStyle = "#3f5c94"; upper.lineWidth = 2.2;
      upper.beginPath(); upper.moveTo(sx - 1, sy); upper.quadraticCurveTo((sx + tx) * .5 - 1, (sy + ty) * .5, tx - 1, ty); upper.stroke();
    }
    mushroomCap(upper, -18, -h * .48, 16, 10, random, false);
    mushroomCap(upper, 17, -h * .40, 14, 9, random, true);
    mushroomCap(upper, 9, -h * .60, 16, 10, random, false);
    mushroomCap(upper, -2, -h * .78, 22, 13, random, false);
  } else {
    // Runed Monolith: mossy dark-indigo stone overgrown with Glow-Patch Shrubs & mini-mushrooms.
    const stone = upper.createLinearGradient(-r, -h, r, 4);
    stone.addColorStop(0, "#4f658f"); stone.addColorStop(.45, "#2b3b63"); stone.addColorStop(1, "#151d3b");
    stonePath(upper, r, h * .9, variant); upper.fillStyle = stone; upper.fill();
    upper.save(); upper.clip();
    for (let i = 0; i < 45; i++) {
      const x = (random() * 2 - 1) * r, y = -random() * h;
      ellipse(upper, x, y, 1.5 + random() * 3.5, .8 + random(), i % 3 === 0 ? "#4df8ff45" : "#0d142b55", -.4);
    }
    upper.restore();
    cyanFern(upper, -r * .65, 2, -1, 17); cyanFern(upper, r * .65, 2, 1, 17);
    mushroomCap(upper, -r * .52, -h * .32, 12, 7.5, random, false);
    mushroomCap(upper, r * .48, -h * .52, 10, 6.5, random, true);
  }
  drawForestAsset(ctx, 7, 0, 8, r * 2.2, 18);
  return { base: base.canvas, crown: crown.canvas, width, height, anchorX, anchorY };
}

/** Fade overhead art only; the visible collider foot always remains grounded. */
export function forestCanopyAlpha(obs: SanctuaryObstacle, viewer: WorldPoint) {
  return viewer.y < obs.y + 8 && Math.abs(viewer.x - obs.x) < obs.canopyRadius + 16 && viewer.y > obs.y - obs.canopyHeight - 16 ? .38 : 1;
}

/** Two cached blits per prop; texture complexity does not multiply frame work. */
export function drawForestObstacle(ctx: CanvasRenderingContext2D, obs: SanctuaryObstacle, time: number, viewer: WorldPoint, reducedMotion = false, crystalBlink = 0) {
  const variant = variantFor(obs.id);
  const key = `${forestSpritesReady() ? "painted" : "vector"}:${obs.kind}:${obs.r}:${obs.canopyRadius}:${obs.canopyHeight}:${variant}`;
  // Loads once; a new cache key replaces fallback props when ready.
  if (!forestSpritesReady()) drawForestAsset(ctx, -1, 0, 0, 1, 1);
  let sprite = sprites.get(key);
  if (!sprite) {
    sprite = paintObstacle(obs, variant);
    if (sprites.size >= SPRITE_LIMIT) sprites.delete(sprites.keys().next().value!);
    sprites.set(key, sprite);
  }
  const tree = obs.kind === "ANCIENT_TREE" || obs.kind === "WEEPING_WILLOW";
  const sway = tree && !reducedMotion ? Math.sin(time * .85 + variant * 1.7) * .8 : 0;
  ctx.save(); ctx.translate(obs.x, obs.y);
  ctx.drawImage(sprite.base, -sprite.anchorX, -sprite.anchorY, sprite.width, sprite.height);
  ctx.globalAlpha *= forestCanopyAlpha(obs, viewer);
  ctx.drawImage(sprite.crown, -sprite.anchorX + sway, -sprite.anchorY, sprite.width, sprite.height);
  if (obs.kind === "RUNED_MONOLITH") {
    ctx.strokeStyle = "#e0d6b7b3"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, -42, 6.5, .4, Math.PI * 1.7); ctx.moveTo(0, -32); ctx.lineTo(0, -19); ctx.stroke();
  }
  // Only existing Blackout rules supply this value; this art grants no vision.
  if (obs.kind === "CRYSTAL_SPIRE" && crystalBlink > 0) {
    const glow = ctx.createRadialGradient(0, -38, 1, 0, -38, 63);
    glow.addColorStop(0, `rgba(186,223,246,${crystalBlink * .5})`); glow.addColorStop(1, "#a7d5ef00");
    ctx.fillStyle = glow; ctx.fillRect(-63, -101, 126, 126);
  }
  ctx.restore();
}

/** Calm-only, short-lived surface reactions. No trails that expose concealed actors. */
export function drawGroundResponse(ctx: CanvasRenderingContext2D, x: number, y: number, speed: number, time: number, reducedMotion: boolean) {
  if (reducedMotion || speed < 55) return;
  const water = [[1060, 854, 74, 41], [1184, 896, 74, 34], [1610, 706, 55, 28]].some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y + 28 - cy) / ry) ** 2 < 1);
  ctx.save();
  const phase = (time * 2.2) % 1;
  if (water) {
    ctx.strokeStyle = `rgba(221,224,238,${(1 - phase) * .26})`; ctx.lineWidth = .9;
    ctx.beginPath(); ctx.ellipse(x, y + 30, 18 + phase * 22, 4 + phase * 7, 0, 0, Math.PI * 2); ctx.stroke();
  } else {
    ctx.strokeStyle = "#cad1b34d"; ctx.lineWidth = 1;
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(x + side * 25, y + 31); ctx.quadraticCurveTo(x + side * 30, y + 29, x + side * 32, y + 25 + Math.sin(time * 5) * 1.2); ctx.stroke();
    }
  }
  ctx.restore();
}
