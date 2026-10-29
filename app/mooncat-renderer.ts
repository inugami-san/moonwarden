import type { EyeStyle } from "../server/appearance";
import type { CatDirection } from "./cat-art";
import { drawMooncatSprite } from "./mooncat-sprites";

export type MooncatOptions = {
  color: string; direction: CatDirection; stridePhase: number; strideAmount: number;
  blink: boolean; eyeStyle?: EyeStyle; muted?: boolean; concealed?: boolean;
  holdingLantern?: boolean; tailTilt?: number;
  walkStyle?: "SMOOTH" | "FRAMES";
  idlePhase?: number;
};
type Coat = { light: string; mid: string; dark: string; ink: string; rim: string };
const coats = new Map<string, Coat>();
function coatFor(color: string, concealed: boolean, muted: boolean): Coat {
  if (concealed) return { light: "#788993", mid: "#788993", dark: "#788993", ink: "#788993", rim: "#788993" };
  if (muted) return { light: "#82979f", mid: "#526a79", dark: "#344658", ink: "#233140", rim: "#93a5ad" };
  const normalized = /^#[\da-f]{6}$/i.test(color) ? color.toLowerCase() : "#9671e8";
  const cached = coats.get(normalized); if (cached) return cached;
  const base = [1, 3, 5].map(offset => parseInt(normalized.slice(offset, offset + 2), 16));
  const mix = (tone: number[], weight: number) => `rgb(${base.map((value, i) => Math.round(value * (1 - weight) + tone[i] * weight)).join(",")})`;
  const result = { light: mix([190, 182, 243], .32), mid: mix([43, 28, 87], .37), dark: mix([17, 16, 44], .70), ink: "#19182f", rim: mix([221, 222, 255], .62) };
  if (coats.size >= 32) coats.delete(coats.keys().next().value!);
  coats.set(normalized, result); return result;
}

const VIEWS: Record<CatDirection, { hx: number; hy: number; bx: number; by: number; rx: number; ry: number; rear: boolean; profile: boolean; flip: boolean }> = {
  SE: { hx: 12, hy: -11, bx: -12, by: 2, rx: 23, ry: 15, rear: false, profile: false, flip: false },
  SW: { hx: 12, hy: -11, bx: -12, by: 2, rx: 23, ry: 15, rear: false, profile: false, flip: true },
  EAST: { hx: 19, hy: -13, bx: -10, by: 2, rx: 26, ry: 14, rear: false, profile: true, flip: false },
  WEST: { hx: 19, hy: -13, bx: -10, by: 2, rx: 26, ry: 14, rear: false, profile: true, flip: true },
  NE: { hx: 12, hy: -23, bx: -9, by: 6, rx: 22, ry: 17, rear: true, profile: false, flip: false },
  NW: { hx: 12, hy: -23, bx: -9, by: 6, rx: 22, ry: 17, rear: true, profile: false, flip: true },
  SOUTH: { hx: 0, hy: -11, bx: 0, by: 0, rx: 17, ry: 16, rear: false, profile: false, flip: false },
  NORTH: { hx: 0, hy: -24, bx: 0, by: 6, rx: 18, ry: 19, rear: true, profile: false, flip: false },
};
export function mooncatHatAnchor(direction: CatDirection) {
  const view = VIEWS[direction]; return { x: view.hx * (view.flip ? -1 : 1), y: view.hy - 22 };
}
function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}
function gradient(ctx: CanvasRenderingContext2D, coat: Coat, x: number, y: number, radius: number) {
  const fill = ctx.createRadialGradient(x - radius * .35, y - radius * .5, 1, x, y, radius);
  fill.addColorStop(0, coat.light); fill.addColorStop(.48, coat.mid); fill.addColorStop(1, coat.dark); return fill;
}
function crescent(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.beginPath(); ctx.moveTo(x + size * .45, y - size);
  ctx.bezierCurveTo(x - size * 1.6, y - size, x - size * 1.35, y + size * 1.25, x + size * .5, y + size * .8);
  ctx.bezierCurveTo(x - size * .65, y + size * .5, x - size * .65, y - size * .65, x + size * .45, y - size);
  ctx.fill();
}
function stars(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#e1d9ff";
  for (const [dx, dy, r] of [[-9, -4, .65], [-4, -7, .8], [2, -5, .5], [-6, 1, .45], [6, -2, .65], [-1, 3, .45]]) {
    ellipse(ctx, x + dx, y + dy, r, r); ctx.fill();
  }
  ctx.strokeStyle = "#e9e6ff"; ctx.lineWidth = .65;
  ctx.beginPath(); ctx.moveTo(x - 3, y - 1.5); ctx.lineTo(x - 3, y + 1.5); ctx.moveTo(x - 4.5, y); ctx.lineTo(x - 1.5, y); ctx.stroke();
}
function tail(ctx: CanvasRenderingContext2D, x: number, y: number, tilt: number, coat: Coat, decorated: boolean) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
  ctx.beginPath(); ctx.moveTo(3, 4);
  ctx.bezierCurveTo(-17, 4, -29, -13, -24, -31);
  ctx.bezierCurveTo(-20, -48, 2, -49, 7, -36);
  ctx.bezierCurveTo(13, -21, -9, -16, -11, -28);
  ctx.bezierCurveTo(-12, -35, -3, -38, -2, -31);
  ctx.bezierCurveTo(1, -36, -9, -39, -14, -31);
  ctx.bezierCurveTo(-23, -15, -7, -5, 5, -4);
  ctx.closePath(); ctx.fillStyle = gradient(ctx, coat, -10, -24, 28); ctx.fill(); ctx.strokeStyle = coat.ink; ctx.lineWidth = 1.6; ctx.stroke();
  if (decorated) { stars(ctx, -13, -30); ctx.strokeStyle = coat.rim; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(-22, -28); ctx.bezierCurveTo(-21, -41, -9, -44, -2, -40); ctx.stroke(); }
  ctx.restore();
}
function eye(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, style: EyeStyle, blink: boolean) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, 1);
  ctx.strokeStyle = "#171326"; ctx.lineWidth = 1.5;
  if (blink || style === "JOYFUL") {
    ctx.beginPath(); ctx.moveTo(-4.4, .8); ctx.quadraticCurveTo(0, style === "JOYFUL" ? -5 : 3, 4.4, .8); ctx.stroke(); ctx.restore(); return;
  }
  const iris = ctx.createRadialGradient(-1, 2, .3, 0, 0, 6);
  iris.addColorStop(0, "#fff3a1"); iris.addColorStop(.55, "#f5bf4c"); iris.addColorStop(1, "#b86a27");
  ctx.beginPath();
  if (style === "STARRY") {
    for (let i = 0; i < 10; i++) { const angle = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.7 : 5.6; if (i) ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r); else ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r); }
    ctx.closePath();
  } else if (style === "DREAMY") {
    ctx.moveTo(-4.7, -1); ctx.lineTo(4.7, -1); ctx.bezierCurveTo(5, 6.3, -5, 6.3, -4.7, -1); ctx.closePath();
  } else {
    const top = style === "ROUND" ? -6 : -5;
    ctx.moveTo(-4.8, 0); ctx.bezierCurveTo(-4.8, top, 4.8, top - .5, 4.8, -.5); ctx.bezierCurveTo(5.1, 6.7, -4.9, 6.7, -4.8, 0); ctx.closePath();
  }
  ctx.fillStyle = iris; ctx.fill(); ctx.stroke();
  ctx.save(); ctx.clip();
  ctx.fillStyle = "#26172d"; ellipse(ctx, .6, .4, style === "ROUND" ? 1.8 : 1.15, 3.8); ctx.fill();
  ctx.fillStyle = "#fffbed"; ellipse(ctx, -1.2, -1.8, 1.25, 1.6); ctx.fill(); ellipse(ctx, 2, 2.6, .6, .6); ctx.fill();
  ctx.restore(); ctx.restore();
}
function whiskers(ctx: CanvasRenderingContext2D, profile: boolean) {
  ctx.save(); ctx.strokeStyle = "#ddd5ef"; ctx.lineWidth = .65; ctx.globalAlpha *= .72;
  ctx.beginPath();
  if (profile) {
    for (const [y, tipY] of [[4, 1], [6, 6], [8, 11]]) {
      ctx.moveTo(16, y); ctx.quadraticCurveTo(24, y, 31, tipY);
    }
  } else {
    for (const side of [-1, 1]) {
      for (const [y, tipY] of [[4, 1], [6, 6], [8, 11]]) {
        ctx.moveTo(side * 12, y); ctx.quadraticCurveTo(side * 20, y, side * 27, tipY);
      }
    }
  }
  ctx.stroke(); ctx.restore();
}
function head(ctx: CanvasRenderingContext2D, coat: Coat, profile: boolean, rear: boolean, decorated: boolean, options: MooncatOptions) {
  ctx.beginPath();
  if (profile) {
    // Rounded feline profile, not a projecting canine snout.
    ctx.moveTo(-19, -6);
    ctx.bezierCurveTo(-22, -14, -19, -27, -15, -31);
    ctx.quadraticCurveTo(-11, -32, -4, -21);
    ctx.quadraticCurveTo(2, -23, 7, -21);
    ctx.lineTo(12, -27); ctx.quadraticCurveTo(16, -24, 15, -15);
    ctx.quadraticCurveTo(20, -10, 20, -4);
    ctx.quadraticCurveTo(23, -1, 23, 3);
    ctx.quadraticCurveTo(23, 8, 18, 10);
    ctx.quadraticCurveTo(19, 16, 4, 16);
    ctx.bezierCurveTo(-11, 17, -25, 8, -19, -6);
  } else {
  ctx.moveTo(-19, -7);
  ctx.bezierCurveTo(-23, -17, -21, -29, -17, -32);
  ctx.bezierCurveTo(-13, -33, -8, -23, -6, -21);
  ctx.quadraticCurveTo(1, -24, 8, -21);
  ctx.bezierCurveTo(13, -27, 18, -32, 20, -31);
  ctx.bezierCurveTo(23, -27, 24, -15, 21, -6);
  ctx.bezierCurveTo(28, 5, 15, 17, 0, 16);
  ctx.bezierCurveTo(-15, 16, -27, 8, -19, -7);
  }
  ctx.closePath();
  ctx.fillStyle = gradient(ctx, coat, -2, -10, 32); ctx.fill(); ctx.strokeStyle = coat.ink; ctx.lineWidth = 1.7; ctx.stroke();
  if (!decorated) return;
  ctx.save(); ctx.clip();
  // Broad bounced light follows the cheek volume rather than a shiny sticker.
  const visibility = ctx.globalAlpha;
  ctx.fillStyle = coat.light; ctx.globalAlpha = visibility * .20; ellipse(ctx, -12, -5, 7, 15); ctx.fill();
  ctx.globalAlpha = visibility; ctx.fillStyle = coat.dark;
  if (profile) {
    ctx.beginPath(); ctx.moveTo(-16, -12); ctx.quadraticCurveTo(-18, -23, -14, -27); ctx.lineTo(-7, -17); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(8, -19); ctx.lineTo(12, -24); ctx.lineTo(12, -17); ctx.closePath(); ctx.fill();
  } else {
    ctx.beginPath(); ctx.moveTo(-18, -12); ctx.quadraticCurveTo(-21, -24, -17, -28); ctx.lineTo(-9, -17); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(12, -17); ctx.lineTo(19, -27); ctx.quadraticCurveTo(22, -17, 18, -11); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = coat.rim; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(-20, -20); ctx.quadraticCurveTo(-21, -27, -17, -30); ctx.stroke();
  ctx.restore();
  if (rear) return;
  if (profile) {
    ctx.fillStyle = "#b8e5fa"; crescent(ctx, 11, -13.5, 2.5);
    eye(ctx, 10, -2, .9, options.eyeStyle ?? "FIERCE", options.blink);
    ctx.fillStyle = "#eaa6b7"; ctx.strokeStyle = coat.ink; ctx.lineWidth = .8;
    ctx.beginPath(); ctx.moveTo(20.5, 2); ctx.lineTo(22.7, 2.5); ctx.lineTo(21, 4); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(21, 4); ctx.quadraticCurveTo(21, 7, 18.5, 7); ctx.stroke();
    whiskers(ctx, true);
    return;
  }
  const center = 2;
  ctx.fillStyle = "#b8e5fa"; crescent(ctx, center, -13.5, 3.1);
  eye(ctx, -8, 0, 1, options.eyeStyle ?? "FIERCE", options.blink);
  eye(ctx, 11, -.4, .85, options.eyeStyle ?? "FIERCE", options.blink);
  ctx.fillStyle = "#eaa6b7"; ctx.strokeStyle = coat.ink; ctx.lineWidth = .8;
  ctx.beginPath(); ctx.moveTo(center - 1.8, 6); ctx.quadraticCurveTo(center, 5, center + 1.8, 6); ctx.lineTo(center, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(center - 2.2, 9); ctx.quadraticCurveTo(center - .7, 10.2, center, 8.2); ctx.quadraticCurveTo(center + .7, 10.2, center + 2.2, 9); ctx.stroke();
  whiskers(ctx, false);
}

/** One shared, articulated renderer for gameplay and portraits. Rendering only:
 * no collider, player color, role or network state is modified. */
export function drawMooncat(ctx: CanvasRenderingContext2D, options: MooncatOptions) {
  if (drawMooncatSprite(ctx, options)) return;
  drawVectorMooncat(ctx, options);
}

/** Kept for loading failures and the before/after art comparison. */
export function drawVectorMooncat(ctx: CanvasRenderingContext2D, options: MooncatOptions) {
  const view = VIEWS[options.direction] ?? VIEWS.SE;
  const concealed = options.concealed === true, decorated = !concealed && !options.muted;
  const coat = coatFor(options.color, concealed, options.muted === true);
  const phase = Number.isFinite(options.stridePhase) ? options.stridePhase : 0;
  const stride = Number.isFinite(options.strideAmount) ? Math.max(0, Math.min(1, options.strideAmount)) : 0;
  const bob = Math.cos(phase * 2) * .8 * stride;
  const wag = Math.sin(phase - .7) * .10 * stride + (Number.isFinite(options.tailTilt) ? options.tailTilt! * .35 : 0);
  const front = options.direction === "SOUTH" || options.direction === "NORTH";
  const feet = front ? [[-12, 8, 19], [12, 8, 19], [-8, 13, 27], [8, 13, 27]]
    : view.profile ? [[-24, 7, 22], [13, 6, 22], [-28, 10, 27], [15, 10, 28]]
    : [[-13, 7, 19], [15, 6, 19], [-26, 10, 26], [8, 10, 28]];
  ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (view.flip) ctx.scale(-1, 1);
  const drawLeg = (index: number) => {
    const [x, hip, ground] = feet[index];
    const p = phase + [Math.PI, 0, 0, Math.PI][index];
    // Smooth swing/stance: squared lift has zero vertical speed at contact.
    const lift = Math.pow(Math.max(0, Math.sin(p)), 2) * 5 * stride;
    const dx = front ? Math.sin(p) * .6 * stride : -Math.cos(p) * 6 * stride;
    const dy = front ? -Math.cos(p) * 2.7 * stride : 0;
    const footX = x + dx, footY = ground - lift + dy;
    ctx.beginPath(); ctx.moveTo(x - 4.7, hip + bob - 5);
    ctx.bezierCurveTo(x - 6.5, hip + 4, footX - 5.5, footY - 2, footX - 4, footY + 1);
    ctx.quadraticCurveTo(footX + .5, footY + 4, footX + 5, footY + 1);
    // Fill closes the shoulder implicitly; leave the stroke open so paws blend
    // into the torso instead of looking like rectangular pieces glued onto it.
    ctx.bezierCurveTo(footX + 6, footY - 3, x + 5, hip + 1, x + 4.7, hip - 5 + bob);
    ctx.fillStyle = index < 2 ? coat.dark : gradient(ctx, coat, x - 2, hip, 20); ctx.fill(); ctx.strokeStyle = coat.ink; ctx.lineWidth = 1.5; ctx.stroke();
    if (index === 3 && decorated) {
      ctx.fillStyle = "#4d8ab8"; ctx.beginPath(); ctx.roundRect(footX - 4.5, footY - 6.5, 9, 5.5, 1.4); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#bbeafa"; ctx.lineWidth = .7; ctx.beginPath();
      for (const offset of [-2, 0, 2]) { ctx.moveTo(footX + offset, footY - 5.5); ctx.lineTo(footX + offset, footY - 2.2); } ctx.stroke();
    }
  };
  drawLeg(0); drawLeg(1);
  if (!view.rear) tail(ctx, front ? 12 : -28, front ? -7 : 0, wag, coat, decorated);
  // Back-facing head sits behind shoulders; front-facing head overlaps the scarf.
  const drawHead = () => { ctx.save(); ctx.translate(view.hx, view.hy + bob * .55); ctx.rotate(Math.sin(phase) * .018 * stride); if (view.profile) ctx.scale(.88, 1); head(ctx, coat, view.profile, view.rear, decorated, options); ctx.restore(); };
  if (view.rear) drawHead();
  ellipse(ctx, view.bx, view.by + bob, view.rx, view.ry);
  ctx.fillStyle = gradient(ctx, coat, view.bx - 3, view.by - 5, view.rx + 10); ctx.fill(); ctx.strokeStyle = coat.ink; ctx.lineWidth = 1.7; ctx.stroke();
  if (decorated) { ctx.save(); ctx.clip(); stars(ctx, view.bx - 4, view.by - 6 + bob); ctx.restore(); }
  drawLeg(2); drawLeg(3);
  if (decorated) {
    const sx = view.hx, sy = view.hy + (view.rear ? 14 : 17) + bob;
    ctx.save(); ctx.translate(sx, sy);
    const scarf = ctx.createLinearGradient(-18, -6, 16, 5); scarf.addColorStop(0, "#9ca4e5"); scarf.addColorStop(.5, "#55549b"); scarf.addColorStop(1, "#28517a");
    ctx.fillStyle = scarf; ctx.strokeStyle = coat.ink; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-17, -8); ctx.quadraticCurveTo(-27, -11 + wag * 10, -26, -3); ctx.lineTo(-19, 4); ctx.lineTo(-27, 5); ctx.quadraticCurveTo(-15, 16, 1, 6); ctx.quadraticCurveTo(17, 9, 20, -7); ctx.quadraticCurveTo(2, 0, -17, -8); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#a1d5e7"; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(-19, 1); ctx.quadraticCurveTo(0, 10, 16, -2); ctx.stroke();
    if (!view.rear) { ctx.fillStyle = "#253950"; ellipse(ctx, 3, 6, 3.8, 4); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#d3f3ff"; crescent(ctx, 3, 6, 2.2); }
    ctx.restore();
  }
  if (!view.rear) drawHead();
  else tail(ctx, front ? 1 : -24, front ? 10 : 9, wag + (front ? .28 : 0), coat, decorated);
  if (options.holdingLantern && decorated && !view.rear) {
    const x = view.hx + (view.profile ? 11 : 2), y = view.hy + 12;
    ctx.strokeStyle = coat.ink; ctx.lineWidth = 1; ellipse(ctx, x, y, 2, 2); ctx.stroke();
    ctx.fillStyle = "#9be7e5"; ctx.beginPath(); ctx.roundRect(x - 3, y + 2, 6, 7, 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}
