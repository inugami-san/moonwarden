import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { holdTaskProgress, TASK_HOLD_SECONDS } from "../app/task-hold.ts";
import { TaskHoldGauge } from "../app/task-hold-gauge.tsx";

test("hold gauge follows the real 1.8-second channel and clamps malformed clocks", () => {
  assert.equal(TASK_HOLD_SECONDS, 1.8);
  assert.equal(holdTaskProgress(.9), .5);
  assert.equal(holdTaskProgress(1.8), 1);
  assert.equal(holdTaskProgress(20), 1);
  for (const value of [NaN, Infinity, undefined, -1]) assert.equal(holdTaskProgress(value), 0);
});

test("the visible gauge exposes both progress and remaining seconds without live-region spam", () => {
  const idle = renderToStaticMarkup(createElement(TaskHoldGauge, { progress: 0, holding: false }));
  const halfway = renderToStaticMarkup(createElement(TaskHoldGauge, { progress: .5, holding: true }));
  assert.match(idle, /Hold E or hold the button/);
  assert.match(idle, /1.8s/);
  assert.match(halfway, /<progress[^>]+value="0.5"/);
  assert.match(halfway, /50 percent, 0.9 seconds remaining/);
  assert.match(halfway, /Attuning · 50%/);
  assert.doesNotMatch(halfway, /aria-live/);
});

test("the snapshot comparison publishes gauge and report countdown changes, and touch holds capture/release input", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /a.taskHoldProgress === b.taskHoldProgress/);
  assert.match(source, /a.taskHolding === b.taskHolding/);
  assert.match(source, /a.reportLabel === b.reportLabel/);
  assert.match(source, /this.taskHold >= TASK_HOLD_SECONDS/);
  assert.match(source, /<TaskHoldGauge progress=\{snapshot.taskHoldProgress\}/);
  const prompt = source.slice(source.indexOf('className="interaction-prompt-button"')).split("</button>")[0];
  assert.match(prompt, /setPointerCapture/);
  assert.match(prompt, /onLostPointerCapture/);
  assert.match(prompt, /onBlur/);
  assert.match(prompt, /onKeyDown/);
  assert.match(prompt, /onKeyUp/);
});
