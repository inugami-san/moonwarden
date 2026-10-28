import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { WardrobePreview } from "../app/wardrobe-preview.tsx";
import { GameMenu } from "../app/game-menu.tsx";
import { GameGlyph } from "../app/gameplay-controls.tsx";

test("wardrobe has its own full seated cat, greeting and randomize actions", () => {
  const html = render(createElement(WardrobePreview, {
    color: "#20d8ed", eyeStyle: "ROUND", accessory: "moonbell", name: "Mochi",
    animated: false, greeting: false, onGreet() {}, onRandomize() {},
  }));
  assert.match(html, /aria-label="Live character preview"/);
  assert.match(html, /data-pose="SEATED"/);
  assert.match(html, /aria-label="Say hello to Mochi"/);
  assert.match(html, /title="Randomize Warden Identity"/);
  assert.equal((html.match(/<button/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<button\b/, "greet and shuffle are sibling actions, not nested buttons");
});

test("all wardrobe selections feed the preview without depending on the home stage", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /studio-stage" hidden=\{inRoom \|\| menuScreen !== "HOME"\}/);
  const wardrobe = source.slice(source.indexOf('<section hidden={menuScreen !== "LOOK"}'), source.indexOf('<div className="solo-settings"'));
  assert.match(wardrobe, /<WardrobePreview color=\{selectedColor\} eyeStyle=\{selectedEyes\} accessory=\{selectedHat\}/);
  assert.match(wardrobe, /animated=\{!motionPaused && menuScreen === "LOOK"\}/);
  assert.match(wardrobe, /onRandomize=\{handleRandomizeProfile\}/);
  for (const pane of ["COLOR", "HAT", "EYES"]) assert.ok(wardrobe.includes(`lookPane !== "${pane}"`));
});

test("wardrobe reserves a visible preview in portrait and short landscape layouts", async () => {
  const css = await readFile(new URL("../app/wardrobe.css", import.meta.url), "utf8");
  assert.match(css, /grid-template-columns: minmax\(0, \.95fr\) minmax\(0, 1.05fr\)/);
  assert.match(css, /grid-template-rows: minmax\(150px, 1fr\) auto/);
  assert.match(css, /grid-template-rows: minmax\(110px, 1fr\) auto/);
  assert.match(css, /max-height: 550px\) and \(orientation: landscape\)/);
  assert.match(css, /container-type: size/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(css, /\.wardrobe-preview\s*\{[^}]*display:\s*none|overflow:\s*(?:auto|scroll)/);
});

test("main menu uses original paw and collar SVGs instead of diamond sparkle glyphs", () => {
  const html = render(createElement(GameMenu, { onNavigate() {} }));
  assert.equal((html.match(/<button/g) ?? []).length, 4);
  assert.match(html, /Play with friends/); assert.match(html, /Customize/);
  assert.doesNotMatch(html, /[✦✧✨]/);
  for (const name of ["paw", "collar"]) {
    const icon = render(createElement(GameGlyph, { name }));
    assert.match(icon, /^<svg[^>]*aria-hidden="true"/);
    assert.match(icon, /<path/);
  }
});
