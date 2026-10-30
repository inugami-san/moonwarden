import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { drawCatCharacter } from "../app/cat-character.ts";
import { drawCatConsumption } from "../app/cat-devour.ts";

function context(alpha = 1) {
  const stack = [];
  return {
    globalAlpha: alpha, images: [], depth: 0,
    save() { this.depth++; stack.push(this.globalAlpha); },
    restore() { this.depth--; this.globalAlpha = stack.pop(); },
    getTransform() { return { a: 2, b: 0, c: 0, d: 2 }; },
    setTransform() {}, clearRect() {},
    drawImage(...args) { this.images.push({ args, alpha: this.globalAlpha }); },
  };
}

test("opaque characters draw back accessory, body and front accessory with balanced canvas state", () => {
  const target = context(), order = [];
  drawCatCharacter(target, {
    drawAccessory(ctx, layer) { assert.equal(ctx, target); order.push(layer); },
    drawBody(ctx) { assert.equal(ctx, target); order.push("BODY"); },
  });
  assert.deepEqual(order, ["BACK", "BODY", "FRONT"]);
  assert.equal(target.depth, 0);
  assert.equal(target.images.length, 0, "opaque characters require no composition canvas");
  assert.throws(() => drawCatCharacter(target, { drawBody() { throw new Error("paint"); } }), /paint/);
  assert.equal(target.depth, 0);
});

test("anonymous silhouettes never paint accessories, including partial visibility fades", () => {
  const target = context(.42), order = [];
  drawCatCharacter(target, {
    concealed: true,
    drawAccessory() { assert.fail("concealment must hide every cosmetic layer"); },
    drawBody(ctx) { order.push(ctx.globalAlpha); },
  });
  assert.deepEqual(order, [.42]);
  assert.equal(target.depth, 0);
  assert.equal(target.images.length, 0);
});

test("mist fades the assembled character exactly once and reuses a bounded offscreen surface", t => {
  const original = globalThis.document;
  const painted = context(), canvas = { width: 0, height: 0, getContext: () => painted };
  let allocations = 0;
  globalThis.document = { createElement(tag) { assert.equal(tag, "canvas"); allocations++; return canvas; } };
  t.after(() => { if (original === undefined) delete globalThis.document; else globalThis.document = original; });
  const target = context(.35), order = [];
  const layers = {
    drawAccessory(ctx, layer) { assert.equal(ctx, painted); assert.equal(ctx.globalAlpha, 1); order.push(layer); },
    drawBody(ctx) { assert.equal(ctx, painted); assert.equal(ctx.globalAlpha, 1); order.push("BODY"); },
  };
  drawCatCharacter(target, layers);
  drawCatCharacter(target, layers);
  assert.deepEqual(order, ["BACK", "BODY", "FRONT", "BACK", "BODY", "FRONT"]);
  assert.equal(allocations, 1);
  assert.equal(canvas.width, 384); assert.equal(canvas.height, 384);
  assert.equal(painted.depth, 0);
  assert.equal(target.images.length, 2);
  for (const image of target.images) {
    assert.equal(image.alpha, .35);
    assert.deepEqual(image.args, [canvas, -96, -112, 192, 192]);
  }
  assert.equal(target.globalAlpha, .35);
});

test("devour accessories receive separate passes with matching body gait and remain hidden for anonymous kills", () => {
  const state = { globalAlpha: 1 };
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => ({ addColorStop() {} });
      return () => {};
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  const event = { x: 45, y: 0, startX: 0, startY: 0, killerColor: "#20d8ed", victimColor: "#ff5d9e" };
  const calls = [];
  drawCatConsumption(ctx, event, .4, { drawHat(target, direction, phase, amount, layer) { calls.push({ target, direction, phase, amount, layer }); } });
  assert.deepEqual(calls.map(call => call.layer), ["BACK", "FRONT"]);
  assert.equal(calls[0].target, calls[1].target);
  for (const key of ["direction", "phase", "amount"]) assert.equal(calls[0][key], calls[1][key]);
  drawCatConsumption(ctx, event, .4, { concealed: true, drawHat() { assert.fail("anonymous captures cannot reveal the killer's cosmetic"); } });
});

test("wardrobe, lobby and solo use the canonical catalog while live rendering keeps original visibility gates", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /import \{ DEFAULT_HAT, HAT_IDS, HAT_META, normalizeHat \} from "\.\.\/server\/cosmetics"/);
  assert.doesNotMatch(source, /const HATS\b|const HAT_META\b/);
  assert.equal((source.match(/\{HAT_IDS\.map\(/g) ?? []).length, 2, "both customization menus include new accessories");
  const renderer = source.slice(source.indexOf("  drawSlime("), source.indexOf("  drawHat("));
  assert.ok(renderer.indexOf("if (silhouette)") < renderer.indexOf("drawCatCharacter(ctx"));
  assert.match(renderer, /visibilityAlpha \* identityAlpha/);
  assert.match(source, /setSelectedHat\(normalizeHat\(own.hat\)\)/);
});
