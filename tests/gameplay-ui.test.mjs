import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GameGlyph, GameplaySettings } from "../app/gameplay-controls.tsx";
import { LandscapeGuard, useLandscapeRequired, PORTRAIT_GAME_QUERY } from "../app/gameplay-orientation.tsx";

test("gameplay header floats transparently over the arena without an opaque brand rail", async () => {
  const css = await readFile(new URL("../app/gameplay-hud.css", import.meta.url), "utf8");
  assert.match(css, /margin-bottom: calc\(-1 \* var\(--floating-nav-height\)\)/);
  assert.match(css, /background: transparent;\s*border: 0;\s*box-shadow: none;\s*backdrop-filter: none;\s*pointer-events: none/);
  assert.match(css, /\.game-nav \.brand \{ display: none/);
  assert.match(css, /\.game-nav-actions \{ grid-column: 3; pointer-events: auto/);
  assert.match(css, /translate: 0 var\(--floating-nav-height\)/);
});

test("settings are a named native dialog with explicit, stateful audio/glare switches", () => {
  const html = renderToStaticMarkup(createElement(GameplaySettings, {
    open: false, enabled: true, onOpenChange() {}, onMusicToggle() {}, onSoundToggle() {}, onGlareToggle() {}, onExit() {},
    musicEnabled: false, soundEnabled: true, lowGlare: false,
  }));
  assert.match(html, /<dialog[^>]+aria-labelledby=/);
  assert.doesNotMatch(html, /<dialog[^>]+\sopen[=>\s]/);
  assert.match(html, /role="switch" aria-checked="true" aria-label="Forest sounds"/);
  assert.match(html, /role="switch" aria-checked="false" aria-label="Moonlit music"/);
  assert.match(html, /role="switch" aria-checked="false" aria-label="Gentle moon glare"/);
  assert.match(html, /aria-label="Close game settings"/);
  assert.match(html, /The forest keeps moving/);
  assert.match(html, /<details[^>]*><summary>Controls/);
  assert.match(html, /Back to the forest/);
});

test("every gameplay icon is decorative SVG rather than another announced button label", () => {
  for (const name of ["moon", "settings", "exit", "report", "sight", "echo", "bite", "veil", "spark", "people"]) {
    const html = renderToStaticMarkup(createElement(GameGlyph, { name }));
    assert.match(html, /^<svg/);
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /<path/);
  }
});

test("game settings use the input-reset gate and are excluded from touch/map/notebook input", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /setNavigationOpen\(navigationExpanded \|\| settingsOpen \|\| landscapeRequired\)/);
  for (const component of ["NavigationMap", "FieldNotebook", "FloatingJoystick"]) {
    const markup = source.slice(source.lastIndexOf(`<${component}`)).split("/>")[0];
    assert.match(markup, /enabled=\{[^}]*!settingsOpen/);
    assert.match(markup, /enabled=\{[^}]*!landscapeRequired/);
  }
  const settings = await readFile(new URL("../app/gameplay-controls.tsx", import.meta.url), "utf8");
  assert.match(settings, /dialog\.showModal\(\)/);
  assert.match(settings, /dialog\.close\(\)/);
  assert.match(settings, /onCancel=/);
  assert.match(settings, /autoFocus aria-label="Close game settings"/);
});

test("portrait guidance is accessible and honest about solo versus live multiplayer", () => {
  for (const multiplayer of [false, true]) {
    const html = renderToStaticMarkup(createElement(LandscapeGuard, { active: false, multiplayer, onExit() {} }));
    assert.match(html, /<dialog[^>]+aria-labelledby=[^>]+aria-describedby=/);
    assert.doesNotMatch(html, /<dialog[^>]+\sopen[=>\s]/);
    assert.match(html, /Rotate to play/);
    assert.match(html, /Turn your phone sideways for landscape gameplay/);
    assert.match(html, /Return to the lobby/);
    assert.match(html, multiplayer ? /live match keeps moving/ : /Solo practice is paused/);
  }
  const Probe = () => createElement("span", null, String(useLandscapeRequired()));
  assert.equal(renderToStaticMarkup(createElement(Probe)), "<span>false</span>", "server render does not read window or force a mobile orientation");
  assert.match(PORTRAIT_GAME_QUERY, /orientation: portrait/);
  assert.match(PORTRAIT_GAME_QUERY, /any-pointer: coarse/);
});

test("Escape cannot dismiss portrait guidance and leave the paused match hidden behind it", async () => {
  const source = await readFile(new URL("../app/gameplay-orientation.tsx", import.meta.url), "utf8");
  assert.match(source, /onKeyDown=\{event => \{ if \(event.key === "Escape"\)/);
  assert.match(source, /event.preventDefault\(\); event.stopPropagation\(\)/);
  assert.match(source, /onClose=\{[^\n]+active && dialog\?\.isConnected && !dialog.open\) dialog.showModal\(\)/);
});

test("the midnight palette preserves contrast tokens and has a separate short-landscape HUD", async () => {
  const css = await readFile(new URL("../app/gameplay-hud.css", import.meta.url), "utf8");
  assert.match(css, /--play-ink: #e4ecf6/);
  assert.match(css, /--play-gold: #dfbd7c/);
  assert.match(css, /orientation: landscape\) and \(max-height: 540px/);
  assert.match(css, /landscape-guard\[open\]/);
  assert.match(css, /width: 44px/);
  assert.doesNotMatch(css, /#fffaf6|#f0e9fc|#ffe0b8/, "the old pastel surfaces are removed, not layered underneath another palette");
});

test("minimap is collapsed by default and motion/press styles stay scoped to gameplay", async () => {
  const map = await readFile(new URL("../app/navigation-map.tsx", import.meta.url), "utf8");
  assert.match(map, /\[compactOpen, setCompactOpen\] = useState\(false\)/);
  const css = await readFile(new URL("../app/gameplay-hud.css", import.meta.url), "utf8");
  assert.match(css, /\.playful-game button:not\(:disabled\):active/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /prefers-reduced-motion: no-preference/);
  assert.match(css, /focus-visible/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.doesNotMatch(css, /https?:\/\//, "the HUD doesn't load external fonts, art or scripts");
});
