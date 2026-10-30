import type { Hat } from "../server/game-types";
import { HAT_META } from "../server/cosmetics";
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

function paintAccessory(ctx: CanvasRenderingContext2D, hat: Hat, muted: boolean, view: AccessoryView = "FRONT") {
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

  if (hat === "mushroom") {
    const cap = ctx.createLinearGradient(-20, -24, 14, 12);
    cap.addColorStop(0, color("#afd9e2", "#a0b4bb"));
    cap.addColorStop(.35, color("#6685bf", "#7b8e9f"));
    cap.addColorStop(1, color("#3d426e", "#566675"));
    ctx.fillStyle = color("#a5bdcc", "#8d9fa6");
    ctx.beginPath(); ctx.ellipse(0, 9, 27, 6.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = color("#455679", "#667984"); ctx.lineWidth = .65;
    for (let gill = -22; gill <= 22; gill += 4) {
      ctx.beginPath(); ctx.moveTo(gill, 9); ctx.lineTo(gill * .23, 13); ctx.stroke();
    }
    ctx.fillStyle = cap; ctx.strokeStyle = edge; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(-28, 8); ctx.bezierCurveTo(-22, -13, -11, -24, 1, -23);
    ctx.bezierCurveTo(14, -24, 24, -7, 28, 8); ctx.quadraticCurveTo(0, 16, -28, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = color("#d6f2dc", "#bdc9ca");
    for (const [x, y, r] of [[-14, -3, 3.4], [0, -14, 4.4], [14, -2, 3], [4, 3, 2]]) {
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.25, r * .75, -.2, 0, Math.PI * 2); ctx.fill();
    }
    return ctx.restore();
  }

  // Profile and rear views are authored separately, not a flattened frontal hat.
  if (view !== "FRONT" && hat !== "antlers" && hat !== "moth") {
    const side = view === "SIDE", rear = view === "REAR" || view === "REAR_DIAGONAL";
    ctx.fillStyle = cloth;
    ctx.beginPath();
    if (hat === "hood") {
      ctx.moveTo(-24, 15); ctx.bezierCurveTo(-27, -4, -12, -25, 1, -25);
      ctx.bezierCurveTo(18, -22, 25, -4, side ? 16 : 26, 16);
      ctx.quadraticCurveTo(0, 10, -24, 15);
    } else {
      ctx.moveTo(-27, 15); ctx.quadraticCurveTo(-10, -22, 8, -27);
      ctx.quadraticCurveTo(15, -19, 23, -16); ctx.lineTo(10, -18);
      ctx.quadraticCurveTo(12, -1, 27, 15); ctx.closePath();
    }
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = color("#c3b5dc", "#a8b5bd"); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-25, 15); ctx.quadraticCurveTo(-1, 22, 26, 15); ctx.stroke();
    ctx.strokeStyle = color("#4c426b", "#526571"); ctx.lineWidth = .9;
    ctx.beginPath(); ctx.moveTo(1, -22); ctx.quadraticCurveTo(-5, -4, rear ? 1 : -8, 14); ctx.stroke();
    if (!rear) crescent(ctx, side ? -12 : -4, -5, 4.4, gold);
    if (side && hat === "hood") {
      ctx.fillStyle = color("#22223d", "#3f4c59");
      ctx.beginPath(); ctx.moveTo(17, -6); ctx.quadraticCurveTo(11, 5, 15, 16);
      ctx.lineTo(25, 15); ctx.quadraticCurveTo(24, 1, 17, -6); ctx.fill();
    }
    return ctx.restore();
  }

  if (hat === "antlers") {
    // A woven circlet seats the branches above the ears, not over the face.
    ctx.fillStyle = color("#61786d", "#6c7b7c");
    ctx.beginPath(); ctx.ellipse(0, 13, 23, 4.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    for (const side of view === "SIDE" ? [-1] : [-1, 1]) {
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
    if (view === "REAR" || view === "REAR_DIAGONAL") return ctx.restore();
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
    for (const side of view === "SIDE" ? [-1] : [-1, 1]) {
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
export const isCollar = (hat: Hat) => HAT_META[hat].kind === "COLLAR";
export type AccessoryPose = "GAMEPLAY" | "SEATED";
export type AccessoryLayer = "BACK" | "FRONT" | "ALL";
export type AccessoryView = "FRONT" | "FRONT_DIAGONAL" | "SIDE" | "REAR_DIAGONAL" | "REAR";

/** Registered against the normalized painted atlas, in its 112px body space.
 * The seated portrait is a different drawing and has its own registration. */
const ATTACHMENTS = {
  SOUTH: { neck: [0, -1], crown: [0, -44], view: "FRONT" },
  SE: { neck: [15, -2], crown: [11, -45], view: "FRONT_DIAGONAL" },
  EAST: { neck: [17, -4], crown: [19, -46], view: "SIDE" },
  NE: { neck: [6, -11], crown: [8, -51], view: "REAR_DIAGONAL" },
  NORTH: { neck: [0, -14], crown: [0, -53], view: "REAR" },
} as const;

function attachment(direction: CatDirection) {
  const canonical = direction === "SW" ? "SE" : direction === "WEST" ? "EAST" : direction === "NW" ? "NE" : direction;
  return ATTACHMENTS[canonical];
}
export function collarAnchor(direction: CatDirection) {
  const [x, y] = attachment(direction).neck;
  return { x: ["WEST", "SW", "NW"].includes(direction) ? -x : x, y };
}

/** Paint-space fit, shared by the arena, home portrait and customization preview.
 * Side bands are foreshortened; the charm remains round and hangs vertically. */
export function accessoryFit(hat: Hat, direction: CatDirection, pose: AccessoryPose = "GAMEPLAY") {
  const collar = isCollar(hat), seated = pose === "SEATED";
  const rear = !seated && ["NORTH", "NE", "NW"].includes(direction);
  const side = !seated && ["EAST", "WEST"].includes(direction);
  const front = seated || direction === "SOUTH" || direction === "NORTH";
  const mirror = ["WEST", "SW", "NW"].includes(direction) ? -1 : 1;
  const registered = attachment(direction), [crownX, crownY] = registered.crown;
  const anchor = seated ? { x: 0, y: collar ? 4 : -49 } : collar ? collarAnchor(direction) : { x: crownX * mirror, y: crownY };
  if (hat === "hood" && !seated) anchor.x += (side ? 5 : front ? 0 : 7) * mirror;
  return {
    x: anchor.x, y: anchor.y + (hat === "hood" ? seated ? 22 : 25 : 0),
    scaleX: hat === "hood" ? side ? .76 : .86 : collar ? side ? .64 : front ? .76 : .70 : side ? .58 : .66,
    scaleY: hat === "hood" ? .83 : collar ? .68 : .66,
    angle: collar && !front ? (side ? -.14 : -.09) * mirror : 0,
    charmScale: seated ? .70 : .66,
    rear, mirror, view: seated ? "FRONT" as const : registered.view,
  };
}

/** Portrait and live arena use identical body-space placement, not CSS overlays. */
export function drawWornAccessory(ctx: CanvasRenderingContext2D, hat: Hat, direction: CatDirection, muted = false, phase = 0, amount = 0, pose: AccessoryPose = "GAMEPLAY", idlePhase = 0, layer: AccessoryLayer = "ALL") {
  const collar = isCollar(hat), fit = accessoryFit(hat, direction, pose);
  const body = bodyPose(phase, amount);
  const idle = idleBodyPose(idlePhase, amount); body.y += idle.y; body.lean += idle.lean;
  ctx.save(); ctx.translate(body.x, body.y + 8); ctx.rotate(body.lean); ctx.translate(0, -8);
  ctx.translate(fit.x, fit.y);
  ctx.save(); ctx.rotate(fit.angle); ctx.scale(fit.scaleX * fit.mirror, fit.scaleY);
  if (layer !== "FRONT" && !(collar && fit.rear)) drawAccessoryPart(ctx, hat, muted, "BACK", fit.view);
  if (layer !== "BACK") drawAccessoryPart(ctx, hat, muted, "BAND", fit.view);
  ctx.restore();
  if (collar && !fit.rear && layer !== "BACK") {
    // The short hanging charm does not squash sideways with the neckband.
    ctx.translate(fit.view === "SIDE" ? fit.mirror * 8 : fit.view === "FRONT_DIAGONAL" ? fit.mirror * 5 : 0, 0);
    ctx.rotate(Math.sin(phase + .4) * Math.min(1, Math.max(0, amount)) * .045);
    ctx.scale(fit.charmScale, fit.charmScale);
    ctx.scale(fit.mirror, 1);
    drawAccessoryPart(ctx, hat, muted, "CHARM", fit.view);
  }
  ctx.restore();
}
type AccessoryPart = "FULL" | "BACK" | "BAND" | "CHARM";

/** A fitted cowl, with a real face opening. Its silhouette must wrap the skull,
 * unlike the pointed cap, and its rear view must not expose a forehead badge. */
function paintHoodLayer(ctx: CanvasRenderingContext2D, muted: boolean, view: AccessoryView, part: AccessoryPart) {
  ctx.save();
  const rear = view === "REAR" || view === "REAR_DIAGONAL", side = view === "SIDE";
  const rx = side ? 25 : 30, faceX = side ? 5 : view === "FRONT_DIAGONAL" ? 2 : 0;
  const cloth = ctx.createLinearGradient(-28, -28, 20, 32);
  cloth.addColorStop(0, muted ? "#96a3ad" : "#9e8dc2");
  cloth.addColorStop(.45, muted ? "#657885" : "#5c5284");
  cloth.addColorStop(1, muted ? "#384c5b" : "#292b4b");
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.fillStyle = cloth; ctx.strokeStyle = muted ? "#3c4f5c" : "#24233d"; ctx.lineWidth = 1.2;
  const outline = () => {
    ctx.moveTo(-rx, 18); ctx.bezierCurveTo(-rx - 4, 0, -rx + 3, -15, -19, -32);
    ctx.quadraticCurveTo(-10, -30, 0, -24); ctx.quadraticCurveTo(11, -31, 21, -32);
    ctx.bezierCurveTo(rx - 2, -12, rx + 5, 8, rx, 22); ctx.quadraticCurveTo(0, 36, -rx, 18); ctx.closePath();
  };
  const opening = () => {
    ctx.moveTo(faceX - 22, -7); ctx.bezierCurveTo(faceX - 23, -18, faceX - 9, -20, faceX, -18);
    ctx.bezierCurveTo(faceX + 18, -21, faceX + 24, -8, faceX + 23, 5);
    ctx.quadraticCurveTo(faceX + 22, 23, faceX, 26); ctx.quadraticCurveTo(faceX - 28, 22, faceX - 22, -7); ctx.closePath();
  };
  ctx.beginPath(); outline(); ctx.clip();
  ctx.beginPath(); outline();
  if (part !== "BACK" && !rear) {
    opening();
    ctx.fill("evenodd"); ctx.stroke();
    ctx.strokeStyle = muted ? "#bac5c7" : "#c0afd7"; ctx.lineWidth = 2;
    ctx.beginPath(); opening(); ctx.stroke();
  } else { ctx.fill(); ctx.stroke(); }
  ctx.strokeStyle = muted ? "#bac5c7" : "#d2ba8e"; ctx.lineWidth = .65; ctx.setLineDash([1, 3]);
  ctx.beginPath(); outline(); ctx.stroke(); ctx.setLineDash([]);
  if (rear) {
    ctx.strokeStyle = muted ? "#a4b2b8" : "#9c8ebc";
    ctx.beginPath(); ctx.moveTo(0, -28); ctx.quadraticCurveTo(-6, 0, 0, 28); ctx.stroke();
  } else if (part !== "BACK") {
    crescent(ctx, side ? -15 : -21, -2, 3.1, muted ? "#c2c9c7" : "#e3ce9d");
  }
  ctx.restore();
}

function paintCollar(ctx: CanvasRenderingContext2D, hat: Hat, muted: boolean, part: AccessoryPart = "FULL", view: AccessoryView = "FRONT") {
  const color = (value: string) => muted ? "#81939a" : value;
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.strokeStyle = "#1b223d"; ctx.lineWidth = 1;
  const band = ctx.createLinearGradient(0, -4, 0, 5);
  const green = hat === "leafband" || hat === "fernwrap";
  band.addColorStop(0, color(green ? "#a6d0a9" : hat === "starlock" ? "#ba9cdd" : "#a7d6e7"));
  band.addColorStop(1, color(green ? "#3e7864" : hat === "starlock" ? "#665092" : "#44758f"));
  const rear = view === "REAR" || view === "REAR_DIAGONAL", side = view === "SIDE";
  if (part === "BACK") {
    if (rear) return;
    ctx.fillStyle = band;
    ctx.beginPath(); ctx.ellipse(-1, -3, side ? 11 : 16, 5.5, -.08, Math.PI, Math.PI * 2);
    ctx.lineTo(side ? 10 : 15, 0); ctx.quadraticCurveTo(0, -5, side ? -12 : -17, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    // Scarf tails belong behind the chest, not over the face/forelegs.
    if (hat === "fernwrap") {
      ctx.beginPath(); ctx.moveTo(-11, -2); ctx.quadraticCurveTo(-24, 0, -26, 10);
      ctx.lineTo(-18, 8); ctx.lineTo(-16, 12); ctx.quadraticCurveTo(-11, 7, -6, 1); ctx.fill(); ctx.stroke();
    }
    return;
  }
  if (part !== "CHARM") {
    ctx.fillStyle = band;
    ctx.beginPath();
    if (rear) {
      ctx.moveTo(-15, 1); ctx.quadraticCurveTo(0, -8, 15, 0); ctx.lineTo(13, 4); ctx.quadraticCurveTo(0, -2, -13, 5);
    } else if (side) {
      ctx.moveTo(-13, -6); ctx.quadraticCurveTo(1, 1, 11, -5); ctx.lineTo(10, 1); ctx.quadraticCurveTo(1, 7, -11, -1);
    } else {
      ctx.moveTo(-15, -4); ctx.quadraticCurveTo(view === "FRONT_DIAGONAL" ? 4 : 0, 5, 15, -4); ctx.lineTo(13, 1); ctx.quadraticCurveTo(0, 10, -13, 1);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = color("#dce9df"); ctx.lineWidth = .5;
    ctx.beginPath(); ctx.moveTo(-12, rear ? 1 : -2); ctx.quadraticCurveTo(0, rear ? -5 : 5, 12, -2); ctx.stroke();
    if (rear && hat === "fernwrap") {
      for (const x of [-5, 4]) leaf(ctx, x, 4, Math.PI * .9, color("#c1dab1"));
    }
  }
  if (part === "BAND" || rear) return;
  ctx.strokeStyle = "#1b223d"; ctx.lineWidth = 1; ctx.fillStyle = band;
  if (hat === "fernwrap") {
    ctx.fillStyle = color("#77a88a");
    ctx.beginPath(); ctx.moveTo(-8, 3); ctx.quadraticCurveTo(0, 6, 10, 2); ctx.lineTo(4, 15); ctx.lineTo(-2, 13); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = color("#e0e7bc"); ctx.lineWidth = .65;
    ctx.beginPath(); ctx.moveTo(1, 6); ctx.lineTo(1, 12);
    for (let y = 7; y <= 11; y += 2) { ctx.moveTo(-2, y - 1); ctx.lineTo(1, y + 1); ctx.lineTo(4, y - 1); }
    ctx.stroke();
  } else if (hat === "dewdrop") {
    ctx.strokeStyle = color("#d7debb"); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, 3); ctx.lineTo(0, 7); ctx.stroke();
    const dew = ctx.createLinearGradient(-3, 5, 4, 16);
    dew.addColorStop(0, color("#e1ffff")); dew.addColorStop(.45, color("#79e4e1")); dew.addColorStop(1, color("#3680a9"));
    ctx.fillStyle = dew; ctx.strokeStyle = "#253854";
    ctx.beginPath(); ctx.moveTo(0, 5); ctx.bezierCurveTo(-1, 8, -6, 10, -4, 14); ctx.bezierCurveTo(-1, 19, 7, 16, 4, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = color("#effffe"); ctx.lineWidth = .9;
    ctx.beginPath(); ctx.moveTo(-1, 10); ctx.quadraticCurveTo(-3, 12, -1.5, 14); ctx.stroke();
  } else if (hat === "leafband") {
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
function accessorySprite(hat: Hat, muted: boolean, part: AccessoryPart, view: AccessoryView = "FRONT") {
  // Bounded by catalog × five views × layers. No per-frame rasterization.
  const key = `${hat}:${muted}:${part}:${view}`;
  let sprite = cache.get(key);
  if (!sprite) {
    const { width, height, anchorX, anchorY, pixelRatio } = ACCESSORY_FRAME;
    if (typeof document === "undefined") return;
    sprite = document.createElement("canvas");
    sprite.width = width * pixelRatio; sprite.height = height * pixelRatio;
    const paint = sprite.getContext("2d");
    if (!paint) return;
    paint.scale(pixelRatio, pixelRatio); paint.translate(anchorX, anchorY);
    if (isCollar(hat)) paintCollar(paint, hat, muted, part, view);
    else if (hat === "hood") paintHoodLayer(paint, muted, view, part);
    else {
      if (part !== "FULL") {
        paint.beginPath();
        // Crown behind ears; rolled rim sits in front. Never paint across eyes.
        paint.rect(-48, part === "BACK" ? -34 : 14, 96, part === "BACK" ? 48 : 24);
        paint.clip();
      }
      paintAccessory(paint, hat, muted, view);
    }
    cache.set(key, sprite);
  }
  return sprite;
}
function drawAccessoryPart(ctx: CanvasRenderingContext2D, hat: Hat, muted: boolean, part: AccessoryPart, view: AccessoryView = "FRONT") {
  const sprite = accessorySprite(hat, muted, part, view);
  if (sprite) ctx.drawImage(sprite, -ACCESSORY_FRAME.anchorX, -ACCESSORY_FRAME.anchorY, ACCESSORY_FRAME.width, ACCESSORY_FRAME.height);
}
export function drawAccessory(ctx: CanvasRenderingContext2D, hat: Hat, x = 0, y = 0, muted = false) {
  const sprite = accessorySprite(hat, muted, "FULL");
  if (sprite) ctx.drawImage(sprite, x - ACCESSORY_FRAME.anchorX, y - ACCESSORY_FRAME.anchorY, ACCESSORY_FRAME.width, ACCESSORY_FRAME.height);
}
