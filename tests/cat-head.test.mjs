import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CatHead } from "../app/cat-head.tsx";
import { VoteRoster, TallyRoster } from "../app/meeting-roster.tsx";

test("head icons are SSR-safe high resolution static canvases, not slime shapes", () => {
  const html = renderToStaticMarkup(createElement(CatHead, { color: "#8257cb", eyeStyle: "STARRY" }));
  assert.match(html, /class="cat-head"/); assert.match(html, /width="240" height="240"/);
  assert.match(html, /data-eye-style="STARRY"/); assert.match(html, /aria-hidden="true"/);
  assert.doesNotMatch(html, /<i|<svg|slime-portrait/);
});

test("voting and totals use colored cat heads without removing player identity or skip", () => {
  const candidates = [{ id: "a", name: "Mochi", color: "#20d8ed", eyeStyle: "ROUND", alive: true }, { id: "b", name: "Pip", color: "#ff5d9e", eyeStyle: "JOYFUL", alive: false }];
  const votes = renderToStaticMarkup(createElement(VoteRoster, { candidates, localPlayerId: "a", alive: true, locked: false, onVote() {} }));
  assert.equal((votes.match(/class="cat-head"/g) ?? []).length, 2);
  assert.match(votes, /Mochi/); assert.match(votes, /Pip/); assert.match(votes, /ELIMINATED/);
  const totals = renderToStaticMarkup(createElement(TallyRoster, { tally: [
    { targetId: "a", targetName: "Mochi", targetColor: "#20d8ed", votes: 2, isTop: true },
    { targetId: null, targetName: "Skip", votes: 1, isTop: false },
  ] }));
  assert.equal((totals.match(/class="cat-head"/g) ?? []).length, 1); assert.match(totals, /Skip/);
});

test("head crop excludes the cat body and shares cached art without an animation loop", async () => {
  const source = await readFile(new URL("../app/cat-head.tsx", import.meta.url), "utf8");
  assert.match(source, /drawSeatedCat\(context, color, eyeStyle\)/);
  assert.match(source, /context.quadraticCurveTo\(29, -9, 0, -7\)/);
  assert.match(source, /context.quadraticCurveTo\(-29, -9, -36, -23\)/);
  assert.doesNotMatch(source, /context.rect\(/, "curved chin excludes scarf and low tail corners");
  assert.match(source, /direction: "SOUTH"/);
  assert.match(source, /if \(active\) paint\(\)/);
  assert.match(source, /active = false/);
  assert.doesNotMatch(source, /requestAnimationFrame|setInterval|getImageData|putImageData/);
});

test("meeting chat avatars use cat heads while system messages stay avatar-free", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const chat = page.slice(page.indexOf("{chatMessages.map((message) =>"), page.indexOf("<form className=\"chat-composer\""));
  assert.match(chat, /message.system \? \(/);
  assert.match(chat, /<div className="chat-system"[^>]*><span>◆<\/span>\{message.text\}<\/div>/);
  assert.match(chat, /<span className="chat-avatar"><CatHead color=\{message.playerColor \?\? "#8257cb"\}/);
  assert.doesNotMatch(chat, /--chat-color|<i \/><i \/>/);
  assert.match(page, /meeting.reason.replace\("WAS FOUND AS A JELLY PUDDLE", "— FALLEN WARDEN REPORTED"\)/);
});

test("both role reveals replace the old CSS blob and keep role-specific cat expression", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const role = page.slice(page.indexOf("{roleReveal && ("), page.indexOf("{killNotice && ("));
  assert.match(role, /reveal-cat-sigil/); assert.match(role, /<CatHead color=\{networkState\?\.players.find/);
  assert.match(role, /soloProfile\?\.color \?\? COLORS\[0\]/);
  assert.match(role, /"FIERCE" : "JOYFUL"/); assert.doesNotMatch(role, /impostor-sigil|<i \/><i \/><b \/>/);
  const css = await readFile(new URL("../app/play-menu.css", import.meta.url), "utf8");
  assert.match(css, /\.warden-theme \.reveal-cat-sigil/); assert.match(css, /\.impostor-theme \.reveal-cat-sigil/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
