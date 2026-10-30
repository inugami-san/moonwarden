import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import * as React from "react";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { RoleReveal, ForestCinematicBackdrop, roleRevealPresentation } from "../app/role-reveal.tsx";

const source = name => readFile(new URL(`../app/${name}`, import.meta.url), "utf8");

test("private role reveal presents actual Warden/Hollow goals without legacy scanner art", () => {
  const warden = roleRevealPresentation("CREWMATE"), hollow = roleRevealPresentation("IMPOSTOR");
  assert.equal(warden.label, "Warden");
  assert.equal(hollow.label, "The Hollow");
  assert.match(warden.objective, /100%/);
  assert.match(warden.objective, /every Hollow/);
  assert.match(hollow.objective, /once per Ordeal/);
  assert.match(hollow.objective, /matches or outnumbers/);
  for (const role of ["CREWMATE", "IMPOSTOR"]) {
    const html = renderToStaticMarkup(createElement(RoleReveal, { role, color: "#96cbd1", accessory: "leafband", eyeStyle: "DREAMY", onContinue() {} }));
    assert.match(html, /role="dialog" aria-modal="true"/);
    assert.match(html, /Only you can see this role/);
    assert.match(html, /Enter the sanctuary/);
    assert.match(html, /data-pose="SEATED"/);
    assert.doesNotMatch(html, /scanline|reveal-orbit|reveal-progress/);
  }
});

test("role scenes preserve chosen accessories/eyes and leave assignment and timers to the parent", async () => {
  const text = await source("role-reveal.tsx");
  assert.match(text, /accessory=\{accessory\}/);
  assert.match(text, /eyeStyle=\{eyeStyle \?\?/);
  assert.match(text, /previous\.isConnected/);
  assert.match(text, /event.key === "Escape"/);
  assert.doesNotMatch(text, /localStorage|sessionStorage|fetch\(|WebSocket|setInterval|setTimeout/);
});

test("role entrance is staged, role-distinct and interactive without another blocking step", async () => {
  for (const role of ["CREWMATE", "IMPOSTOR"]) {
    const html = renderToStaticMarkup(createElement(RoleReveal, { role, color: "#96cbd1", reducedMotion: true, onContinue() {} }));
    assert.match(html, /is-reduced-motion/);
    assert.match(html, /class="role-reveal-cat"/);
    assert.match(html, role === "IMPOSTOR" ? /Stir the Hollow’s shadow/ : /Awaken your Warden’s moonlight/);
    assert.match(html, /role-reveal-theatre/);
    assert.match(html, /role-reveal-crest/);
    assert.doesNotMatch(html, /cat-portrait-concealed/);
  }
  const css = await source("role-reveal.css");
  for (const name of ["role-forest-part", "role-cat-materialize", "role-title-claim", "role-title-hunt", "role-hollow-unveil", "role-moon-response"]) assert.ok(css.includes(`@keyframes ${name}`));
  assert.match(css, /is-reduced-motion.*animation: none !important/);
  const page = await source("page.tsx");
  assert.match(page, /\}, 4900\)/, "the existing parent reveal deadline stays intact");
  assert.match(page, /if \(!soundEnabled \|\| !engine\?\.roleRevealActive\) return/);
});

test("cat taps respond only to input, cancel old motion, trap both focus targets and respect still mode", async () => {
  const code = ts.transpileModule(await source("role-reveal.tsx"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  for (const reducedMotion of [false, true]) {
    const refs = [], effects = [], poses = [], accents = [], responses = [];
    let cancelled = 0, continued = 0;
    const document = { activeElement: null };
    class Button { isConnected = true; focus() { document.activeElement = this; } }
    const previous = new Button(); previous.focus();
    const hooks = {
      useRef(value) { const ref = { current: value }; refs.push(ref); return ref; },
      useEffect(effect) { effects.push(effect); },
      useState(value) { return [value, update => responses.push(typeof update === "function" ? update(value) : update)]; },
    };
    const exports = {};
    runInNewContext(code, { exports, React, document, HTMLElement: Button, window: { matchMedia: () => ({ matches: reducedMotion }) }, require(name) {
      if (name === "react") return hooks;
      if (name === "./cat-portrait") return { SlimePortrait() {} };
      throw new Error(`Unexpected import: ${name}`);
    } });
    const tree = exports.RoleReveal({ role: "IMPOSTOR", color: "#96cbd1", reducedMotion, onAwaken: kind => accents.push(kind), onContinue: () => continued++ });
    refs[0].current = new Button(); refs[1].current = new Button();
    refs[2].current = { animate(frames, options) { poses.push({ frames, options }); return { cancel() { cancelled++; } }; } };
    const cleanup = effects[0]();
    assert.equal(document.activeElement, refs[0].current);
    assert.equal(accents.length, 0, "mounting the scene never attempts autoplay audio");
    const walk = element => element && typeof element === "object" ? [element, ...React.Children.toArray(element.props?.children).flatMap(walk)] : [];
    const cat = walk(tree).find(element => element.props?.className === "role-reveal-cat");
    cat.props.onClick(); cat.props.onClick();
    assert.deepEqual(accents, ["HOLLOW", "HOLLOW"]);
    assert.equal(poses.length, reducedMotion ? 0 : 2);
    assert.equal(responses.length, reducedMotion ? 0 : 2);
    if (!reducedMotion) assert.equal(poses[0].options.duration, 620);
    const key = (name, shiftKey = false) => tree.props.onKeyDown({ key: name, shiftKey, stopPropagation() {}, preventDefault() {} });
    key("Tab"); assert.equal(document.activeElement, refs[1].current);
    key("Tab", true); assert.equal(document.activeElement, refs[0].current);
    key("Escape"); assert.equal(continued, 1);
    cleanup();
    assert.equal(document.activeElement, previous);
    assert.equal(cancelled, reducedMotion ? 0 : 2);
  }
});

test("banishment remains neutral before authoritative reveal and never invents a role", async () => {
  const text = await source("banishment-overlay.tsx");
  assert.match(text, /const sceneKind = revealed \? outcome.kind.toLowerCase\(\) : "opening"/);
  assert.match(text, /const tone = revealed && \(outcome.kind === "WARDEN" \|\| outcome.kind === "HOLLOW"\) \? outcome.kind : "NEUTRAL"/);
  assert.match(text, /banishmentRevealAt\(outcome.kind, reducedMotion\)/);
  assert.match(text, /banishmentDuration\(outcome.kind, reducedMotion\)/);
  assert.match(text, /key=\{props.outcome.key\}/);
  assert.match(text, /if \(finishedRef.current\) return/);
  assert.match(text, /clearTimeout\(complete\)/);
  assert.match(text, /outcome.kind !== "NONE"/);
  assert.match(text, /The forest keeps this secret/);
  assert.doesNotMatch(text, /BanishmentScene|slimeSkin|slimeEyes|requestAnimationFrame/);
});

test("the shared backdrop is decorative and exact tone choices contain no inferred roster", () => {
  for (const tone of ["WARDEN", "HOLLOW", "NEUTRAL"]) {
    const html = renderToStaticMarkup(createElement(ForestCinematicBackdrop, { tone }));
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, new RegExp(`data-tone="${tone}"`));
    assert.equal((html.match(/<i>/g) ?? []).length, 6);
    assert.doesNotMatch(html, /playerId|roster|winner|<button/);
  }
});

test("forest cinematic motion is bounded, responsive and reduced-motion safe", async () => {
  const role = await source("role-reveal.css"), banishment = await source("banishment.css"), victory = await source("victory.css");
  assert.match(role, /menu-grove-v1\.webp/);
  assert.match(role, /safe-area-inset/);
  assert.match(role, /orientation: landscape/);
  for (const css of [role, banishment, victory]) {
    assert.match(css, /prefers-reduced-motion: reduce/);
    assert.doesNotMatch(css, /infinite|strobe|shake|https?:\/\//);
  }
  assert.match(banishment, /banishment-moonward-farewell/);
  assert.match(banishment, /banishment-shadow-unravel/);
  assert.match(victory, /victory-flower-bloom/);
  assert.match(victory, /victory-root-arrive/);
});

test("art-preview control styling cannot resize or restyle cinematic overlays", async () => {
  const css = await source("victory.css");
  const preview = await source("dev/victory/victory-preview.tsx");
  assert.match(preview, /className="victory-preview-controls"/);
  assert.match(css, /\.victory-preview-controls \{ display: grid; gap: 18px; width: min\(500px, 100%\)/);
  assert.doesNotMatch(css, /\.victory-preview\s+(?:>|h1|p|small|a|button)/);
});
