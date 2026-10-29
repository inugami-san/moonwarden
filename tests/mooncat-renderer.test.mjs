import test from "node:test";
import assert from "node:assert/strict";
import { drawMooncat, mooncatHatAnchor } from "../app/mooncat-renderer.ts";
import { drawAnimatedCat, sampleCatGait } from "../app/cat-art.ts";
import { EYE_STYLES } from "../server/appearance.ts";

function recorder(alpha = 1) {
  const stack = [], calls = [], state = { globalAlpha: alpha };
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "save") return () => stack.push({ ...target });
      if (key === "restore") return () => {
        assert.ok(stack.length, "balanced state stack");
        const saved = stack.pop();
        for (const key of Object.keys(target)) delete target[key];
        Object.assign(target, saved);
      };
      if (key === "createLinearGradient" || key === "createRadialGradient") return (...args) => {
        assert.ok(args.every(Number.isFinite));
        return { addColorStop: (...stop) => calls.push(["stop", ...stop]) };
      };
      return (...args) => {
        for (const value of args) if (typeof value === "number") assert.ok(Number.isFinite(value));
        if (key === "fill" || key === "stroke") assert.ok(target.globalAlpha <= alpha, "art must not undo fog/visibility fading");
        calls.push([key, ...args]);
      };
    },
    set(target, key, value) { target[key] = value; if (key === "fillStyle" && typeof value === "string") calls.push([key, value]); return true; },
  });
  return { ctx, stack, calls };
}
const base = { color: "#8257cb", direction: "SE", stridePhase: 1.3, strideAmount: .8, blink: false };

test("east and west use a mirrored side muzzle rather than a squashed frontal face", () => {
  const east = recorder(), west = recorder(), diagonal = recorder();
  drawMooncat(east.ctx, { ...base, direction: "EAST" });
  drawMooncat(west.ctx, { ...base, direction: "WEST" });
  drawMooncat(diagonal.ctx, base);
  const isMirror = call => call[0] === "scale" && call[1] === -1 && call[2] === 1;
  assert.equal(west.calls.filter(isMirror).length, 1);
  assert.deepEqual(west.calls.filter(call => !isMirror(call)), east.calls);
  const hasMuzzle = calls => calls.some(call => JSON.stringify(call) === JSON.stringify(["quadraticCurveTo", 23, 8, 18, 10]));
  assert.ok(hasMuzzle(east.calls));
  assert.ok(!hasMuzzle(diagonal.calls));
});

test("whiskers are visible on front/side faces but hidden from rear and anonymous views", () => {
  for (const direction of ["SOUTH", "SE", "SW", "EAST", "WEST", "NORTH", "NE", "NW"]) {
    for (const concealed of [false, true]) {
      const r = recorder();
      drawMooncat(r.ctx, { ...base, direction, concealed });
      const tips = r.calls.filter(call => call[0] === "quadraticCurveTo" && [27, 31].includes(Math.abs(call[3])) && [1, 6, 11].includes(call[4]));
      const count = concealed || ["NORTH", "NE", "NW"].includes(direction) ? 0 : ["EAST", "WEST"].includes(direction) ? 3 : 6;
      assert.equal(tips.length, count, `${direction}, concealed=${concealed}`);
    }
  }
});

test("live cat renderer preserves visibility, physics and canvas state for every direction and eye style", () => {
  assert.equal(drawAnimatedCat, drawMooncat, "gameplay delegates to the shared portrait renderer");
  for (const direction of ["NORTH", "NE", "EAST", "SE", "SOUTH", "SW", "WEST", "NW"]) {
    for (const eyeStyle of EYE_STYLES) {
      for (const flags of [{}, { muted: true }, { concealed: true }]) {
        const { ctx, stack } = recorder(.25);
        const options = Object.freeze({ ...base, direction, eyeStyle, ...flags });
        drawMooncat(ctx, options);
        assert.equal(stack.length, 0);
        assert.deepEqual({ ...ctx }, { globalAlpha: .25 });
      }
    }
  }
});

test("fog silhouettes do not leak coat, eyes, scarf, cuff or lantern", () => {
  const a = recorder(), b = recorder();
  drawMooncat(a.ctx, { ...base, concealed: true, eyeStyle: "STARRY", holdingLantern: true });
  drawMooncat(b.ctx, { ...base, concealed: true, color: "#ff5d9e", eyeStyle: "JOYFUL", blink: true });
  assert.deepEqual(a.calls, b.calls);
});

test("all eight player coat palettes stay distinct and rear views do not reveal eyes", () => {
  const colors = ["#20d8ed", "#95ef45", "#ff5d9e", "#ffd94a", "#a879ff", "#ff9843", "#5ea7ff", "#48e0a4"];
  const palettes = colors.map(color => { const r = recorder(); drawMooncat(r.ctx, { ...base, color }); return JSON.stringify(r.calls.filter(call => call[0] === "stop")); });
  assert.equal(new Set(palettes).size, 8);
  for (const direction of ["NORTH", "NE", "NW"]) {
    const a = recorder(), b = recorder();
    drawMooncat(a.ctx, { ...base, direction, eyeStyle: "ROUND" });
    drawMooncat(b.ctx, { ...base, direction, eyeStyle: "STARRY" });
    assert.deepEqual(a.calls, b.calls);
  }
  assert.deepEqual(mooncatHatAnchor("SW"), { x: -12, y: -33 });
  assert.deepEqual(mooncatHatAnchor("SE"), { x: 12, y: -33 });
});

test("new eye choices are distinct and malformed animation inputs stay finite", () => {
  const variants = EYE_STYLES.map(eyeStyle => { const r = recorder(); drawMooncat(r.ctx, { ...base, eyeStyle }); return JSON.stringify(r.calls); });
  assert.equal(new Set(variants).size, 5);
  const r = recorder();
  drawMooncat(r.ctx, { ...base, stridePhase: NaN, strideAmount: Infinity, tailTilt: NaN });
  assert.equal(r.stack.length, 0);
  sampleCatGait("mooncat-reduced", 150, 0, 0, 0, 1, false);
  const still = sampleCatGait("mooncat-reduced", 150, 0, 0, 0, 1.1, true);
  assert.equal(still.strideAmount, 0);
});
