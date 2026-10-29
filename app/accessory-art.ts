import type { Hat } from "../server/game-types";
import { mooncatHatAnchor } from "./mooncat-renderer";
import type { CatDirection } from "./cat-art";
import { bodyPose, idleBodyPose } from "./cat-walk-rig";

/** Same frame and head anchor in the picker, portraits, and arena. */
export const ACCESSORY_FRAME = Object.freeze({ width: 96, height: 72, anchorX: 48, anchorY: 34, pixelRatio: 2 });

function crescent(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + radius * .45, y - radius);
  ctx.bezierCurveTo(x - radius * 1.5, y - radius, x - radius * 1.5, y + radius, x + radius * .45, y + radius);
  ctx.bezierCurveTo(x - radius * .55, y + radius * .55, x - radius * .55, y - radius * .55, x + radius * .45, y - radius);
  ctx.fill();
}

function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, color: string) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-5, -7, 1, -12); ctx.quadraticCurveTo(7, -4, 0, 0); ctx.fill();
  ctx.restore();
}

function paintAccessory(ctx: CanvasRenderingContext2D, hat: Hat, muted: boolean) {
  ctx.save(); ctx.translate(0, 5); ctx.scale(.82, .82);
  const color = (normal: string, subdued: string) => muted ? subdued : normal;
  const gold = color("#e9cc95", "#a7abaa");
  const edge = color("#565365", "#4b555b");
  const cloth = ctx.createLinearGradient(-18, -23, 18, 22);
  cloth.addColorStop(0, color("#a69ab4", "#8a959b"));
  cloth.addColorStop(.48, color("#726a85", "#69767e"));
  cloth.addColorStop(1, color("#444c64", "#4b5962"));
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.lineWidth = .9; ctx.strokeStyle = edge;

  if (hat === "antlers") {
    // A woven circlet seats the branches above the ears, not over the face.
    ctx.fillStyle = color("#61786d", "#6c7b7c");
    ctx.beginPath(); ctx.ellipse(0, 13, 23, 4.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.save(); ctx.scale(side, 1);
      ctx.beginPath(); ctx.moveTo(13, 13); ctx.bezierCurveTo(19, 3, 23, -11, 21, -27);
      ctx.moveTo(20, -8); ctx.quadraticCurveTo(30, -12, 32, -22);
      ctx.moveTo(22, -17); ctx.quadraticCurveTo(15, -20, 15, -27);
      ctx.strokeStyle = color("#5d514d", "#58666b"); ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = color("#c2a37b", "#a1aaaa"); ctx.lineWidth = 2.8; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(15, 11); ctx.quadraticCurveTo(21, -1, 21, -11);
      ctx.strokeStyle = color("#ecd7ae", "#bcc1c0"); ctx.lineWidth = .8; ctx.stroke();
      // Fine broken bark ridges follow the branch, baked with the accessory.
      ctx.strokeStyle = color("#65564a80", "#62707880"); ctx.lineWidth = .6;
      for (let ridge = 0; ridge < 6; ridge++) {
        const y = 6 - ridge * 5;
        ctx.beginPath(); ctx.moveTo(19, y); ctx.lineTo(21.5, y - 1.2); ctx.stroke();
      }
      leaf(ctx, 27, -14, .9, color("#8eb7a2", "#8f9da0"));
      leaf(ctx, 16, 3, -.8, color("#b7d2ae", "#aab4b2"));
      ctx.restore();
    }
    ctx.strokeStyle = gold; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-20, 12); ctx.quadraticCurveTo(0, 18, 20, 12); ctx.stroke();
    ctx.fillStyle = gold;
    ctx.beginPath(); ctx.ellipse(0, 12, 4.5, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color("#d9f2e2", "#c1cbca");
    ctx.beginPath(); ctx.ellipse(0, 11.6, 2.8, 3.3, 0, 0, Math.PI * 2); ctx.fill();
  } else if (hat === "hood") {
    ctx.fillStyle = cloth;
    ctx.beginPath(); ctx.moveTo(-27, 17); ctx.bezierCurveTo(-25, -5, -14, -23, 2, -25);
    ctx.bezierCurveTo(20, -20, 27, 1, 28, 18);
    ctx.quadraticCurveTo(12, 13, 1, 13); ctx.quadraticCurveTo(-12, 13, -27, 17);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.clip();
    for (let thread = 0; thread < 24; thread++) {
      const y = -23 + thread * 1.8;
      ctx.strokeStyle = thread % 2 ? "#ded1e31a" : "#343d5526"; ctx.lineWidth = .55;
      ctx.beginPath(); ctx.moveTo(-25, y); ctx.quadraticCurveTo(0, y + 3, 27, y + 1); ctx.stroke();
    }
    ctx.restore();
    // Recessed opening, soft rolled hem, and a fine stitched outer seam.
    ctx.fillStyle = color("#252c42", "#46545c");
    ctx.beginPath(); ctx.moveTo(-20, 15);
    ctx.bezierCurveTo(-14, -1, 12, -3, 22, 16); ctx.quadraticCurveTo(0, 10, -20, 15); ctx.fill();
    ctx.strokeStyle = color("#b8accc", "#aeb8bc"); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-25, 17); ctx.quadraticCurveTo(0, 7, 26, 18); ctx.stroke();
    ctx.setLineDash([1, 3]); ctx.strokeStyle = gold; ctx.lineWidth = .8;
    ctx.beginPath(); ctx.moveTo(-22, 7); ctx.bezierCurveTo(-19, -7, -10, -19, 1, -21);
    ctx.bezierCurveTo(15, -17, 20, -4, 23, 8); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = color("#c0b6d133", "#c0c9cc33"); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(2, -22); ctx.quadraticCurveTo(11, -6, 10, 10); ctx.stroke();
    crescent(ctx, -1, -7, 5.5, gold);
    ctx.fillStyle = gold;
    ctx.beginPath(); ctx.arc(21, 14, 1.9, 0, Math.PI * 2); ctx.fill();
  } else if (hat === "moth") {
    for (const side of [-1, 1]) {
      ctx.save(); ctx.scale(side, 1);
      const wing = ctx.createLinearGradient(0, -16, 30, 17);
      wing.addColorStop(0, color("#faf0d7", "#c4cecd"));
      wing.addColorStop(.55, color("#cbc6e2", "#9eacb3"));
      wing.addColorStop(1, color("#8daeb2", "#7c919b"));
      ctx.fillStyle = wing; ctx.strokeStyle = color("#716d8b", "#64767f"); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(3, 3); ctx.bezierCurveTo(10, -5, 29, -4, 25, 14);
      ctx.quadraticCurveTo(15, 25, 5, 13); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1, 4); ctx.bezierCurveTo(7, -14, 25, -20, 34, -11);
      ctx.bezierCurveTo(31, 2, 21, 10, 8, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.clip();
      for (let vein = 0; vein < 10; vein++) {
        ctx.strokeStyle = color("#837e9a45", "#83939c45"); ctx.lineWidth = .5;
        ctx.beginPath(); ctx.moveTo(5, 8); ctx.quadraticCurveTo(18, -vein * 1.3, 31, -15 + vein * 2); ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = color("#8d86aa", "#84949d"); ctx.lineWidth = .8;
      ctx.beginPath(); ctx.moveTo(4, 7); ctx.quadraticCurveTo(15, -5, 29, -11);
      ctx.moveTo(5, 8); ctx.quadraticCurveTo(17, 8, 23, 14); ctx.stroke();
      ctx.fillStyle = color("#746d9c", "#768793");
      ctx.beginPath(); ctx.ellipse(21, -5, 4.8, 3.8, -.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = gold;
      ctx.beginPath(); ctx.ellipse(21, -5, 2.8, 2.2, -.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color("#e8eee6", "#bfc9c8");
      ctx.beginPath(); ctx.arc(22, -5.5, 1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = gold; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-1, -5); ctx.quadraticCurveTo(-6, -16, -12, -15);
    ctx.moveTo(1, -5); ctx.quadraticCurveTo(6, -16, 12, -15); ctx.stroke();
    ctx.fillStyle = cloth;
    ctx.beginPath(); ctx.ellipse(0, 4, 3.6, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = gold;
    ctx.beginPath(); ctx.ellipse(0, -1, 2.6, 3.7, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    // A bent, sewn cap with a real fold, rolled brim, and hanging moonstone.
    ctx.fillStyle = cloth;
    ctx.beginPath(); ctx.moveTo(-26, 15);
    ctx.bezierCurveTo(-19, -3, -8, -28, 8, -27);
    ctx.quadraticCurveTo(12, -18, 22, -15); ctx.quadraticCurveTo(15, -12, 9, -18);
    ctx.quadraticCurveTo(12, -2, 26, 15); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.clip();
    for (let thread = 0; thread < 22; thread++) {
      const y = -26 + thread * 1.8;
      ctx.strokeStyle = thread % 2 ? "#ded1e326" : "#303d5529"; ctx.lineWidth = .5;
      ctx.beginPath(); ctx.moveTo(-25, y); ctx.quadraticCurveTo(0, y + 4, 26, y); ctx.stroke();
    }
    ctx.restore();
    ctx.setLineDash([1, 2.6]); ctx.strokeStyle = gold; ctx.lineWidth = .6;
    ctx.beginPath(); ctx.moveTo(-19, 9); ctx.quadraticCurveTo(-10, -12, 6, -22); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = color("#b5a8ca", "#aab7bf"); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(7, -24); ctx.quadraticCurveTo(-4, -9, 8, 14); ctx.stroke();
    ctx.fillStyle = color("#82789e", "#88959f"); ctx.strokeStyle = edge;
    ctx.beginPath(); ctx.ellipse(0, 15, 29, 4.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = gold; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-23, 15); ctx.quadraticCurveTo(0, 21, 23, 15); ctx.stroke();
    crescent(ctx, -5, 2, 5, gold);
    ctx.fillStyle = color("#efe2bd", "#bdc5c7");
    for (const [x, y] of [[7, -10], [14, 6], [-10, 8]]) {
      ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.lineTo(x + .8, y - .7); ctx.lineTo(x + 2, y);
      ctx.lineTo(x + .8, y + .7); ctx.lineTo(x, y + 2); ctx.lineTo(x - .8, y + .7);
      ctx.lineTo(x - 2, y); ctx.lineTo(x - .8, y - .7); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = gold; ctx.lineWidth = .8;
    ctx.beginPath(); ctx.moveTo(22, 16); ctx.quadraticCurveTo(25, 20, 23, 24); ctx.stroke();
    ctx.fillStyle = color("#d4e8e3", "#b9c5c6");
    ctx.beginPath(); ctx.ellipse(23, 24, 1.8, 2.3, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

const cache = new Map<string, HTMLCanvasElement>();
export const isCollar = (hat: Hat) => ["moonbell", "leafband", "starlock", "mothbow"].includes(hat);
export function collarAnchor(direction: string) {
  const x = direction === "SOUTH" || direction === "NORTH" ? 0 : direction === "EAST" || direction === "WEST" ? 23 : ["NE", "NW"].includes(direction) ? 12 : 23;
  return { x: ["WEST", "SW", "NW"].includes(direction) ? -x : x, y: ["NORTH", "NE", "NW"].includes(direction) ? -15 : 0 };
}

export type AccessoryPose = "GAMEPLAY" | "SEATED";

/** Paint-space fit, shared by the arena, home portrait and customization preview.
 * Side bands are foreshortened; the charm remains round and hangs vertically. */
export function accessoryFit(hat: Hat, direction: CatDirection, pose: AccessoryPose = "GAMEPLAY") {
  const collar = isCollar(hat), seated = pose === "SEATED";
  const rear = !seated && ["NORTH", "NE", "NW"].includes(direction);
  const side = !seated && ["EAST", "WEST"].includes(direction);
  const front = seated || direction === "SOUTH" || direction === "NORTH";
  const mirror = ["WEST", "SW", "NW"].includes(direction) ? -1 : 1;
  const anchor = seated ? { x: 0, y: collar ? 4 : -49 } : collar ? collarAnchor(direction) : mooncatHatAnchor(direction);
  return {
    x: anchor.x, y: anchor.y - (collar || seated ? 0 : 12),
    scaleX: collar ? side ? .48 : front ? .76 : .62 : side ? .58 : .66,
    scaleY: collar ? .68 : .66,
    angle: collar && !front ? (side ? -.20 : -.12) * mirror : 0,
    charmScale: seated ? .70 : .66,
    rear,
  };
}

/** Portrait and live arena use identical body-space placement, not CSS overlays. */
export function drawWornAccessory(ctx: CanvasRenderingContext2D, hat: Hat, direction: CatDirection, muted = false, phase = 0, amount = 0, pose: AccessoryPose = "GAMEPLAY", idlePhase = 0) {
  const collar = isCollar(hat), fit = accessoryFit(hat, direction, pose);
  const body = bodyPose(phase, amount);
  const idle = idleBodyPose(idlePhase, amount); body.y += idle.y; body.lean += idle.lean;
  ctx.save(); ctx.translate(body.x, body.y + 8); ctx.rotate(body.lean); ctx.translate(0, -8);
  ctx.translate(fit.x, fit.y);
  ctx.save(); ctx.rotate(fit.angle); ctx.scale(fit.scaleX, fit.scaleY);
  drawAccessoryPart(ctx, hat, muted, collar ? "BAND" : "FULL"); ctx.restore();
  if (collar && !fit.rear) {
    // The short hanging charm does not squash sideways with the neckband.
    ctx.scale(fit.charmScale, fit.charmScale);
    drawAccessoryPart(ctx, hat, muted, "CHARM");
  }
  ctx.restore();
}
function paintCollar(ctx: CanvasRenderingContext2D, hat: Hat, muted: boolean, part: "FULL" | "BAND" | "CHARM" = "FULL") {
  const color = (value: string) => muted ? "#81939a" : value;
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.strokeStyle = "#1b223d"; ctx.lineWidth = 1;
  const band = ctx.createLinearGradient(0, -4, 0, 5);
  band.addColorStop(0, color(hat === "leafband" ? "#a6d0a9" : hat === "starlock" ? "#ba9cdd" : "#a7d6e7"));
  band.addColorStop(1, color(hat === "leafband" ? "#3e7864" : hat === "starlock" ? "#665092" : "#44758f"));
  if (part !== "CHARM") {
    ctx.fillStyle = band;
    ctx.beginPath(); ctx.moveTo(-15, -4); ctx.quadraticCurveTo(0, 5, 15, -4); ctx.lineTo(13, 1); ctx.quadraticCurveTo(0, 10, -13, 1); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = color("#dce9df"); ctx.lineWidth = .5;
    ctx.beginPath(); ctx.moveTo(-12, -2); ctx.quadraticCurveTo(0, 5, 12, -2); ctx.stroke();
  }
  if (part === "BAND") return;
  ctx.strokeStyle = "#1b223d"; ctx.lineWidth = 1; ctx.fillStyle = band;
  if (hat === "leafband") {
    ctx.beginPath(); ctx.moveTo(-8, 2); ctx.lineTo(0, 15); ctx.lineTo(9, 2); ctx.quadraticCurveTo(0, 7, -8, 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = color("#d5ead0"); ctx.lineWidth = .7;
    ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, 12); ctx.moveTo(-3, 7); ctx.lineTo(0, 9); ctx.lineTo(3, 7); ctx.stroke();
  } else if (hat === "mothbow") {
    ctx.fillStyle = color("#d7b6d7");
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, 5); ctx.bezierCurveTo(side * 15, -5, side * 16, 14, side * 3, 9); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = color("#f2dfba"); ctx.beginPath(); ctx.ellipse(0, 6, 2.5, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else {
    ctx.fillStyle = color("#e4c185");
    ctx.beginPath(); ctx.ellipse(0, 6, 1.4, 2.4, 0, 0, Math.PI * 2); ctx.stroke();
    if (hat === "starlock") {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.2 : 5; if (i) ctx.lineTo(Math.cos(a) * r, 11 + Math.sin(a) * r); else ctx.moveTo(Math.cos(a) * r, 11 + Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.ellipse(0, 11, 4.4, 4.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color("#55607b"); ctx.beginPath(); ctx.ellipse(0, 13, .7, 1.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = color("#fff0c4"); ctx.beginPath(); ctx.moveTo(-2, 8); ctx.quadraticCurveTo(-3, 9, -2.5, 11); ctx.stroke();
    }
  }
}
function accessorySprite(hat: Hat, muted: boolean, part: "FULL" | "BAND" | "CHARM") {
  const key = part === "FULL" ? `${hat}:${muted}` : `${hat}:${muted}:${part}`;
  let sprite = cache.get(key);
  if (!sprite) {
    const { width, height, anchorX, anchorY, pixelRatio } = ACCESSORY_FRAME;
    sprite = document.createElement("canvas");
    sprite.width = width * pixelRatio; sprite.height = height * pixelRatio;
    const paint = sprite.getContext("2d");
    if (!paint) return;
    paint.scale(pixelRatio, pixelRatio); paint.translate(anchorX, anchorY);
    if (isCollar(hat)) paintCollar(paint, hat, muted, part);
    else paintAccessory(paint, hat, muted);
    cache.set(key, sprite);
  }
  return sprite;
}
function drawAccessoryPart(ctx: CanvasRenderingContext2D, hat: Hat, muted: boolean, part: "FULL" | "BAND" | "CHARM") {
  const sprite = accessorySprite(hat, muted, part);
  if (sprite) ctx.drawImage(sprite, -ACCESSORY_FRAME.anchorX, -ACCESSORY_FRAME.anchorY, ACCESSORY_FRAME.width, ACCESSORY_FRAME.height);
}
export function drawAccessory(ctx: CanvasRenderingContext2D, hat: Hat, x = 0, y = 0, muted = false) {
  const sprite = accessorySprite(hat, muted, "FULL");
  if (sprite) ctx.drawImage(sprite, x - ACCESSORY_FRAME.anchorX, y - ACCESSORY_FRAME.anchorY, ACCESSORY_FRAME.width, ACCESSORY_FRAME.height);
}
