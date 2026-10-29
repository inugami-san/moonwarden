import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { applyPawTransform, bodyPose, idleBodyPose, fitPawPose, measurePaws, movingHip, pawPose, PAW_SWING_FRACTION } from "../app/cat-walk-rig.ts";

test("body follow-through is bounded, continuous and fades to neutral without jelly scale", () => {
  let previous = bodyPose(0, 1);
  for (let i = 0; i <= 2000; i++) {
    const p = bodyPose(i / 2000 * Math.PI * 2, 1);
    assert.ok(Math.abs(p.x) <= .3 && p.y >= -.7 && p.y <= 0);
    assert.ok(Math.abs(p.lean) <= .01);
    for (const key of Object.keys(p)) assert.ok(Math.abs(p[key] - previous[key]) < .01);
    previous = p;
  }
  for (const phase of [0, 1, 3, 5, NaN]) {
    for (const value of Object.values(bodyPose(phase, 0))) assert.equal(Math.abs(value), 0);
    assert.ok(Object.values(bodyPose(phase, Infinity)).every(Number.isFinite));
  }
  assert.doesNotMatch(JSON.stringify(bodyPose(1, 1)), /scale/);
});

test("shoulder bob never changes the paw's previously approved ground trajectory", () => {
  for (let i = 0; i <= 100; i++) {
    const phase = i / 100 * Math.PI * 2, body = bodyPose(phase, .8);
    const { lift, reach } = pawPose(phase, .8, 0, false, false);
    const x = 14, y = 11, h = 17, hip = movingHip(x, y, body);
    const shear = (x + reach - hip.x) / h, sy = (y + h - lift - hip.y) / h;
    assert.ok(Math.abs(hip.x + shear * h - (x + reach)) < 1e-10);
    assert.ok(Math.abs(hip.y + sy * h - (y + h - lift)) < 1e-10);
    assert.ok(sy > .65 && sy < 1.15);
  }
});

test("resting breath is subtle, continuous and neutral when omitted or walking", () => {
  assert.deepEqual(idleBodyPose(), { x: 0, y: -0, lean: 0 });
  assert.deepEqual(idleBodyPose(NaN), idleBodyPose(0));
  let previous = idleBodyPose(0);
  for (let i = 0; i <= 1000; i++) {
    const phase = i / 1000 * Math.PI * 2, pose = idleBodyPose(phase);
    assert.ok(pose.y >= -.36 && pose.y <= 0 && Math.abs(pose.lean) <= .003);
    assert.ok(Math.abs(previous.y - pose.y) < .003);
    assert.ok(Object.values(idleBodyPose(phase, 1)).every(v => Math.abs(v) === 0));
    previous = pose;
  }
});

test("narrow paws have smooth bounded reach rather than sharp clipping or torn joints", () => {
  const narrow = fitPawPose({ lift: 3.8, reach: 6.5 }, 7, 9);
  assert.ok(narrow.reach <= 7 * .42 && narrow.lift <= 9 * .3);
  assert.deepEqual(fitPawPose({ lift: 3.2, reach: -6.5 }, 24, 17), { lift: 3.2, reach: -6.5 });
  let previous = fitPawPose(pawPose(0, 1, 0, false, false), 7, 9);
  for (let i = 1; i <= 1000; i++) {
    const pose = fitPawPose(pawPose(i / 1000 * Math.PI * 2, 1, 0, false, false), 7, 9);
    assert.ok(Math.abs(pose.reach - previous.reach) < .05 && Math.abs(pose.lift - previous.lift) < .07);
    previous = pose;
  }
  assert.ok(Object.values(fitPawPose({ lift: 0, reach: 0 }, NaN, Infinity)).every(Number.isFinite));
});

test("paw segmentation only measures below the hip, excluding eyes, scarf and tail", () => {
  const tile = 192, data = new Uint8ClampedArray(tile * tile * 4);
  const mark = (left, right, top, bottom) => { for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) data[(y * tile + x) * 4 + 3] = 255; };
  mark(10, 160, 20, 120); // Head, body, collar: must not count as a paw.
  mark(48, 62, 129, 158); mark(94, 112, 129, 158); mark(130, 144, 129, 158);
  const regions = measurePaws(data, tile, 0);
  assert.equal(regions.length, 3);
  assert.ok(regions.every(r => r.top >= 129 && r.bottom <= 160 && r.right > r.left));
  for (let i = 1; i < regions.length; i++) assert.ok(regions[i - 1].right <= regions[i].left);
});

test("no detected paws is a safe frame-animation fallback, not missing legs", () => {
  assert.deepEqual(measurePaws(new Uint8ClampedArray(192 * 192 * 4), 192, 0), []);
});

test("side profiles keep overlapping cuff and paw silhouettes intact", () => {
  const tile = 192, data = new Uint8ClampedArray(tile * tile * 4);
  for (let y = 129; y < 158; y++) for (let x = 30; x < 145; x++) {
    if (x < 76 || x >= 96) data[(y * tile + x) * 4 + 3] = 255;
  }
  const paired = measurePaws(data, tile, 0, tile, false);
  assert.equal(paired.length, 2, "do not create artificial joints through connected paws");
  assert.ok(paired[0].left < 30 && paired[0].right >= 76);
  assert.ok(paired[1].left <= 96 && paired[1].right > 144);
  assert.equal(measurePaws(data, tile, 0).length, 4, "angled-view behavior remains available");
});

test("paw motion is continuous at swing, contact and cycle boundaries", () => {
  for (const front of [true, false]) for (const mirror of [true, false]) {
    let last = pawPose(0, 1, 0, front, mirror);
    for (let i = 1; i <= 2000; i++) {
      const pose = pawPose(i / 2000 * Math.PI * 2, 1, 0, front, mirror);
      assert.ok(Math.abs(pose.lift - last.lift) < .05);
      assert.ok(Math.abs(pose.reach - last.reach) < .055);
      assert.ok(pose.lift >= 0 && pose.lift <= 3.8);
      assert.ok(Math.abs(pose.reach) <= 6.5);
      last = pose;
    }
    const start = pawPose(0, 1, 0, front, mirror);
    assert.ok(Math.abs(start.lift - last.lift) < 1e-10 && Math.abs(start.reach - last.reach) < 1e-10);
  }
});

test("opposite paws alternate and eased stops converge to the identical painted resting pose", () => {
  const peak = Math.PI * PAW_SWING_FRACTION;
  assert.ok(pawPose(peak, 1, 0, false, false).lift > 2.7);
  assert.equal(pawPose(peak, 1, 1, false, false).lift, 0);
  for (const phase of [0, .3, 1.5, 3, 5, 6]) {
    const resting = pawPose(phase, 0, 0, false, false);
    assert.equal(Math.abs(resting.lift), 0); assert.equal(Math.abs(resting.reach), 0);
    const small = pawPose(phase, .001, 0, false, false);
    assert.ok(small.lift < .004 && Math.abs(small.reach) <= .0065 + 1e-10);
  }
  const invalid = pawPose(NaN, Infinity, 0, false, false);
  assert.ok(Object.values(invalid).every(Number.isFinite));
});

test("four-beat footfalls keep at least two supporting paws and usually three", () => {
  let tripleSupport = 0;
  const peaks = new Set();
  for (let i = 0; i < 1000; i++) {
    const phase = i / 1000 * Math.PI * 2;
    const poses = [0, 1, 2, 3].map(index => pawPose(phase, 1, index, false, false));
    const planted = poses.filter(pose => pose.lift < 1e-10).length;
    assert.ok(planted >= 2, "the body never has an unsupported airborne frame");
    if (planted >= 3) tripleSupport++;
    poses.forEach((pose, index) => { if (pose.lift > 2.799) peaks.add(index); });
  }
  assert.ok(tripleSupport > 800, "long support strokes read as a walk rather than paired stomps");
  assert.equal(peaks.size, 4, "each painted paw takes its own turn");
});

test("toe-off and touchdown match stance velocity and acceleration without a pause", () => {
  const tau = Math.PI * 2, h = 1e-4;
  for (const phase of [0, PAW_SWING_FRACTION * tau, tau]) {
    const before = pawPose(phase - h, 1, 0, false, false);
    const at = pawPose(phase, 1, 0, false, false);
    const after = pawPose(phase + h, 1, 0, false, false);
    const leftVelocity = (at.reach - before.reach) / h;
    const rightVelocity = (after.reach - at.reach) / h;
    assert.ok(Math.abs(leftVelocity - rightVelocity) < .001);
    assert.ok(leftVelocity < -2.6 && leftVelocity > -2.7, "support foot travels backward steadily, rather than easing to a slippery stop");
    assert.ok(Math.abs((after.reach - 2 * at.reach + before.reach) / (h * h)) < .05);
    assert.ok(Math.abs((after.lift - 2 * at.lift + before.lift) / (h * h)) < .001);
  }
});

test("painted-leg Canvas transforms pin every supporting toe despite shoulder movement", () => {
  for (let frame = 0; frame < 120; frame++) for (let index = 0; index < 4; index++) {
    const phase = frame / 120 * Math.PI * 2;
    const paw = fitPawPose(pawPose(phase, .85, index, false, false), 13, 17);
    const calls = [];
    const ctx = { translate: (...values) => calls.push(["translate", ...values]), transform: (...values) => calls.push(["transform", ...values]) };
    applyPawTransform(ctx, 14, 11, 17, bodyPose(phase, .85), paw);
    assert.deepEqual(calls.map(call => call[0]), ["translate", "transform"]);
    const [, hipX, hipY] = calls[0], [, a, b, c, d, tx, ty] = calls[1];
    assert.equal(a, 1); assert.equal(b, 0); assert.equal(tx, 0); assert.equal(ty, 0);
    assert.ok(Math.abs(hipX + c * 17 - (14 + paw.reach)) < 1e-10);
    assert.ok(Math.abs(hipY + d * 17 - (28 - paw.lift)) < 1e-10);
    if (paw.lift === 0) assert.ok(Math.abs(hipY + d * 17 - 28) < 1e-10, "a support foot never inherits the torso bob");
    assert.ok(calls.flat().filter(value => typeof value === "number").every(Number.isFinite));
  }
});

test("live walk uses cached body plates and transforms rather than crossfading ghost paws", async () => {
  const source = await readFile(new URL("../app/mooncat-sprites.ts", import.meta.url), "utf8");
  const live = source.slice(source.indexOf("export function drawMooncatSprite"));
  assert.match(live, /target\.drawImage\(paintedBody/);
  assert.match(live, /pawPose\(/);
  assert.doesNotMatch(live, /getImageData|putImageData|globalAlpha\s*=/);
  assert.match(live, /if \(!fadingRig\)/, "one shared fog-compositing buffer, not an actor/frame allocation");
  assert.match(source, /CACHE_LIMIT = 12/);
});
