import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { Children, createElement, isValidElement } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import ts from "typescript";
import { WardrobePreview } from "../app/wardrobe-preview.tsx";
import { portraitPixelSize } from "../app/cat-portrait.tsx";
import { drawCatCharacter } from "../app/cat-character.ts";
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
  assert.match(html, /<strong>Mochi<\/strong>/);
  assert.equal((html.match(/<canvas/g) ?? []).length, 1, "wardrobe does not allocate an unused fog silhouette");
  assert.equal((html.match(/<button/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<button\b/, "greet and shuffle are sibling actions, not nested buttons");
});

test("the preview forwards every live cosmetic to shared painted artwork without CSS accessory overlays", () => {
  const props = { color: "#d182b4", eyeStyle: "STARRY", accessory: "antlers", name: "Pip", animated: false, greeting: false, onGreet() {}, onRandomize() {} };
  const tree = WardrobePreview(props);
  let portrait;
  const visit = element => {
    if (!isValidElement(element)) return;
    if (typeof element.type === "function" && element.type.name === "SlimePortrait") portrait = element;
    Children.forEach(element.props.children, visit);
  };
  visit(tree);
  for (const key of ["color", "eyeStyle", "accessory", "animated", "greeting"]) assert.equal(portrait.props[key], props[key]);
  assert.equal(portrait.props.pose, "SEATED");
  assert.equal(portrait.props.concealment, false);
});

test("portrait backing stores stay crisp but bounded for roster icons, hero previews and invalid dimensions", () => {
  assert.equal(portraitPixelSize(24, 3), 96);
  assert.equal(portraitPixelSize(240, 2), 480);
  assert.equal(portraitPixelSize(560, 3), 672);
  assert.equal(portraitPixelSize(200, NaN), 200);
  for (const width of [0, -1, Infinity, NaN]) assert.equal(portraitPixelSize(width, 2), 0);
});

async function portraitHarness({ animated = false, concealment = true } = {}) {
  const source = await readFile(new URL("../app/cat-portrait.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  const refs = [], layouts = [], effects = [], layoutQueue = [], effectQueue = [];
  const canvases = new Map(), frames = new Map(), events = new Map(), draws = [], accessories = [], resizes = [], intersections = [];
  let refIndex = 0, layoutIndex = 0, effectIndex = 0, serial = 0, now = 1000, loads = 0;
  const queueEffect = (records, index, callback, dependencies, queue) => {
    const previous = records[index];
    if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) queue.push(() => {
      previous?.cleanup?.(); records[index] = { dependencies, cleanup: callback() };
    });
  };
  const media = { matches: false, addEventListener(name, callback) { events.set(`media:${name}`, callback); }, removeEventListener(name) { events.delete(`media:${name}`); } };
  const document = { hidden: false, addEventListener(name, callback) { events.set(name, callback); }, removeEventListener(name) { events.delete(name); } };
  const exports = {};
  runInNewContext(compiled, {
    exports, React: { createElement }, performance: { now: () => now }, document,
    window: { devicePixelRatio: 2, matchMedia: () => media },
    requestAnimationFrame(callback) { frames.set(++serial, callback); return serial; }, cancelAnimationFrame(id) { frames.delete(id); },
    ResizeObserver: class { constructor(callback) { this.callback = callback; resizes.push(this); } observe() {} disconnect() { this.disconnected = true; } },
    IntersectionObserver: class { constructor(callback) { this.callback = callback; intersections.push(this); } observe() {} disconnect() { this.disconnected = true; } },
    require(name) {
      if (name === "react") return {
        useRef(value) { const index = refIndex++; return refs[index] ??= { current: value }; }, useId: () => "portrait",
        useLayoutEffect(callback, dependencies) { queueEffect(layouts, layoutIndex++, callback, dependencies, layoutQueue); },
        useEffect(callback, dependencies) { queueEffect(effects, effectIndex++, callback, dependencies, effectQueue); },
      };
      if (name === "./seated-cat-art") return { loadSeatedCat() { loads++; return Promise.resolve(true); }, drawSeatedCat(context, color, eyes, blink, concealed) { draws.push({ color, eyes, blink, concealed }); return true; } };
      if (name === "./mooncat-sprites") return { loadMooncatSprites() { loads++; return Promise.resolve(true); } };
      if (name === "./mooncat-renderer") return { drawMooncat() { assert.fail("a loaded seated cat must not flicker through a gameplay fallback"); } };
      if (name === "./accessory-art") return { drawWornAccessory(context, accessory) { accessories.push(accessory); } };
      if (name === "./cat-character") return { drawCatCharacter };
      return {};
    },
  });
  const props = { color: "#20d8ed", eyeStyle: "ROUND", accessory: "moonbell", pose: "SEATED", animated, concealment };
  const update = changes => {
    Object.assign(props, changes); refIndex = layoutIndex = effectIndex = 0;
    const tree = exports.SlimePortrait(props);
    const attach = element => {
      if (!isValidElement(element)) return;
      if (element.type === "canvas") {
        let canvas = canvases.get(element.props.className);
        if (!canvas) {
          const context = new Proxy({}, { get: (target, key) => target[key] ?? (() => {}), set: (target, key, value) => { target[key] = value; return true; } });
          canvas = { width: element.props.width, height: element.props.height, getContext: () => context, getBoundingClientRect: () => ({ width: 240, height: 240 }) };
          canvases.set(element.props.className, canvas);
        }
        element.props.ref.current = canvas;
      }
      Children.forEach(element.props.children, attach);
    };
    attach(tree);
    while (layoutQueue.length) layoutQueue.shift()();
    while (effectQueue.length) effectQueue.shift()();
  };
  update({});
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const dispose = () => effects.forEach(effect => effect.cleanup?.());
  return { update, flush, dispose, draws, accessories, resizes, intersections, canvases, frames, events, media, document, get loads() { return loads; }, advance(milliseconds) { now += milliseconds; } };
}

test("live color, eyes and outfit updates repaint synchronously without rebuilding observers or reloading art", async () => {
  const preview = await portraitHarness();
  assert.equal(preview.draws.length, 0, "wait for the shared painted image instead of flashing a different cat");
  await preview.flush();
  assert.equal(preview.loads, 1);
  assert.equal(preview.draws.filter(draw => draw.concealed).length, 1);
  const canvas = preview.canvases.get("slime-detail");
  for (const color of ["#8257cb", "#d182b4", "#28ad88"]) preview.update({ color, eyeStyle: "STARRY", accessory: "antlers" });
  assert.equal(preview.draws.at(-1).color, "#28ad88");
  assert.equal(preview.draws.at(-1).eyes, "STARRY");
  assert.equal(preview.accessories.at(-1), "antlers");
  assert.equal(preview.canvases.get("slime-detail"), canvas);
  assert.equal(preview.resizes.length, 1); assert.equal(preview.intersections.length, 1);
  assert.equal(preview.loads, 1); assert.equal(preview.events.size, 2);
  assert.equal(preview.draws.filter(draw => draw.concealed).length, 1, "unchanged shape is not repainted for cosmetic selections");
  assert.equal(preview.frames.size, 0, "a paused preview schedules no idle loop");
  preview.dispose();
  assert.equal(preview.events.size, 0);
  assert.ok(preview.resizes[0].disconnected && preview.intersections[0].disconnected);
});

test("idle animation sleeps offscreen, respects reduced motion, and late image loads cannot revive it", async () => {
  const preview = await portraitHarness({ animated: true, concealment: false });
  await preview.flush(); assert.equal(preview.frames.size, 1);
  preview.intersections[0].callback([{ isIntersecting: false }]); assert.equal(preview.frames.size, 0);
  preview.intersections[0].callback([{ isIntersecting: true }]); assert.equal(preview.frames.size, 1);
  preview.media.matches = true; preview.events.get("media:change")(); assert.equal(preview.frames.size, 0);
  preview.dispose();
  const late = await portraitHarness({ animated: true }); late.dispose(); await late.flush();
  assert.equal(late.frames.size, 0); assert.equal(late.draws.length, 0);
});

test("room customization shares the same split preview layout and compact no-scroll framing", async () => {
  const css = await readFile(new URL("../app/wardrobe.css", import.meta.url), "utf8");
  assert.match(css, /inroom-wardrobe-layout\s*\{[^}]*display: grid[^}]*min-height: 0/);
  assert.match(css, /inroom-wardrobe-layout\s*\{[^}]*grid-template-rows: minmax\(120px, 1fr\) auto/);
  assert.match(css, /width: min\(104cqw, 104cqh, 560px\)/);
  assert.match(css, /wardrobe-preview\s*\{[^}]*grid-template-rows: auto minmax\(0, 1fr\) auto/);
  assert.match(css, /wardrobe-cat-button:focus-visible/);
  assert.doesNotMatch(css, /overflow(?:-y)?:\s*(?:auto|scroll)/);
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
