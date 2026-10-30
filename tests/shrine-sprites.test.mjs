import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { drawShrineSprite, loadShrineSprites, shrineFrames, shrineKind, shrineSpritesReady, shrineState } from "../app/shrine-sprites.ts";
import { drawForestSanctum, drawSanctumStatus, sanctumPulse } from "../app/sanctum-art.ts";

const station = Object.freeze({ x: 300, y: 180, pulse: 1.2, completed: false, label: "STAR ALTAR", reward: "SONAR" });

function atlas() {
  const width = 300, height = 200, pixels = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < 2; row++) for (let column = 0; column < 3; column++) {
    for (let y = row * 100 + (row ? 10 : 30); y < row * 100 + 90; y++) for (let x = column * 100 + 20; x < column * 100 + 80; x++) pixels[(y * width + x) * 4 + 3] = 255;
  }
  return { width, height, pixels };
}

function canvas() {
  const state = { globalAlpha: 1 }, stack = [], calls = [];
  const ctx = new Proxy(state, {
    get(_, key) {
      if (key === "save") return () => stack.push({ ...state });
      if (key === "restore") return () => { const previous = stack.pop(); assert.ok(previous); for (const k of Object.keys(state)) delete state[k]; Object.assign(state, previous); };
      if (key in state) return state[key];
      return (...args) => {
        for (const arg of args) if (typeof arg === "number") assert.ok(Number.isFinite(arg));
        calls.push([key, ...args]);
      };
    },
    set(_, key, value) { state[key] = value; return true; },
  });
  return { ctx, stack, state, calls };
}

test("three shrine sculptures map to existing rewards without changing task ownership", () => {
  assert.equal(shrineKind("SONAR"), "SUNDIAL");
  assert.equal(shrineKind("FLASHLIGHT"), "BASIN");
  assert.equal(shrineKind("FLARE"), "TOTEM");
  assert.deepEqual(shrineState(station, false), { kind: "SUNDIAL", active: false, locked: false });
  assert.equal(shrineState({ ...station, teamRestored: true }, false).active, true);
  assert.equal(shrineState({ ...station, completed: true }, false).active, true);
  assert.equal(shrineState({ ...station, completed: true, teamRestored: true }, true).active, false);
  assert.equal(station.completed, false);
});

test("inactive and activated artwork share a crop and scale without a completion size jump", () => {
  const { width, height, pixels } = atlas();
  const frames = shrineFrames(pixels, width, height);
  assert.equal(frames.length, 3);
  for (let column = 0; column < 3; column++) {
    const [inactive, active] = frames[column];
    assert.equal(inactive.source.x, active.source.x);
    assert.equal(active.source.y - inactive.source.y, 100);
    assert.equal(inactive.width, active.width); assert.equal(inactive.height, active.height);
    assert.ok(inactive.source.x >= column * 100 && inactive.source.x + inactive.source.w <= (column + 1) * 100);
    assert.ok(inactive.top <= 10 && inactive.height >= 80, "active upper detail is included in both registrations");
  }
  assert.throws(() => shrineFrames(new Uint8ClampedArray(width * height * 4), width, height), /Missing shrine artwork/);
});

test("solid sculpture ground ignores low-alpha glow and compensates row offsets", () => {
  const { width, height, pixels } = atlas();
  // Move the active baselines upwards while filling their cells with soft glow.
  for (let y = 100; y < 200; y++) for (let x = 0; x < 300; x++) pixels[(y * width + x) * 4 + 3] = 100;
  for (let column = 0; column < 3; column++) for (let y = 110; y < 182; y++) for (let x = column * 100 + 20; x < column * 100 + 80; x++) pixels[(y * width + x) * 4 + 3] = 255;
  const frames = shrineFrames(pixels, width, height);
  for (const [off, on] of frames) {
    assert.equal(off.groundY - on.groundY, 8);
    assert.equal(off.modelWidth, on.modelWidth); assert.equal(off.modelHeight, on.modelHeight);
    assert.ok(on.modelWidth < on.width, "halo pixels must not shrink the solid model");
    for (const frame of [off, on]) {
      const scale = Math.min(106 / frame.modelWidth, 112 / frame.modelHeight);
      const y = 30 + (frame.top - frame.groundY) * scale;
      assert.ok(Math.abs(y + (frame.groundY - frame.top) * scale - 30) < 1e-9, "solid base stays on y+30 in both states");
    }
  }
});

test("production atlas has six transparent sculptures with registered solid bases", async () => {
  const png = await readFile(new URL("../public/art/shrines/celestial-shrines-v1.png", import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png[24], 8); assert.equal(png[25], 6);
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20), chunks = [];
  for (let p = 8; p < png.length;) {
    const length = png.readUInt32BE(p);
    if (png.subarray(p + 4, p + 8).toString() === "IDAT") chunks.push(png.subarray(p + 8, p + 8 + length));
    p += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * 4, rgba = new Uint8ClampedArray(stride * height);
  const paeth = (a, b, c) => { const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c); return x <= y && x <= z ? a : y <= z ? b : c; };
  let clear = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    assert.ok(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? rgba[y * stride + x - 4] : 0, b = y ? rgba[(y - 1) * stride + x] : 0, c = y && x >= 4 ? rgba[(y - 1) * stride + x - 4] : 0;
      rgba[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + (filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : paeth(a, b, c))) & 255;
    }
    for (let x = 0; x < width; x++) if (rgba[(y * width + x) * 4 + 3] < 48) clear++;
  }
  assert.ok(clear > width * height * .05, "not a flattened opaque backdrop");
  const frames = shrineFrames(rgba, width, height);
  for (let column = 0; column < 3; column++) {
    const [off, on] = frames[column];
    assert.ok(off.groundY > on.groundY && off.groundY - on.groundY < 48, "actual generated row offset is detected");
    for (let row = 0; row < 2; row++) {
      const f = frames[column][row];
      assert.ok(f.modelWidth > 150 && f.modelHeight > 300);
      assert.ok(f.source.x >= column * width / 3 && f.source.x + f.source.w <= (column + 1) * width / 3);
      assert.ok(f.source.y >= row * height / 2 && f.source.y + f.source.h <= (row + 1) * height / 2, "never samples neighboring cell artwork");
      const scale = Math.min(106 / f.modelWidth, 112 / f.modelHeight);
      assert.ok(Math.abs(30 + (f.top - f.groundY) * scale + (f.groundY - f.top) * scale - 30) < 1e-9);
    }
  }
});

test("loading safely declines during SSR and keeps the procedural fallback available", async () => {
  assert.equal(await loadShrineSprites(), false);
  assert.equal(shrineSpritesReady(), false);
  assert.equal(drawShrineSprite({}, station, 0, false, false), false);
});

test("one atlas request and glow bake serve all shrine states with balanced Canvas state", async t => {
  const originalWindow = globalThis.window, originalImage = globalThis.Image, originalDocument = globalThis.document;
  const { width, height, pixels } = atlas();
  let requests = 0, reads = 0, glows = 0;
  globalThis.window = {};
  class ImageMock {
    naturalWidth = width; naturalHeight = height;
    set src(value) { assert.match(value, /celestial-shrines-v1\.png$/); requests++; queueMicrotask(() => this.onload()); }
  }
  globalThis.Image = ImageMock;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({
    drawImage() {}, getImageData() { reads++; return { data: pixels }; },
    createRadialGradient() { glows++; return { addColorStop() {} }; }, fillRect() {},
  }) }) };
  t.after(() => { globalThis.window = originalWindow; globalThis.Image = originalImage; globalThis.document = originalDocument; });
  const first = loadShrineSprites(); assert.equal(first, loadShrineSprites());
  assert.equal(await first, true); assert.equal(shrineSpritesReady(), true);
  assert.equal(requests, 1); assert.equal(reads, 1); assert.equal(glows, 3);
  for (const reward of ["SONAR", "FLASHLIGHT", "FLARE"]) for (const completed of [false, true]) for (const teamRestored of [false, true]) for (const locked of [false, true]) {
    const target = Object.freeze({ ...station, reward, completed, teamRestored });
    const recorder = canvas();
    assert.equal(drawShrineSprite(recorder.ctx, target, 20, locked, true), true);
    assert.equal(recorder.stack.length, 0); assert.deepEqual(recorder.state, { globalAlpha: 1 });
    const sprite = recorder.calls.find(([method, image]) => method === "drawImage" && image instanceof ImageMock);
    assert.ok(sprite);
    const active = !locked && (completed || teamRestored);
    assert.equal(sprite[3] >= 100, active, "locked art always uses the unlit source row");
    assert.equal(recorder.calls.filter(([method]) => method === "drawImage").length, active ? 3 : 1, "glow textures appear only for active shrines");
    assert.equal(target.completed, completed);
  }
  const a = canvas(), b = canvas();
  drawShrineSprite(a.ctx, { ...station, completed: true }, 20, false, false);
  drawShrineSprite(b.ctx, { ...station, completed: true }, 21, false, false);
  assert.deepEqual(a.calls, b.calls, "completed shrine glow is steady after the short completion cue");
  assert.equal(reads, 1); assert.equal(glows, 3, "render loop never reads pixels or rebuilds gradients");
});

test("render path uses cached image/glow blits and never grants visibility", async () => {
  const source = await readFile(new URL("../app/shrine-sprites.ts", import.meta.url), "utf8");
  const draw = source.slice(source.indexOf("export function drawShrineSprite"));
  assert.doesNotMatch(draw, /getImageData|putImageData|createRadialGradient|createLinearGradient|createElement/);
  assert.doesNotMatch(source, /shadowBlur|setInterval|requestAnimationFrame|players|canSee/);
});

test("live shrine wrapper keeps activation and its pulse with a small text-free completion marker", () => {
  const target = Object.freeze({ ...station, completed: true, teamRestored: true, completedAt: 10 });
  const recorder = canvas();
  drawForestSanctum(recorder.ctx, target, 10.25, false, true);
  drawSanctumStatus(recorder.ctx, target, 10.25, false, false);
  assert.equal(recorder.calls.filter(([method]) => method === "drawImage").length, 3);
  assert.ok(recorder.calls.some(([method, x, y, radius]) => method === "arc" && x === 0 && y === 0 && radius === sanctumPulse(10.25, 10).radius));
  assert.ok(recorder.calls.some(([method, x, y, radius]) => method === "arc" && x === 0 && radius === 10 && y < -85), "checkmark stays above taller shrine artwork");
  assert.ok(!recorder.calls.some(([method]) => method === "fillText" || method === "strokeText"), "no distant text survives the art-ready branch");
  assert.equal(recorder.stack.length, 0); assert.deepEqual(recorder.state, { globalAlpha: 1 });
});
