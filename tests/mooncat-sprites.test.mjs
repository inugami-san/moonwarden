import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { MOONCAT_ATLAS_URL, SPRITE_DIRECTIONS, atlasRows, spriteRegistration, loadMooncatSprites, drawMooncatSprite, spriteFrame } from "../app/mooncat-sprites.ts";
import { sampleCatGait } from "../app/cat-art.ts";

test("every walk pose registers its planted paw to the same ground line", () => {
  for (const bottom of [170, 181, 194, 203]) {
    for (const torso of [82, 95, 111]) {
      const anchor = spriteRegistration(torso, bottom, .78);
      assert.ok(Math.abs(anchor.y + bottom * .78 - 158) < 1e-10);
      assert.ok(Math.abs(anchor.x + torso * .78 - 96) < 1e-10);
    }
  }
});

test("gaze and blocked input do not keep stationary paws walking", () => {
  sampleCatGait("blocked-paws", 150, 0, 1, 0, 0, false, { x: 100, y: 100 });
  for (let i = 1; i <= 60; i++) sampleCatGait("blocked-paws", 150, 0, 1, 0, i / 60, false, { x: 100, y: 100 });
  const stopped = sampleCatGait("blocked-paws", 150, 0, 1, 0, 61 / 60, false, { x: 100, y: 100 });
  assert.equal(stopped.strideAmount, 0);
  const held = sampleCatGait("blocked-paws", 0, 0, 1, 1, 62 / 60, false, { x: 100, y: 100 });
  assert.equal(held.stridePhase, stopped.stridePhase);
});

test("gait travels one cycle per 112 world units regardless of frame rate or speed", () => {
  const phases = [];
  for (const fps of [30, 60, 144]) {
    const id = `grounded-${fps}`;
    sampleCatGait(id, 0, 0, 0, 0, 0, false, { x: 0, y: 0 });
    let gait;
    for (let frame = 1; frame <= fps; frame++) gait = sampleCatGait(id, 200, 0, 0, 0, frame / fps, false, { x: frame / fps * 56, y: 0 });
    assert.ok(Math.abs(gait.stridePhase - Math.PI) < 1e-10);
    phases.push(gait.stridePhase);
    const reset = sampleCatGait(id, 200, 0, 0, 0, 1 + 1 / fps, false, { x: 1000, y: 0 });
    assert.equal(reset.strideAmount, 0); assert.equal(reset.stridePhase, 0);
  }
  assert.ok(Math.max(...phases) - Math.min(...phases) < 1e-10);
});

test("sprite walking has four phases, remains still at idle and tolerates invalid values", () => {
  assert.deepEqual([0, 1, 2, 3].map(i => spriteFrame(i * Math.PI / 2, 1)), [0, 1, 2, 3]);
  assert.equal(spriteFrame(Math.PI * 2, 1), 0);
  assert.equal(spriteFrame(-Math.PI / 2, 1), 3);
  assert.equal(spriteFrame(3, 0), 0);
  assert.equal(spriteFrame(NaN, 1), 0);
  assert.equal(spriteFrame(1, Infinity), 0);
  assert.equal(new Set(SPRITE_DIRECTIONS).size, 8);
});

test("SSR safely falls back without loading an image or accessing DOM", async () => {
  assert.equal(await loadMooncatSprites(), false);
  assert.equal(drawMooncatSprite({}, {}), false);
});

test("blink uses a cached closed-eye body strip instead of evicting full player appearances", async () => {
  const source = await readFile(new URL("../app/mooncat-sprites.ts", import.meta.url), "utf8");
  const variant = source.slice(source.indexOf("function variant("), source.indexOf("/** Detect the painted amber"));
  assert.doesNotMatch(variant, /eyeStyle = options\.blink/);
  assert.match(variant, /closedBody\.height = TILE/);
  assert.match(variant, /customizeEyes\(closed, "BLINK", TILE\)/);
  const draw = source.slice(source.indexOf("export function drawMooncatSprite"));
  assert.match(draw, /options\.blink \? sprite.closedBody : sprite.body/);
  assert.doesNotMatch(draw, /getImageData|putImageData/);
});

test("production atlas contains 32 nonempty transparent RGBA sprites and distinct walk frames", async () => {
  const png = await readFile(new URL(`../public${MOONCAT_ATLAS_URL}`, import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert.equal(png[24], 8); assert.equal(png[25], 6, "RGBA, not a flattened background");
  assert.ok(width >= 1600 && height >= 800);
  const chunks = [];
  for (let p = 8; p < png.length;) {
    const length = png.readUInt32BE(p), name = png.subarray(p + 4, p + 8).toString();
    if (name === "IDAT") chunks.push(png.subarray(p + 8, p + 8 + length));
    p += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * 4, rgba = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => { const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c); return x <= y && x <= z ? a : y <= z ? b : c; };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? rgba[y * stride + x - 4] : 0, b = y ? rgba[(y - 1) * stride + x] : 0, c = y && x >= 4 ? rgba[(y - 1) * stride + x - 4] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : paeth(a, b, c);
      rgba[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255;
    }
  }
  const counts = Array(height).fill(0);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (rgba[(y * width + x) * 4 + 3] > 48) counts[y]++;
  const rows = atlasRows(counts);
  assert.equal(rows.length, 4);
  for (let column = 0; column < 8; column++) {
    const signatures = [];
    for (let row = 0; row < 4; row++) {
      let solid = 0, transparent = 0, signature = 0;
      for (let y = rows[row].top; y < rows[row].bottom; y++) {
        for (let x = Math.ceil(column * width / 8); x < Math.floor((column + 1) * width / 8); x++) {
          const a = rgba[(y * width + x) * 4 + 3];
          if (a > 128) solid++; if (!a) transparent++;
          signature = (signature * 31 + a) >>> 0;
        }
      }
      assert.ok(solid > 6000, `visible character in cell ${column},${row}`);
      assert.ok(transparent > 5000, `transparent margins in cell ${column},${row}`);
      signatures.push(signature);
    }
    assert.equal(new Set(signatures).size, 4, `distinct walk poses for heading ${column}`);
  }
});
