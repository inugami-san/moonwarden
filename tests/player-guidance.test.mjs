import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { ORDEAL_PREPARATION } from "../app/warden-objectives.ts";

// Compile the leaf component without browser-only stylesheet handling.
const source = await readFile(new URL("../app/player-guidance.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
const exports = {};
runInNewContext(compiled, { exports, React, require(name) { if (name === "./warden-objectives") return { ORDEAL_PREPARATION }; throw new Error(`Unexpected import: ${name}`); } });
const { playerGuidance, roleWinSummary, earnedGear, ObjectiveStrip, EarnedGearDock, RewardHandoff, GEAR_ORDER } = exports;
const empty = Object.freeze({ FLASHLIGHT: 0, FLARE: 0, SONAR: 0 });
const input = changes => ({ role: "CREWMATE", phase: "CALM", hazard: "BLACKOUT", alive: true, charges: empty, selectedItem: "FLASHLIGHT", ...changes });
const markup = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const renderIcon = item => React.createElement("span", { "data-item": item }, "✦");

test("Wardens receive one phase-relevant next step, with no impossible completed-shrine task", () => {
  assert.match(playerGuidance(input()).title, /Restore a shrine/);
  assert.match(playerGuidance(input({ destinationLabel: "Frost Font" })).title, /Restore Frost Font/);
  assert.match(playerGuidance(input({ allRitesComplete: true })).detail, /reopen next Calm/);
  assert.match(playerGuidance(input({ phase: "DISCUSSION" })).title, /Compare what you actually saw/);
  assert.match(playerGuidance(input({ phase: "ORDEAL" })).title, /Survive/);
  assert.equal(playerGuidance(input({ phase: "ORDEAL" })).item, null);
});

test("every hazard recommends an actually earned item and keeps equip distinct from use", () => {
  for (const [hazard, preparation] of Object.entries(ORDEAL_PREPARATION)) {
    const charges = { ...empty, [preparation.item]: 2 };
    const selectedItem = preparation.item === "FLASHLIGHT" ? "FLARE" : "FLASHLIGHT";
    const countdown = playerGuidance(input({ hazard, phase: "COUNTDOWN", charges, selectedItem }));
    assert.equal(countdown.item, preparation.item);
    assert.match(countdown.title, /^Equip/);
    const ordeal = playerGuidance(input({ hazard, phase: "ORDEAL", charges, selectedItem: preparation.item }));
    assert.equal(ordeal.item, preparation.item);
    assert.match(ordeal.title, /^Use/);
    assert.equal(playerGuidance(input({ hazard, phase: "COUNTDOWN" })).item, null);
  }
  assert.equal(playerGuidance(input({ phase: "ORDEAL", charges: { ...empty, FLARE: 1 } })).item, "FLARE");
});

test("Hollow guidance changes from quiet siphoning to the hunt, and respects a spent strike", () => {
  const hollow = changes => playerGuidance(input({ role: "IMPOSTOR", ...changes }));
  assert.match(hollow({}).detail, /fake ritual.*gear.*slow forest restoration/);
  assert.match(hollow({ phase: "ORDEAL" }).title, /hunt/);
  assert.match(hollow({ phase: "ORDEAL", strikeSpent: true }).title, /Stay hidden/);
  assert.match(hollow({ phase: "DISCUSSION" }).title, /discussion/);
  assert.match(roleWinSummary("CREWMATE"), /100%.*every Hollow/);
  assert.match(roleWinSummary("IMPOSTOR"), /match or outnumber.*after a cat falls/);
});

test("spectators never receive tasks, equip instructions, or attacks in any phase", () => {
  for (const role of ["CREWMATE", "IMPOSTOR"]) for (const phase of ["CALM", "COUNTDOWN", "ORDEAL", "DISCUSSION"]) {
    const guidance = playerGuidance(input({ role, phase, alive: false, charges: { FLASHLIGHT: 5, FLARE: 5, SONAR: 5 } }));
    assert.equal(guidance.title, "Watch over the circle");
    assert.equal(guidance.item, null);
  }
});

test("guidance cannot leak an injected enemy roster or treat guesses as evidence", () => {
  const guidance = playerGuidance(input({ players: [{ name: "HiddenHollow", role: "IMPOSTOR", x: 120 }], bodies: [{ id: "SecretBody" }] }));
  assert.doesNotMatch(JSON.stringify(guidance), /HiddenHollow|SecretBody|120/);
  assert.deepEqual(Object.keys(guidance).sort(), ["detail", "item", "title"]);
  assert.doesNotMatch(source, /setInterval|setTimeout|addEventListener|players:|bodies:/);
});

test("earned gear disappears until earned, then shows only compact labels and the original shortcuts", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(earnedGear({ FLASHLIGHT: 0, FLARE: 4, SONAR: 2 }))), [{ item: "FLARE", shortcut: 2, charges: 4 }, { item: "SONAR", shortcut: 3, charges: 2 }]);
  const props = { charges: empty, selectedItem: "FLASHLIGHT", onSelect() {}, renderIcon };
  assert.equal(EarnedGearDock(props), null);
  assert.equal(markup(EarnedGearDock, props), "");
  const html = markup(EarnedGearDock, { ...props, charges: { ...empty, SONAR: 2 }, selectedItem: "SONAR" });
  const start = html.indexOf('class="earned-gear-choices"');
  const main = html.slice(start, html.indexOf("</div>", start));
  assert.match(main, /class="earned-gear-label">Echo<\/span>/);
  assert.match(main, /aria-keyshortcuts="3"/);
  assert.match(main, /Equip Echo Bell, 2 charges, key 3/);
  assert.match(main, /title="Echo Bell · Key 3/);
  assert.doesNotMatch(main, /Glowing Mushroom|Moonblossom/);
  assert.match(html, /<summary aria-label="Gear information and all items">Info<\/summary>/);
  for (const label of ["Glowing Mushroom", "Moonblossom", "Echo Bell"]) assert.ok(html.includes(label));
  assert.doesNotMatch(html, /<p|earned-gear-heading|earned-gear-empty|earned-gear-description|Equipped:/);
  assert.equal(GEAR_ORDER.length, 3);
});

test("the entire persistent objective is one native Forest summary with no exposed role or guidance paragraph", () => {
  const html = markup(ObjectiveStrip, { ...input({ role: "IMPOSTOR" }), progress: 37, allies: "Mochi" });
  assert.match(html, /^<details class="objective-strip"/);
  assert.equal((html.match(/<details/g) ?? []).length, 1);
  assert.equal((html.match(/<summary/g) ?? []).length, 1);
  assert.doesNotMatch(html.slice(0, html.indexOf(">") + 1), /open=/);
  const summary = html.slice(html.indexOf("<summary"), html.indexOf("</summary>"));
  assert.match(summary, /Forest 37% restored\. Open your goal and help/);
  assert.match(summary, /<span>Forest<\/span>/);
  assert.match(summary, /<progress value="37" max="100" aria-label="Forest restoration"/);
  assert.doesNotMatch(summary, /Hollow|Warden|Mochi|ritual|How to win|<p(?:\s|>)/);
  assert.match(html, /class="objective-goal-panel"/);
  assert.match(html, /Hollow · your secret role/);
  assert.match(html, /Blend in with a shrine ritual/);
  assert.match(html, /match or outnumber/);
  assert.match(html, /Your fellow Hollows: Mochi/);
  assert.doesNotMatch(markup(ObjectiveStrip, { ...input(), progress: 37, allies: "Mochi" }), /Mochi/);
});

test("restoration stays clamped and plain-language without changing the helper's victory rules", () => {
  assert.match(markup(ObjectiveStrip, { ...input(), progress: Infinity }), /<progress value="0"/);
  assert.match(markup(ObjectiveStrip, { ...input(), progress: 230 }), /<progress value="100"/);
  for (const role of ["CREWMATE", "IMPOSTOR"]) {
    const html = markup(ObjectiveStrip, { ...input({ role }), progress: 37 });
    assert.match(html, /aria-label="Forest restoration"/);
    assert.doesNotMatch(html, /moonwards?/i);
  }
  assert.match(roleWinSummary("CREWMATE"), /restoring the forest to 100%.*voting out every Hollow/);
  assert.match(roleWinSummary("IMPOSTOR"), /match or outnumber the Wardens after a cat falls/);
  assert.match(playerGuidance(input()).detail, /restore the forest/);
});

test("compact gear forwards selection and disabled state without changing original item kinds", () => {
  const selected = [];
  const tree = EarnedGearDock({ charges: { ...empty, SONAR: 2 }, selectedItem: "SONAR", onSelect: item => selected.push(item), renderIcon });
  const visit = element => {
    if (!React.isValidElement(element)) return;
    if (element.type === "button" && element.props["aria-keyshortcuts"] === "3") element.props.onClick();
    React.Children.forEach(element.props.children, visit);
  };
  visit(tree);
  assert.deepEqual(selected, ["SONAR"]);
  const disabled = markup(EarnedGearDock, { charges: { FLASHLIGHT: 1, FLARE: 1, SONAR: 1 }, selectedItem: "FLARE", onSelect() {}, renderIcon, disabled: true });
  assert.equal((disabled.match(/disabled=""/g) ?? []).length, 6);
  for (const label of ["Light", "Bloom", "Echo"]) assert.ok(disabled.includes('class="earned-gear-label">' + label));
  for (const showSelectedDescription of [true, false]) assert.doesNotMatch(markup(EarnedGearDock, { charges: { ...empty, SONAR: 1 }, selectedItem: "SONAR", onSelect() {}, renderIcon, showSelectedDescription }), /<p|Equipped:/);
});

test("reward handoff is one short item-plus-one line with no role, station or gauge attribution", () => {
  const props = { item: "SONAR", station: "Frost Font", icon: renderIcon("SONAR") };
  const warden = markup(RewardHandoff, { ...props, role: "CREWMATE" });
  const hollow = markup(RewardHandoff, { ...props, role: "IMPOSTOR" });
  assert.equal(warden, hollow);
  assert.match(warden, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(warden, /<strong>Echo Bell<\/strong><b>\+1<\/b>/);
  assert.match(warden, /one charge earned/);
  assert.doesNotMatch(warden, /<p|<small|Frost Font|Hollow|fake ritual|\d%|queued|settle|siphon/i);
});

test("collapsed HUD has only 44px controls, short item labels, and no owned outer offsets", async () => {
  const css = await readFile(new URL("../app/player-guidance.css", import.meta.url), "utf8");
  assert.match(css, /\.objective-strip\s*\{\s*width: 190px; height: 44px/);
  assert.match(css, /\.objective-pill,[\s\S]*?\.gear-catalog > summary\s*\{[^}]*min-width: 44px[^}]*min-height: 44px[^}]*height: 44px/);
  assert.match(css, /\.earned-gear-dock\s*\{[^}]*height: 44px/);
  assert.match(css, /\.earned-gear-choices > button\s*\{[^}]*width: 50px[^}]*min-width: 44px[^}]*height: 44px/);
  assert.match(css, /\.objective-strip\[open\],[\s\S]*?z-index: 14/);
  assert.doesNotMatch(css, /earned-gear-label\s*\{[^}]*display:\s*none/);
  assert.doesNotMatch(css, /overflow(?:-y)?:\s*(?:auto|scroll)/);
  for (const [, selector, declarations] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selector.split(",").some(part => /^\s*\.playful-game \.(?:objective-strip|earned-gear-dock|reward-handoff)\s*$/.test(part))) {
      assert.doesNotMatch(declarations, /(?:^|;)\s*(?:top|bottom|left|right|inset):/, "the parent HUD places its own edge controls");
    }
  }
});

test("edge popovers fit phone landscape without taking the center or colliding with the floating header", async () => {
  const css = await readFile(new URL("../app/player-guidance.css", import.meta.url), "utf8");
  assert.match(css, /width: min\(260px, calc\(100vw[^;]+safe-area-inset-right/);
  assert.match(css, /objective-goal-panel\s*\{\s*top: calc\(100% \+ 6px\)/);
  assert.match(css, /gear-catalog-panel\s*\{\s*bottom: calc\(100% \+ 6px\)/);
  assert.match(css, /gear-catalog-panel > button\s*\{[^}]*min-height: 52px/);
  for (const [width, height] of [[568, 320], [844, 390], [1440, 900]]) {
    const inset = 12, popupWidth = 260, dockHeight = 44, catalogHeight = 3 * 52 + 14 + 2;
    const gearWidth = 3 * 50 + 2 * 4 + 4 + 44;
    assert.ok(inset + popupWidth < width / 2, "expanded information stays on the left edge, not over the center");
    assert.ok(height - inset - dockHeight - 6 - catalogHeight >= 48, "catalog clears the floating header");
    assert.ok(width - inset - 264 - (inset + gearWidth) >= 12, "all earned gear clears a full Hollow action bar");
    assert.ok(48 + 10 + 44 + 6 + 190 <= height - inset, "goal/help copy has a short-landscape vertical budget");
  }
});
