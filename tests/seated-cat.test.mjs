import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { SEATED_CAT_URL, drawSeatedCat, loadSeatedCat } from "../app/seated-cat-art.ts";

test("seated home cat is a real transparent RGBA asset, not a flattened backdrop", async () => {
  const png = await readFile(new URL(`../public${SEATED_CAT_URL}`, import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert.ok(width >= 700 && height >= 700);
  assert.equal(png[24], 8); assert.equal(png[25], 6);
  const chunks = [];
  for (let p = 8; p < png.length;) {
    const length = png.readUInt32BE(p), name = png.subarray(p + 4, p + 8).toString();
    if (name === "IDAT") chunks.push(png.subarray(p + 8, p + 8 + length));
    p += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * 4, rgba = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => { const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c); return x <= y && x <= z ? a : y <= z ? b : c; };
  let clear = 0, solid = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    assert.ok(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? rgba[y * stride + x - 4] : 0, b = y ? rgba[(y - 1) * stride + x] : 0, c = y && x >= 4 ? rgba[(y - 1) * stride + x - 4] : 0;
      const prediction = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : paeth(a, b, c);
      rgba[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + prediction) & 255;
      if (x % 4 === 3) { if (rgba[y * stride + x] === 0) clear++; if (rgba[y * stride + x] > 200) solid++; }
    }
  }
  assert.ok(clear > width * height * .15, "usable alpha around ears, tail and feet");
  assert.ok(solid > width * height * .15, "a substantial painted subject, not an empty image");
});

test("seated cat loader and renderer safely decline on the server without DOM access", async () => {
  assert.equal(typeof globalThis.window, "undefined");
  assert.equal(await loadSeatedCat(), false);
  assert.equal(drawSeatedCat({}, "#8257cb", "FIERCE"), false);
});

test("seated home pose remains separate from walking gameplay portraits", async () => {
  const portrait = await readFile(new URL("../app/cat-portrait.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(portrait, /pose = "GAMEPLAY"/);
  assert.match(portrait, /if \(pose === "SEATED" \|\| pose === "LOBBY"\)/);
  assert.match(portrait, /drawSeatedCat\(context, color, eyeStyle/);
  assert.match(portrait, /drawWornAccessory\(context, accessory, "SOUTH", false, 0, 0, "SEATED"\)/);
  assert.match(portrait, /direction: "SE"[\s\S]*?walkStyle: "FRAMES"/);
  assert.match(page, /homePose \? "SEATED" : "GAMEPLAY"/);
  assert.match(page, /size="lg" homePose animated=\{!motionPaused\}/);
});

test("home spotlight is larger than actor avatars without changing gameplay sizing", async () => {
  const source = await readFile(new URL("../app/app-menu.css", import.meta.url), "utf8");
  assert.match(source, /\.game-menu-shell\.moon-studio \.studio-view-warden \.is-you \.slime-avatar \{ width: min\(40vh, 330px\); height: min\(40vh, 330px\); \}/);
  assert.match(source, /\.game-menu-shell\.moon-studio \.studio-view-warden \.is-you \.slime-avatar \{ width: 40vh; height: 40vh; \}/);
});

test("home animation caps paints at 30fps, sleeps when hidden and cleans up every subscription", async () => {
  const source = await readFile(new URL("../app/cat-portrait.tsx", import.meta.url), "utf8");
  const live = source.slice(source.indexOf("export function SlimePortrait"), source.indexOf("export function LegacySlimePortrait"));
  assert.match(live, /now - lastPaint < 1000 \/ 30/);
  assert.match(live, /if \(document.hidden \|\| !visible\) return/);
  assert.match(live, /prefers-reduced-motion: reduce/);
  assert.match(live, /if \(animate \|\| \(pose !== "GAMEPLAY" && animated && !reduced.matches\)\) frame = requestAnimationFrame/);
  assert.match(live, /document.addEventListener\("visibilitychange", restart\)/);
  assert.match(live, /document.removeEventListener\("visibilitychange", restart\)/);
  assert.match(live, /reduced.addEventListener\("change", restart\)/);
  assert.match(live, /reduced.removeEventListener\("change", restart\)/);
  assert.match(live, /active = false; cancelAnimationFrame\(frame\)/);
  assert.match(live, /then\(\(\) => \{ if \(active\) restart\(\); \}\)/, "late image loads cannot revive an unmounted loop");
});

test("seated recolor and expression variants are bounded and shared by all portraits", async () => {
  const source = await readFile(new URL("../app/seated-cat-art.ts", import.meta.url), "utf8");
  assert.match(source, /SIZE = 672, LIMIT = 12/);
  assert.match(source, /if \(loading\) return loading/);
  assert.match(source, /const key = concealed \? "shape"/);
  assert.match(source, /let variant = cache.get\(key\)/);
  assert.match(source, /if \(!variant\) \{/);
  assert.match(source, /blink && !concealed \? variant.closed : variant.open/);
  assert.match(source, /if \(cache.size >= LIMIT\) cache.delete/);
  assert.match(source, /if \(!concealed && eyeStyle !== "FIERCE"\) expression/);
  assert.match(source, /tintCatFur\(pixels.data, safe, concealed\)/);
});
