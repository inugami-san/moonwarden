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

test("the earned list hides empty slots without renumbering original 1/2/3 shortcuts", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(earnedGear({ FLASHLIGHT: 0, FLARE: 4, SONAR: 2 }))), [{ item: "FLARE", shortcut: 2, charges: 4 }, { item: "SONAR", shortcut: 3, charges: 2 }]);
  assert.equal(earnedGear(empty).length, 0);
  const html = markup(EarnedGearDock, { charges: { ...empty, SONAR: 2 }, selectedItem: "SONAR", onSelect() {}, renderIcon });
  const main = html.slice(html.indexOf('class="earned-gear-choices"'));
  assert.match(main, /Echo Bell/);
  assert.match(main, /key 3/);
  assert.doesNotMatch(main, /Glowing Mushroom|Moonblossom/);
  assert.match(html, /<summary>More gear<\/summary>/);
  for (const label of ["Glowing Mushroom", "Moonblossom", "Echo Bell"]) assert.ok(html.includes(label));
  assert.match(html, /Equipped:/);
  assert.doesNotMatch(markup(EarnedGearDock, { charges: { ...empty, SONAR: 1 }, selectedItem: "SONAR", onSelect() {}, renderIcon, showSelectedDescription: false }), /Equipped:/);
});

test("new surfaces keep text labels, native keyboard controls, and safe restoration values", () => {
  const html = markup(ObjectiveStrip, { ...input(), progress: Infinity });
  assert.match(html, /<summary>How to win<\/summary>/);
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /<progress value="0" max="100" aria-label="Forest restoration"/);
  assert.match(markup(ObjectiveStrip, { ...input(), progress: 230 }), /<progress value="100"/);
  const emptyHtml = markup(EarnedGearDock, { charges: empty, selectedItem: "FLASHLIGHT", onSelect() {}, renderIcon });
  assert.match(emptyHtml, /Complete a shrine/);
  assert.doesNotMatch(emptyHtml, /class="earned-gear-choices"/);
  const disabled = markup(EarnedGearDock, { charges: { FLASHLIGHT: 1, FLARE: 1, SONAR: 1 }, selectedItem: "FLARE", onSelect() {}, renderIcon, disabled: true });
  assert.equal((disabled.match(/disabled=""/g) ?? []).length, 6);
  assert.equal(GEAR_ORDER.length, 3);
  assert.match(markup(ObjectiveStrip, { ...input({ role: "IMPOSTOR" }), progress: 20, allies: "Mochi" }), /Your fellow Hollows: Mochi/);
  assert.doesNotMatch(markup(ObjectiveStrip, { ...input(), progress: 20, allies: "Mochi" }), /Mochi/);
});

test("gear selection calls the existing selection action with its original item kind", () => {
  const selected = [];
  const tree = EarnedGearDock({ charges: { ...empty, SONAR: 2 }, selectedItem: "SONAR", onSelect: item => selected.push(item), renderIcon });
  const visit = element => {
    if (!React.isValidElement(element)) return;
    if (element.type === "button" && element.props["aria-keyshortcuts"] === "3") element.props.onClick();
    React.Children.forEach(element.props.children, visit);
  };
  visit(tree);
  assert.deepEqual(selected, ["SONAR"]);
});

test("reward handoff leads with earned gear without exact attributable gauge changes", () => {
  for (const role of ["CREWMATE", "IMPOSTOR"]) {
    const html = markup(RewardHandoff, { role, item: "SONAR", station: "Frost Font", icon: renderIcon("SONAR") });
    assert.match(html, /Echo Bell earned/);
    assert.match(html, /Frost Font/);
    assert.match(html, /movement echoes/);
    assert.doesNotMatch(html, /\d%|queued|settle|four seconds|siphon/i);
  }
});

test("scoped layout preserves labels, safe-area insets, and phone landscape composition", async () => {
  const css = await readFile(new URL("../app/player-guidance.css", import.meta.url), "utf8");
  assert.match(css, /\.playful-game \.objective-strip/);
  assert.match(css, /safe-area-inset-left/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /orientation: landscape\) and \(max-height: 540px/);
  assert.doesNotMatch(css, /overflow(?:-y)?:\s*(?:scroll|auto)/);
  assert.doesNotMatch(css, /earned-gear-label\s*\{[^}]*display:\s*none/);
});

test("restoration guidance uses one plain-language forest label without changing victory rules", () => {
  for (const role of ["CREWMATE", "IMPOSTOR"]) {
    const html = markup(ObjectiveStrip, { ...input({ role }), progress: 37 });
    assert.match(html, /<span>Forest restored<\/span>/);
    assert.match(html, /aria-label="Forest restoration"/);
    assert.doesNotMatch(html, /moonwards?/i);
  }
  assert.match(roleWinSummary("CREWMATE"), /restoring the forest to 100%.*voting out every Hollow/);
  assert.match(roleWinSummary("IMPOSTOR"), /match or outnumber the Wardens after a cat falls/);
  assert.match(playerGuidance(input()).detail, /restore the forest/);
});

test("both native disclosure controls retain at least 44px touch targets at every breakpoint", async () => {
  const css = await readFile(new URL("../app/player-guidance.css", import.meta.url), "utf8");
  const disclosures = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, selector]) => /\.(?:objective-win|gear-catalog) summary(?:\s|,|$)/.test(selector.trim()));
  assert.ok(disclosures.some(([, selector, declarations]) => selector.includes(".objective-win summary") && selector.includes(".gear-catalog summary") && /min-width:\s*44px/.test(declarations) && /min-height:\s*44px/.test(declarations)));
  for (const [, selector, declarations] of disclosures) {
    const minimum = declarations.match(/min-height:\s*([\d.]+)px/);
    if (minimum) assert.ok(Number(minimum[1]) >= 44, `${selector.trim()} must not shrink the disclosure target`);
  }
});

test("short-landscape catalog budgets three labeled cards within phone viewport bounds", async () => {
  const css = await readFile(new URL("../app/player-guidance.css", import.meta.url), "utf8");
  const compact = css.slice(css.indexOf("@media (orientation: landscape) and (max-height: 540px)"));
  assert.match(compact, /gear-catalog-panel\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(compact, /width:\s*min\(420px, calc\(100vw[^;]+safe-area-inset-right/);
  assert.match(compact, /gear-catalog-panel > button\s*\{[^}]*min-height:\s*100px/);
  assert.doesNotMatch(compact, /gear-catalog-panel (?:small|b)\s*\{[^}]*display:\s*none/);
  // 100px cards + 7px panel padding and border leave the catalog below the
  // 48px floating nav even with three earned choices and the 44px summary.
  for (const [width, height] of [[568, 320], [667, 375], [844, 390]]) {
    const panelWidth = Math.min(420, width - 24);
    const panelHeight = 100 + 14 + 2;
    const dockHeight = height <= 340 ? 48 + 8 + 2 : 44 + 4 + 56 + 12 + 2;
    assert.ok(12 + panelWidth <= width - 12);
    assert.ok(height - 12 - dockHeight - 8 - panelHeight >= 48, `${width}×${height} leaves the floating header clear`);
  }
});

test("320px landscape gear stays in one touch-sized row below the map and left of Hollow actions", async () => {
  const css = await readFile(new URL("../app/player-guidance.css", import.meta.url), "utf8");
  const rail = css.slice(css.indexOf("@media (orientation: landscape) and (max-height: 340px)"));
  assert.match(rail, /earned-gear-dock\s*\{[^}]*display: flex[^}]*width: min\(268px,[^}]*- 276px\)[^}]*padding: 4px/);
  assert.match(rail, /earned-gear-dock:not\(:has\(\.earned-gear-choices\)\)\s*\{\s*width: auto/);
  assert.match(rail, /earned-gear-heading > strong,[\s\S]*?earned-gear-empty,[\s\S]*?earned-gear-description\s*\{\s*display: none/);
  assert.match(rail, /gear-catalog summary\s*\{[^}]*min-height: 48px/);
  assert.match(rail, /earned-gear-choices > button\s*\{[^}]*min-width: 44px[^}]*min-height: 48px[^}]*height: 48px/);
  assert.doesNotMatch(rail, /earned-gear-label\s*\{[^}]*display:\s*none/);
  assert.doesNotMatch(rail, /gear-catalog-panel/);
  const viewport = { width: 568, height: 320 };
  const inset = 12, dockHeight = 48 + 2 * 4 + 2, dockWidth = 268;
  const mapBottom = 229, actionWidth = 264;
  assert.ok(viewport.height - inset - dockHeight > mapBottom, "58px rail clears the observed map row");
  assert.equal(viewport.width - inset - actionWidth - (inset + dockWidth), 12, "Hollow actions retain a 12px gap");
  assert.ok(dockWidth - 10 - 60 - 4 - 8 >= 3 * 44, "all three earned buttons remain touch sized");
  assert.ok(viewport.height - inset - dockHeight - 8 - 116 >= 48, "catalog remains below the floating header");
  assert.equal(390 <= 340, false, "ordinary 844×390 composition does not enter this breakpoint");
});
