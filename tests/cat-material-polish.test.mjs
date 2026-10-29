import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tintCatFur } from "../app/mooncat-sprites.ts";

test("coat polish preserves amber eyes, cool fabric, white stars, ink and every alpha value", () => {
  const original = new Uint8ClampedArray([240, 180, 55, 255, 45, 140, 210, 255, 245, 245, 255, 220, 12, 10, 20, 255, 90, 45, 145, 0]);
  const painted = original.slice(); tintCatFur(painted, "#20d8ed");
  assert.deepEqual(painted, original);
});

test("painted fur keeps shaded volume and gains readable midtones without a neon saturation boost", () => {
  const data = new Uint8ClampedArray([50, 25, 85, 255, 100, 55, 160, 200, 170, 120, 210, 128]);
  tintCatFur(data, "#20d8ed");
  assert.equal(data[3], 255); assert.equal(data[7], 200); assert.equal(data[11], 128);
  const light = offset => (Math.max(...data.slice(offset, offset + 3)) + Math.min(...data.slice(offset, offset + 3))) / 2;
  assert.ok(light(0) < light(4) && light(4) < light(8));
  assert.ok(light(4) > (160 + 55) / 2, "midtones lift, not a flat color overlay");
  assert.ok(data[5] > data[4] && data[6] > data[4], "cyan remains recognizable");
});

test("all anonymous coats remain exactly role/color blind after the material update", () => {
  const original = new Uint8ClampedArray([90, 45, 145, 255, 240, 180, 55, 200]);
  const a = original.slice(), b = original.slice();
  tintCatFur(a, "#20d8ed", true); tintCatFur(b, "#ff5784", true);
  assert.deepEqual(a, b);
  assert.deepEqual([...a], [120, 137, 147, 255, 120, 137, 147, 200]);
});

test("lobby portraits use seated close-ups, adaptive device-pixel backing and one animation loop", async () => {
  const portrait = await readFile(new URL("../app/cat-portrait.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/app-menu.css", import.meta.url), "utf8");
  assert.match(portrait, /pose === "LOBBY".*context.translate\(0, 19\); context.scale\(1.4, 1.4\)/);
  assert.match(portrait, /new ResizeObserver\(resize\)/);
  assert.match(portrait, /observer\?\.disconnect\(\)/);
  assert.match(portrait, /if \(concealed && !shapeDirty\) continue/);
  assert.match(portrait, /if \(requestedArt !== source\) \{\s*requestedArt = source; artReady = false/, "shared art readiness is requested only when the source pose changes");
  assert.match(portrait, /active && requestedArt === source\) \{ artReady = true; shapeDirty = true/, "late art cannot replace the current pose or repaint an unmounted portrait");
  assert.match(portrait, /useLayoutEffect\(\(\) => \{[\s\S]*?appearance\.current = [\s\S]*?requestPaint\.current\?\.\(\)/, "cosmetic changes repaint through the stable lifecycle");
  assert.match(portrait, /\}, \[\]\);/, "canvas observers and shared image subscriptions are mounted once");
  assert.match(page, /eyeStyle=\{p.eyeStyle\} size="md" lobbyPose/);
  assert.match(page, /size="md" lobbyPose animated=\{!motionPaused\} isBot/);
  assert.match(css, /slot-avatar-stage \.slime-avatar \{ width: 76px; height: 76px;/);
});
