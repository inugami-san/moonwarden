import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportAction } from "../app/report-action.tsx";

test("a locked report is natively disabled and retains its accessible reason", () => {
  const html = renderToStaticMarkup(createElement(ReportAction, { allowed: false, label: "Locked", hint: "Unlocks after the first Ordeal.", onReport() {} }));
  assert.match(html, /disabled=""/);
  assert.match(html, /aria-label="Unlocks after the first Ordeal\."/);
  assert.match(html, /type="button"/);
});

test("available reporting retains its label and ready state", () => {
  const html = renderToStaticMarkup(createElement(ReportAction, { allowed: true, label: "Report", hint: "Report nearby fallen cat.", onReport() {} }));
  assert.doesNotMatch(html, /disabled=/);
  assert.match(html, /action report ready/);
});

test("report activation never opens a tooltip and guards the callback", async () => {
  const source = await readFile(new URL("../app/report-action.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /role="(?:status|dialog|tooltip)"|setTimeout|setExplaining/);
  for (const allowed of [false, true]) {
    let reports = 0;
    const element = ReportAction({ allowed, label: "Report", hint: "Report a fallen cat", onReport() { reports++; } });
    const button = element.props.children;
    assert.equal(button.props.disabled, !allowed);
    button.props.onClick();
    assert.equal(reports, allowed ? 1 : 0);
  }
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
