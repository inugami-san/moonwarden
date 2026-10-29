export type PawRegion = { left: number; right: number; top: number; bottom: number };

export function bodyPose(phase: number, amount: number) {
  const s = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0;
  const p = Number.isFinite(phase) ? phase : 0;
  // A supported shoulder transfer, not a whole-body hop. The paw endpoints are
  // solved separately below, so even this small torso motion cannot lift them.
  return { x: Math.sin(p) * .3 * s, y: -(1 - Math.cos(p * 2)) * .35 * s,
    lean: Math.sin(p) * .01 * s };
}

/** A tiny shoulder breath while resting. Zero/omitted phase is deliberately
 * neutral so reduced-motion callers need no extra renderer branch. */
export function idleBodyPose(phase = 0, strideAmount = 0) {
  const p = Number.isFinite(phase) ? phase : 0;
  const resting = 1 - (Number.isFinite(strideAmount) ? Math.max(0, Math.min(1, strideAmount)) : 0);
  return { x: 0, y: -(1 - Math.cos(p)) * .18 * resting, lean: Math.sin(p) * .003 * resting };
}

/** Thin, projected paws must not shear sideways farther than their own width.
 * Broad front cuffs retain the established reach; only narrow feet are limited. */
export function fitPawPose(pose: { lift: number; reach: number }, width: number, height: number) {
  const w = Number.isFinite(width) ? Math.max(0, width) : 0;
  const h = Number.isFinite(height) ? Math.max(0, height) : 0;
  const maxReach = Math.min(6.5, w * .42);
  return { lift: pose.lift * Math.min(1, h * .3 / 3.8), reach: pose.reach * maxReach / 6.5 };
}

/** Move the shoulder with the torso, while retaining the paw's original ground
 * trajectory. The feet never inherit the body bob or sway. */
export function movingHip(x: number, y: number, pose: ReturnType<typeof bodyPose>) {
  const c = Math.cos(pose.lean), s = Math.sin(pose.lean);
  return { x: pose.x + c * x - s * (y - 8), y: 8 + pose.y + s * x + c * (y - 8) };
}

/** Attach the original painted leg at its moving hip while solving its toe
 * against the ground trajectory. No torso scale leaks into the planted paw. */
export function applyPawTransform(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, body: ReturnType<typeof bodyPose>, paw: { lift: number; reach: number }) {
  const hip = movingHip(x, y, body);
  const h = Number.isFinite(height) && height > 0 ? height : 1;
  ctx.translate(hip.x, hip.y);
  ctx.transform(1, 0, (x + paw.reach - hip.x) / h, (y + h - paw.lift - hip.y) / h, 0, 0);
}

/** Measure separated painted paws below the belly, once per heading at load.
 * Nothing above the hip line (face, scarf, torso) is included in the rig. */
export function measurePaws(data: Uint8ClampedArray, width: number, column: number, tile = 192, splitOverlaps = true): PawRegion[] {
  const top = Math.round(tile * .672), bottom = Math.round(tile * .833);
  const counts = new Uint16Array(tile);
  for (let x = 0; x < tile; x++) for (let y = Math.round(tile * .735); y < bottom; y++) {
    if (data[(y * width + column * tile + x) * 4 + 3] > 96) counts[x]++;
  }
  const runs: { left: number; right: number }[] = [];
  for (let x = 0; x < tile; x++) {
    if (counts[x] < 2) continue;
    const last = runs.at(-1);
    if (last && x - last.right < 2) last.right = x + 1;
    else runs.push({ left: x, right: x + 1 });
  }
  const split = runs.filter(r => r.right - r.left >= 4).flatMap(r => {
    // Side-view paws overlap in the painting. Keep each connected pair intact
    // instead of slicing through its cuff/toes and moving the halves apart.
    if (!splitOverlaps || r.right - r.left < tile * .2) return [r];
    // Two paws may overlap in the projection. Split at the narrowest ankle gap.
    let cut = Math.round((r.left + r.right) / 2), min = Infinity;
    for (let x = r.left + 9; x < r.right - 9; x++) {
      const score = counts[x] + Math.abs(x - (r.left + r.right) / 2) * .25;
      if (score < min) { min = score; cut = x; }
    }
    return [{ left: r.left, right: cut }, { left: cut, right: r.right }];
  });
  if (split.length < 2 || split.length > 4) return [];
  return split.map((r, i) => ({
    left: Math.max(i ? split[i - 1].right : 0, r.left - 1),
    right: Math.min(i < split.length - 1 ? split[i + 1].left : tile, r.right + 1),
    top, bottom,
  }));
}

export const PAW_SWING_FRACTION = .28;
const PAW_PHASE_OFFSETS = [0, .5, .25, .75] as const;
const TAU = Math.PI * 2;
const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** A four-beat walk spends 72% of each paw's cycle on the ground. The support
 * stroke has constant backward speed; the returning paw matches its velocity
 * and acceleration at both ends instead of pausing/snapping at foot contact.
 * A fourth-power arc also meets the ground with zero vertical acceleration.
 * First two regions remain opposite when a side profile contains two pairs. */
export function pawPose(phase: number, amount: number, index: number, frontFacing: boolean, mirrored: boolean) {
  const strength = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0;
  const leg = Number.isFinite(index) ? ((Math.trunc(index) % 4) + 4) % 4 : 0;
  const p = (Number.isFinite(phase) ? phase / TAU : 0) + PAW_PHASE_OFFSETS[leg];
  const cycle = ((p % 1) + 1) % 1;
  const stance = 1 - PAW_SWING_FRACTION;
  let lift = 0, reachUnit: number;
  if (cycle < PAW_SWING_FRACTION) {
    const t = cycle / PAW_SWING_FRACTION;
    const contactVelocity = -2 * PAW_SWING_FRACTION / stance;
    reachUnit = -1 + contactVelocity * t + (2 - contactVelocity) * smootherstep(t);
    lift = Math.sin(Math.PI * t) ** 4 * strength * (frontFacing ? 3.2 : 2.8);
  } else {
    reachUnit = 1 - 2 * (cycle - PAW_SWING_FRACTION) / stance;
  }
  const reach = reachUnit * strength * (frontFacing ? .6 : 6) * (mirrored ? -1 : 1);
  return { lift, reach };
}
