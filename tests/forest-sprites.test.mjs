import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ROOM, CENTER } from "../server/sanctuary-map.ts";
import { FOREST_REGIONS, FOREST_GRASS_PATCHES, FOREST_ATLAS_URL, drawForestAsset, loadForestSprites, forestSpritesReady } from "../app/forest-sprites.ts";

test("painted forest sprites fall back safely during SSR", async () => {
  assert.equal(await loadForestSprites(), false);
  assert.equal(forestSpritesReady(), false);
  assert.equal(drawForestAsset({}, 0, 0, 0, 100, 100), false);
});
test("eight authored crop regions stay within the transparent source atlas", async () => {
  const png = await readFile(new URL(`../public${FOREST_ATLAS_URL}`, import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png[25], 6, "RGBA preserves alpha");
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert.equal(FOREST_REGIONS.length, 8);
  for (const [x, y, w, h] of FOREST_REGIONS) {
    assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= width && y + h <= height);
  }
});
test("ground grass is bounded, deterministic, sparse and leaves the meeting circle open", () => {
  assert.ok(FOREST_GRASS_PATCHES.length > 40 && FOREST_GRASS_PATCHES.length < 150);
  for (const p of FOREST_GRASS_PATCHES) {
    assert.ok(p.x > ROOM.left + 30 && p.x < ROOM.right - 30);
    assert.ok(p.y > ROOM.top + 30 && p.y < ROOM.bottom - 30);
    assert.ok(Math.hypot(p.x - CENTER.x, p.y - CENTER.y) > 150);
    assert.ok([5, 6, 7].includes(p.asset));
    assert.ok(p.width <= 43);
    assert.equal("r" in p, false, "decoration never defines a collider");
  }
  assert.ok(Object.isFrozen(FOREST_GRASS_PATCHES));
});
