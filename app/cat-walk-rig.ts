export type PawRegion = { left: number; right: number; top: number; bottom: number };

export function bodyPose(phase: number, amount: number) {
  const s = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0;
  const p = Number.isFinite(phase) ? phase : 0;
  return { x: Math.sin(p) * .55 * s, y: -(1 - Math.cos(p * 2)) * .6 * s,
    lean: Math.sin(p) * .018 * s };
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

/** Continuous, zero-velocity swing/stance transitions. The hip stays fixed;
 * shear moves the paw and shortening lifts it, never stretching the whole cat. */
export function pawPose(phase: number, amount: number, index: number, frontFacing: boolean, mirrored: boolean) {
  const strength = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0;
  const p = (Number.isFinite(phase) ? phase : 0) + index % 2 * Math.PI;
  const swing = Math.max(0, Math.sin(p));
  const lift = swing * swing * strength * (frontFacing ? 3.8 : 3.2);
  const reach = -Math.cos(p) * strength * (frontFacing ? .65 : 6.5) * (mirrored ? -1 : 1);
  return { lift, reach };
}
