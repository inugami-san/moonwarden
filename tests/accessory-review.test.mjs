import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { HAT_IDS, HAT_META } from "../server/cosmetics.ts";
import { EYE_STYLES } from "../server/appearance.ts";

const source = await readFile(new URL("../app/dev/cats/preview.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
const directions = ["NORTH", "NE", "EAST", "SE", "SOUTH", "SW", "WEST", "NW"];

function loadReview() {
  const calls = [], exports = {};
  runInNewContext(code, { exports, React, require(name) {
    if (name === "react") return React;
    if (name === "next/link") return { default: ({ children, ...props }) => React.createElement("a", props, children) };
    if (name === "../../mooncat-renderer") return {
      drawMooncat(ctx, options) { calls.push({ kind: "CAT", ctx, options }); },
      drawVectorMooncat(ctx, options) { calls.push({ kind: "VECTOR", ctx, options }); },
    };
    if (name === "../../accessory-art") return { drawWornAccessory(...args) { calls.push({ kind: "ACCESSORY", args }); } };
    if (name === "../../mooncat-sprites") return { loadMooncatSprites: async () => true, mooncatRigSummary: () => "ready" };
    if (name === "../../cat-portrait") return { SlimePortrait: ({ accessory, pose }) => React.createElement("span", { "data-accessory": accessory, "data-pose": pose }) };
    if (name === "../../../server/appearance") return { EYE_STYLES };
    if (name === "../../../server/cosmetics") return { HAT_IDS, HAT_META };
    if (name === "../../fallen-cat-art" || name === "../../cat-devour") return {};
    throw new Error(`Unexpected review dependency: ${name}`);
  } });
  return { calls, ...exports };
}

test("dev review renders the actual accessory before and after every directional cat", () => {
  const { drawReviewCat, calls } = loadReview(), context = {};
  for (const hat of HAT_IDS) for (const direction of directions) for (const strideAmount of [0, .8]) {
    calls.length = 0;
    const options = { color: "#8257cb", direction, stridePhase: 1.75, strideAmount, idlePhase: .6, blink: false, muted: true };
    drawReviewCat(context, options, hat);
    assert.deepEqual(calls.map(call => call.kind), ["ACCESSORY", "CAT", "ACCESSORY"]);
    assert.equal(calls[1].options, options, "cat and accessory share one motion sample");
    assert.deepEqual(Array.from(calls[0].args), [context, hat, direction, true, 1.75, strideAmount, "GAMEPLAY", .6, "BACK"]);
    assert.deepEqual(Array.from(calls[2].args), [context, hat, direction, true, 1.75, strideAmount, "GAMEPLAY", .6, "FRONT"]);
  }
});

test("anonymous review omits every accessory layer, including the vector fallback", () => {
  const { drawReviewCat, calls } = loadReview();
  for (const hat of HAT_IDS) for (const direction of directions) for (const fallback of [false, true]) {
    calls.length = 0;
    drawReviewCat({}, { color: "#8257cb", direction, stridePhase: 0, strideAmount: 0, blink: false, concealed: true }, hat, fallback);
    assert.deepEqual(calls.map(call => call.kind), [fallback ? "VECTOR" : "CAT"]);
    assert.equal(calls[0].options.concealed, true);
  }
  calls.length = 0;
  drawReviewCat({}, { color: "#8257cb", direction: "SOUTH", stridePhase: 0, strideAmount: 0, blink: false });
  assert.deepEqual(calls.map(call => call.kind), ["CAT"], "No accessory is a useful silhouette control");
});

test("Hollow devour preview forwards its live pose and both accessory passes without revealing anonymous cats", () => {
  const { reviewDevourAccessory, calls } = loadReview(), context = {};
  for (const hat of HAT_IDS) for (const direction of directions) {
    calls.length = 0;
    const drawHat = reviewDevourAccessory(hat);
    for (const layer of ["BACK", "FRONT"]) drawHat(context, direction, .6, .45, layer);
    assert.equal(calls.length, 2);
    for (const [index, layer] of ["BACK", "FRONT"].entries()) {
      assert.deepEqual(Array.from(calls[index].args), [context, hat, direction, false, .6, .45, "GAMEPLAY", 0, layer]);
    }
    assert.equal(reviewDevourAccessory(hat, true), undefined, "concealed kills never attach a cosmetic callback");
  }
  assert.equal(reviewDevourAccessory(), undefined);
  calls.length = 0;
  reviewDevourAccessory("moonbell")(context, "SOUTH", 0, 0);
  assert.equal(calls[0].args.at(-1), "FRONT", "legacy callback callers retain a safe front pass");
  assert.match(source, /drawHat: reviewDevourAccessory\(worn, concealed\)/);
});

test("the accessible selector uses all canonical cosmetics and compares actual seated and lobby portraits", () => {
  const { CatPreview } = loadReview();
  const html = renderToStaticMarkup(React.createElement(CatPreview));
  assert.match(html, /aria-label="Character review controls"/);
  assert.match(html, /<label>Accessory <select/);
  assert.match(html, /<option value="NONE">No accessory<\/option>/);
  for (const id of HAT_IDS) {
    assert.ok(html.includes(`<option value="${id}"`), `selector includes ${id}`);
    assert.ok(html.includes(HAT_META[id].title), `selector uses the public title for ${id}`);
  }
  for (const direction of directions) assert.ok(html.includes(`>${direction}</option>`));
  assert.match(html, /data-accessory="moonbell" data-pose="SEATED"/);
  assert.match(html, /data-accessory="moonbell" data-pose="LOBBY"/);
  assert.match(html, /each shown idle and walking with selected accessory/);
  assert.match(html, /Actual gameplay size · 1×/);
  assert.match(html, /aria-describedby="game-scale-help"/);
  assert.match(source, /accessory=\{concealed \? undefined : worn\}/);
  assert.match(source, /className=\{concealed \? "preview-fog" : undefined\}/);
});

test("the review pauses idle work, respects reduced motion and remains development-only", async () => {
  assert.match(source, /if \(document.hidden\) return/);
  assert.match(source, /playing && !preference.matches/);
  assert.match(source, /if \(animate\) frame = requestAnimationFrame\(paint\)/);
  assert.match(source, /1000 \/ 30/);
  for (const target of ['document.removeEventListener("visibilitychange", restart)', 'preference.removeEventListener("change", restart)', 'cancelAnimationFrame(frame)']) assert.ok(source.includes(target));
  const route = await readFile(new URL("../app/dev/cats/page.tsx", import.meta.url), "utf8");
  assert.match(route, /process.env.NODE_ENV !== "development"/);
  assert.match(route, /notFound\(\)/);
  assert.doesNotMatch(route, /searchParams|ALLOW_|process.env.NEXT_PUBLIC/);
});
