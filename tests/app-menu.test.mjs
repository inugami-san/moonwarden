import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { GameMenu, CompactFieldGuide, MENU_TITLES, pageWindow } from "../app/game-menu.tsx";
import { ORDEALS } from "../app/home-field-guide.tsx";
import { VoteRoster, TallyRoster } from "../app/meeting-roster.tsx";
import { EyeStylePicker } from "../app/eye-style-picker.tsx";
import { PLAYER_COLORS } from "../server/palette.ts";

const candidates = PLAYER_COLORS.map((color, i) => ({id: String(i), name: `Warden ${i}`, color, alive: i !== 7}));

test("home has four obvious navigation choices, not anchor-based scrolling", () => {
  const html = render(createElement(GameMenu, {onNavigate() {}}));
  for (const text of ["Play with friends", "Practice with AI", "Customize", "How to play"]) assert.ok(html.includes(text));
  assert.equal((html.match(/<button/g) ?? []).length, 4);
  assert.doesNotMatch(html, /<a|href=|CREATE ROOM/);
  assert.equal(Object.keys(MENU_TITLES).length, 6);
});

test("guide navigates three lessons and all six existing Ordeals one page at a time", () => {
  const html = render(createElement(CompactFieldGuide));
  assert.match(html, /Protect the sanctuary/);
  assert.match(html, /1 \/ 9/);
  assert.match(html, /aria-label="Previous guide page" disabled=""|disabled="" aria-label="Previous guide page"/);
  assert.match(html, /Next guide page/);
  assert.equal(ORDEALS.length, 6);
});

test("room directory paging clamps after live rooms disappear", () => {
  assert.deepEqual(pageWindow(0, 6), {page: 0, pages: 1, start: 0, end: 3});
  assert.deepEqual(pageWindow(8, 2), {page: 2, pages: 3, start: 6, end: 9});
  assert.deepEqual(pageWindow(2, 2), {page: 0, pages: 1, start: 0, end: 3});
  assert.equal(pageWindow(8, -1).page, 0);
});

test("all eight players stay in the vote roster, including self and eliminated players", () => {
  const html = render(createElement(VoteRoster, {candidates, localPlayerId: "0", alive: true, locked: false, onVote() {}}));
  assert.equal((html.match(/<button/g) ?? []).length, 8);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
  for (const player of candidates) assert.ok(html.includes(`title="${player.name}"`));
  assert.match(html, /YOU/); assert.match(html, /ELIMINATED/);
  for (const props of [{alive:false, locked:false}, {alive:true, locked:true}]) {
    const locked = render(createElement(VoteRoster, {candidates, localPlayerId: "0", ...props, onVote() {}}));
    assert.equal((locked.match(/disabled=""/g) ?? []).length, 8);
  }
});

test("tally retains every player, their color, vote count and Skip", () => {
  const tally = candidates.map(p => ({targetId:p.id, targetName:p.name, targetColor:p.color, votes:p.id === "1" ? 3 : 0, isTop:p.id === "1"}));
  tally.push({targetId:null, targetName:"Skip", targetColor:null, votes:1, isTop:false});
  const html = render(createElement(TallyRoster, {tally, ejectedId:"1"}));
  assert.equal((html.match(/class="tally-name"/g) ?? []).length, 9);
  assert.equal((html.match(/class="tally-slime"/g) ?? []).length, 8);
  assert.match(html, /BANISHED/); assert.match(html, /Skip/);
});

test("discussion shows the full roster but prevents votes until it ends", async () => {
  const html = render(createElement(VoteRoster, {candidates, localPlayerId: "0", alive: true, locked: false, discussing: true, onVote() {}}));
  assert.equal((html.match(/disabled=""/g) ?? []).length, 8);
  assert.match(html, /DISCUSS/);
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /meetingPane|meeting-tabs|Meeting pages/);
  assert.match(page, /Talk it through/);
  assert.match(page, /aria-controls="meeting-private-notes"/);
});

test("all five eye styles remain labeled and selectable", () => {
  const html = render(createElement(EyeStylePicker, {value:"FIERCE", onChange() {}}));
  for (const name of ["Fierce", "Round", "Dreamy", "Joyful", "Starry"]) assert.ok(html.includes(`aria-label="${name} eyes"`));
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
});

test("shared wordmark has no leftover slime-shaped logo", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const logo = source.slice(source.indexOf("function Logo()"), source.indexOf("const COLOR_NAMES"));
  assert.match(logo, /aria-label="Moonwarden"/);
  assert.match(logo, /className="brand-name"/);
  assert.match(logo, /className="release-badge"/);
  assert.doesNotMatch(logo, /brand-mark|<canvas|<svg|<img/);
});

test("app layout uses safe areas and dynamic height without disabling browser zoom", async () => {
  const css = await readFile(new URL("../app/app-menu.css", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(css, /height: 100dvh/);
  assert.match(css, /safe-area-inset/);
  assert.match(css, /\.game-menu-shell\.moon-studio \[hidden\].*display: none !important/);
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.playful-game \.meeting-card[^}]*overflow: hidden/);
  assert.match(css, /--menu-panel: #1c2940/);
  assert.match(css, /--menu-gold: #dfbd7c/);
  assert.doesNotMatch(css, /hue-rotate|#2e6550|#214b3a/);
  assert.match(layout, /viewportFit: "cover"/);
  assert.doesNotMatch(layout, /userScalable:\s*false|maximumScale:\s*1/);
});
