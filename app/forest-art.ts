import type { SanctuaryObstacle, WorldPoint } from "../server/sanctuary-map";

/** Palette shared by ground, canopy and shrine matter; light stays readable. */
export const FOREST_PALETTE = Object.freeze({
  floorLight: "#9ca8a5", floorMid: "#82958d", floorShade: "#6e8387",
  moon: "#dcd8ed", amber: "#e3bf83", leafLight: "#a8b5a5",
  leafMid: "#697f72", leafShade: "#394f51", stone: "#9297a4",
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
function leafCluster(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, random: () => number, willow: boolean) {
  ctx.save(); ctx.translate(x, y);
  const light = ctx.createLinearGradient(-radius, -radius, radius * .6, radius);
  light.addColorStop(0, willow ? "#abb9ac" : "#a7af9b");
  light.addColorStop(.4, willow ? "#7f9b8e" : "#7e927b");
  light.addColorStop(1, FOREST_PALETTE.leafShade);
  ctx.fillStyle = light; ctx.beginPath();
  // Angular brush edges and small gaps give foliage an irregular silhouette.
  for (let i = 0; i <= 24; i++) {
    const angle = i / 24 * Math.PI * 2, r = radius * (.8 + random() * .2);
    const px = Math.cos(angle) * r, py = Math.sin(angle) * r * .64;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill(); ctx.save(); ctx.clip();
  for (let i = 0; i < 54; i++) {
    const px = (random() * 2 - 1) * radius, py = (random() * 2 - 1) * radius * .7;
    ctx.strokeStyle = ["#e2dccb39", "#bac8b335", "#283c452d", "#556a633d"][i % 4];
    ctx.lineWidth = 1 + random() * 2.4;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 3 + random() * 5, py - 1 - random() * 2); ctx.stroke();
  }
  ctx.restore(); ctx.restore();
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
  const shadow = ctx.createRadialGradient(4, 6, 2, 4, 6, r * 1.8);
  shadow.addColorStop(0, "#17232b66"); shadow.addColorStop(1, "#17232b00");
  ellipse(ctx, 4, 7, r * 1.8, r * .7, shadow);
  // The visible foot matches the existing collider; foliage is only overhead.
  ellipse(ctx, 0, 3, r, r * .56, "#4a625c");
  for (let i = 0; i < 16; i++) {
    const a = random() * Math.PI * 2, distance = Math.sqrt(random()) * r * .9;
    ellipse(ctx, Math.cos(a) * distance, 3 + Math.sin(a) * distance * .5, 2.5 + random() * 2, 1.2, i % 2 ? "#9caa8e66" : "#353e4666", -.3);
  }

  const tree = obs.kind === "ANCIENT_TREE" || obs.kind === "WEEPING_WILLOW";
  const upper = crown.ctx;
  if (tree) {
    const bark = ctx.createLinearGradient(-r, -h * .5, r * .7, 5);
    bark.addColorStop(0, "#a1988b"); bark.addColorStop(.38, "#776d68"); bark.addColorStop(1, "#3e4247");
    ctx.strokeStyle = bark; ctx.lineWidth = r * .58;
    ctx.beginPath(); ctx.moveTo(-r * .7, 6); ctx.quadraticCurveTo(3, -8, -2, -h * .6); ctx.stroke();
    ctx.lineWidth = r * .34;
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * r * .84, 6); ctx.quadraticCurveTo(side * 3, -4, -2, -h * .35);
      ctx.quadraticCurveTo(side * r * .6, -h * .57, side * r * 1.15, -h * .66); ctx.stroke();
    }
    // Broken silverwood grain and a small natural knot, not a heavy outline.
    for (let i = 0; i < 15; i++) {
      const x = -7 + random() * 13, y = -h * .54 + random() * h * .48;
      ctx.strokeStyle = i % 2 ? "#d4c6ae65" : "#292d354d"; ctx.lineWidth = .65 + random() * .7;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 2, y + 5, x - .5, y + 10); ctx.stroke();
    }
    ellipse(ctx, 2, -18, 3.8, 5.8, "#333c42", -.2);
    ctx.strokeStyle = "#c0ab874d"; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(2, -18, 5, 7, -.2, 0, Math.PI * 2); ctx.stroke();
    const willow = obs.kind === "WEEPING_WILLOW";
    const clusters = [[-.49, .52, .43], [.46, .54, .41], [-.24, .72, .48], [.26, .75, .44], [-.05, .86, .43], [0, .57, .51]];
    for (const [x, y, size] of clusters) leafCluster(upper, x * obs.canopyRadius, -y * h, size * obs.canopyRadius, random, willow);
    if (willow) {
      for (let i = 0; i < 17; i++) {
        const x = -obs.canopyRadius * .65 + i * obs.canopyRadius * .08;
        const y = -h * (.49 + random() * .13), length = 16 + random() * 22;
        upper.strokeStyle = i % 2 ? "#8caa956e" : "#4c6a67a6"; upper.lineWidth = 1.1;
        upper.beginPath(); upper.moveTo(x, y); upper.quadraticCurveTo(x - 4, y + length * .6, x + 1, y + length); upper.stroke();
        for (let leaf = 0; leaf < 4; leaf++) ellipse(upper, x + (leaf % 2 ? 2 : -2), y + leaf * length / 4, 3, 1, "#a2b8a58c", -.7);
      }
    }
  } else if (obs.kind === "CRYSTAL_SPIRE") {
    for (const [x, y, w, height] of [[-15, 0, 8, h * .48], [16, 1, 7, h * .42], [0, -2, 15, h * .88]]) {
      const mineral = upper.createLinearGradient(x - w, y - height, x + w, y);
      mineral.addColorStop(0, "#b5c5d2"); mineral.addColorStop(.34, "#8196ac"); mineral.addColorStop(1, "#434e68");
      upper.fillStyle = mineral; upper.beginPath(); upper.moveTo(x - w, y); upper.lineTo(x - w * .68, y - height * .72);
      upper.lineTo(x + w * .14, y - height); upper.lineTo(x + w * .8, y - height * .62); upper.lineTo(x + w, y); upper.closePath(); upper.fill();
      upper.strokeStyle = "#e1dceb80"; upper.lineWidth = .9;
      upper.beginPath(); upper.moveTo(x + w * .14, y - height); upper.lineTo(x - w * .14, y - height * .55); upper.lineTo(x + 2, y - 2); upper.stroke();
      upper.strokeStyle = "#34415366"; upper.beginPath(); upper.moveTo(x - w * .65, y - height * .68); upper.lineTo(x + w * .8, y - height * .62); upper.stroke();
    }
  } else {
    const stone = upper.createLinearGradient(-r, -h, r, 4);
    stone.addColorStop(0, "#beb7bd"); stone.addColorStop(.4, FOREST_PALETTE.stone); stone.addColorStop(1, "#505967");
    stonePath(upper, r, h * .9, variant); upper.fillStyle = stone; upper.fill();
    upper.save(); upper.clip();
    for (let i = 0; i < 70; i++) {
      const x = (random() * 2 - 1) * r, y = -random() * h;
      ellipse(upper, x, y, 1 + random() * 4, .5 + random(), i % 2 ? "#e3daca30" : "#343f5326", -.4);
    }
    upper.restore();
    upper.strokeStyle = "#3d465a80"; upper.lineWidth = .8;
    upper.beginPath(); upper.moveTo(-4, -h * .8); upper.lineTo(1, -h * .63); upper.lineTo(-5, -h * .51); upper.lineTo(1, -h * .42); upper.stroke();
    // Uneven moss shoulders and climbing ivy stop the stone reading as plastic.
    for (let i = 0; i < 9; i++) ellipse(upper, -r * .55 + random() * r, -h * .77 + random() * 8, 3 + random() * 3, 1.8, "#89977f96", -.3);
    if (obs.kind === "MOSS_PILLAR") {
      upper.strokeStyle = "#566e58"; upper.lineWidth = 1.6; upper.beginPath(); upper.moveTo(-r * .5, 3);
      upper.bezierCurveTo(r, -h * .3, -r, -h * .48, r * .4, -h * .68); upper.stroke();
      for (let i = 0; i < 8; i++) ellipse(upper, Math.sin(i * 1.4) * r * .5, -8 - i * h * .07, 4, 1.7, i % 2 ? "#a9b197" : "#6c886e", -.5);
    }
  }
  return { base: base.canvas, crown: crown.canvas, width, height, anchorX, anchorY };
}

/** Fade overhead art only; the visible collider foot always remains grounded. */
export function forestCanopyAlpha(obs: SanctuaryObstacle, viewer: WorldPoint) {
  return viewer.y < obs.y + 8 && Math.abs(viewer.x - obs.x) < obs.canopyRadius + 16 && viewer.y > obs.y - obs.canopyHeight - 16 ? .38 : 1;
}

/** Two cached blits per prop; texture complexity does not multiply frame work. */
export function drawForestObstacle(ctx: CanvasRenderingContext2D, obs: SanctuaryObstacle, time: number, viewer: WorldPoint, reducedMotion = false, crystalBlink = 0) {
  const variant = variantFor(obs.id);
  const key = `${obs.kind}:${obs.r}:${obs.canopyRadius}:${obs.canopyHeight}:${variant}`;
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
