import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportAction } from "../app/report-action.tsx";

test("a locked report remains an explainable native touch/keyboard control", () => {
  const html = renderToStaticMarkup(createElement(ReportAction, { allowed: false, label: "Locked", hint: "Unlocks after the first Ordeal.", onReport() {} }));
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /aria-label="Unlocks after the first Ordeal\."/);
  assert.doesNotMatch(html, / disabled(?:=|>)/);
  assert.match(html, /type="button"/);
});

test("available reporting retains its label and ready state", () => {
  const html = renderToStaticMarkup(createElement(ReportAction, { allowed: true, label: "Report", hint: "Report nearby fallen cat.", onReport() {} }));
  assert.match(html, /aria-disabled="false"/);
  assert.match(html, /action report ready/);
});

test("locked activation explains without reporting; feedback expires and cleans up", async () => {
  const source = await readFile(new URL("../app/report-action.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(allowed\) \{ setExplaining\(false\); onReport\(\); return; \}/);
  assert.match(source, /role="status"/);
  assert.match(source, /4500/);
  assert.match(source, /useEffect\(\(\) => \(\) =>.*clearTimeout/);
});

test("first reward cue is confirmed once, time bounded, and respects reduced motion", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/clarity.css", import.meta.url), "utf8");
  assert.match(source, /next\.rewardNotice && !firstRewardSeenRef\.current/);
  assert.match(source, /firstRewardSeenRef\.current = true/);
  assert.match(source, /2600/);
  assert.match(source, /data-first-gear=\{firstGearCue\}/);
  assert.match(css, /first-gear-ready \.8s ease-in-out 3/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
