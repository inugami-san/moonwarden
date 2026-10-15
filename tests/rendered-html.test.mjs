import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Ordeal Deck lobby", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Ordeal Deck — Trust the Light<\/title>/i);
  assert.match(html, /ORDEAL/);
  assert.match(html, /SS ACHERON/);
  assert.match(html, /BOARD THE ACHERON/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships the complete social-deduction simulation", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /destination-out/);
  assert.match(source, /TOTAL BLACKOUT/);
  assert.match(source, /THICK SEA FOG/);
  assert.match(source, /startMeeting/);
  assert.match(source, /VOTES TRANSMITTED/);
  assert.match(source, /SUSPECTED IMPOSTOR/);
  assert.match(source, /resolveMeeting/);
  assert.match(source, /checkWin/);
  assert.match(source, /roleChoice === "IMPOSTOR"/);
  assert.match(source, /roleChoice === "CREWMATE"/);
  assert.match(source, /AI CREW LINKED/);
});
