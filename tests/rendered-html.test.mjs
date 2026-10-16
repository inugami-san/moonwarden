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

test("server-renders the Moonwarden lobby", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Moonwarden — Trust the Light<\/title>/i);
  assert.match(html, /ORDEAL/);
  assert.match(html, /SILVERPINE SUMMIT/);
  assert.match(html, /ENTER THE MOONWARD/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("includes the complete social-deduction simulation", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /destination-out/);
  assert.match(source, /TOTAL BLACKOUT/);
  assert.match(source, /THICK SEA FOG/);
  assert.match(source, /MOON GLARE/);
  assert.match(source, /MOONGLARE/);
  assert.match(source, /ROOTWAKE/);
  assert.match(source, /PHANTOM PROCESSION/);
  assert.match(source, /FALSE ECHO/);
  assert.match(source, /resolveRootPosition/);
  assert.match(source, /drawRootwakeOcclusion/);
  assert.match(source, /LOCAL WARD/);
  assert.match(source, /sharesRootCell/);
  assert.match(source, /visibilityAlpha/);
  assert.match(source, /saturate\(\.34\) brightness\(\.72\)/);
  assert.match(source, /startMeeting/);
  assert.match(source, /VOTES COUNTED/);
  assert.match(source, /WARDEN CHANNEL/);
  assert.match(source, /sendChatMessage/);
  assert.match(source, /Ghosts cannot speak to the living/);
  assert.match(source, /Vote totals by player/);
  assert.match(source, /resolveMeeting/);
  assert.match(source, /createMathPuzzle/);
  assert.match(source, /createLinkPuzzle/);
  assert.match(source, /MOON SHRINE/);
  assert.match(source, /MOONWARDEN SANCTUARY/);
  assert.match(source, /checkWin/);
  assert.match(source, /roleChoice === "IMPOSTOR"/);
  assert.match(source, /roleChoice === "CREWMATE"/);
  assert.match(source, /roleReveal/);
  assert.match(source, /WARDEN/);
  assert.match(source, /IMPOSTOR/);
  assert.match(source, /ITEM ACQUIRED/);
  assert.match(source, /WARD SEALED/);
  assert.match(source, /MOON SIGHT AWAKENED/);
  assert.match(source, /KILL_COOLDOWN_SECONDS/);
  assert.match(source, /killUsedThisOrdeal/);
  assert.match(source, /one strike per Ordeal/);
  assert.match(source, /completeStation/);
  assert.match(source, /resumeAfterDeathReveal/);
  assert.match(source, /KILLED BY/);
  assert.match(source, /CONTINUE AS SPECTATOR/);
  assert.match(source, /kill-notice/);
  assert.match(source, /A Warden was dissolved/);
  assert.match(source, /hostile-moon\.mp3/);
  assert.match(source, /moonlit-deduction\.mp3/);
  assert.match(source, /crossfadeTo/);
  assert.match(source, /BGM ON/);
  assert.match(source, /WARDENS GATHERED/);
});

test("shared kill notice is compact, non-blocking, and preserves private killer reveal", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const notice = source.match(/\{killNotice && \(([\s\S]*?)\n      \)\}/)?.[1];
  assert.ok(notice);
  assert.match(notice, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(notice, /A Warden was dissolved/);
  assert.doesNotMatch(notice, /killerName|killerColor|victim|aria-modal|role="dialog"/);
  const style = css.match(/\.kill-notice \{([^}]+)\}/)?.[1];
  assert.match(style ?? "", /top: 64px/);
  assert.match(style ?? "", /width: max-content/);
  assert.match(style ?? "", /pointer-events: none/);
  assert.doesNotMatch(style ?? "", /inset:|position: fixed|backdrop-filter/);
  assert.doesNotMatch(css, /kill-cinematic|kill-whiteout|kill-camera-shock/);
  assert.match(source, /setTimeout\(\(\) => setKillNotice\(null\), 2400\)/);
  assert.match(source, /className="death-reveal" role="dialog"/);
});
