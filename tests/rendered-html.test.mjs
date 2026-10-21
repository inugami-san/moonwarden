import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(new URL(path, "http://localhost/"), { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("privacy settings render without embedding or preloading a Google tag", async () => {
  const html = await (await render()).text();
  assert.match(html, /Privacy settings/);
  assert.match(html, /<dialog[^>]*aria-labelledby="mw-privacy-title"/);
  assert.doesNotMatch(html, /<script[^>]+src="[^"]*(?:googletagmanager|google-analytics)/);
  assert.doesNotMatch(html, /<link[^>]+href="[^"]*(?:googletagmanager|google-analytics)/);
});

test("privacy disclosure is a working route with a settings entry point", async () => {
  const response = await render("/privacy");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Privacy in the glade/);
  assert.match(html, /Open privacy settings/);
  assert.match(html, /180 days/);
  assert.match(html, /cookie-based browser identifiers/);
});

test("server-renders the Moonwarden lobby", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Moonwarden — Trust the Light<\/title>/i);
  assert.match(html, /Ordeal/i);
  assert.match(html, /SILVERPINE SUMMIT/);
  assert.match(html, /CREATE ROOM/);
  assert.match(html, /JOIN WITH CODE/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("homepage displays the canonical release version in its branding", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const html = await (await render()).text();
  assert.ok(html.includes(`data-game-version="${pkg.version}"`));
  assert.ok(html.includes(`v${pkg.version} · BETA`));
});

test("the built site serves uncached version metadata without room or secret data", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const response = await render("/api/version");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const metadata = await response.json();
  assert.equal(metadata.version, pkg.version);
  assert.equal(metadata.name, "Moonwarden");
  assert.equal(metadata.channel, "beta");
  assert.deepEqual(Object.keys(metadata).sort(), ["channel", "name", "version", "worldVersion"]);
});

test("homepage and social metadata introduce The Hollow without the old role name", async () => {
  const html = await (await render()).text();
  assert.match(html, /One friend is secretly The Hollow/);
  assert.match(html, /Uncover The Hollow hiding in your circle/);
  for (const attribute of ['name="description"', 'property="og:description"', 'name="twitter:description"']) {
    const tag = html.match(new RegExp(`<meta[^>]*${attribute}[^>]*>`))?.[0] ?? "";
    assert.match(tag, /The Hollow/);
  }
  assert.doesNotMatch(html, /impostor|crewmate/i);
});

test("homepage prioritizes multiplayer with an accessible, clearly labeled local preview", async () => {
  const html = await (await render()).text();
  const modes = html.match(/<div class="lobby-mode-switch"[\s\S]*?<\/div>/)?.[0];
  assert.match(modes ?? "", /aria-selected="true"[^>]*><span>✦ MULTIPLAYER/);
  assert.match(modes ?? "", /aria-selected="false"[\s\S]*?Practice with AI/);
  assert.ok(html.indexOf("CREATE ROOM") < html.indexOf('class="home-wardrobe"'), "room actions come before the optional wardrobe");
  assert.match(html, /INTERACTIVE PREVIEW/);
  assert.match(html, /aria-label="Meet the preview wardens"/);
  assert.match(html, /aria-label="Preview an Ordeal"/);
  assert.match(html, /Moonlit calm/);
  assert.match(html, /Sea fog/);
  assert.match(html, /Blackout/);
  assert.match(html, /NOT CHECKED/);
  const preview = html.match(/class="preview-circle"[\s\S]*?class="preview-weather"/)?.[0] ?? "";
  const colors = Array.from(preview.matchAll(/style="--slime:([^"]+)"/g), (match) => match[1]);
  assert.equal(colors.length, 5);
  assert.equal(new Set(colors).size, 5, "demo wardens have distinct colors too");
  assert.doesNotMatch(html, /Choose test role|PRIVATE PLAYTEST|SOLO TRIAL \(BOTS\)/);
});

test("play-first menu exposes entry and name before optional customization", async () => {
  const html = await (await render()).text();
  assert.match(html, /class="lobby-shell moon-studio /);
  assert.match(html, /<aside class="studio-guide" aria-label="Moonwarden game guide"/);
  assert.match(html, /class="lobby-copy studio-stage"/);
  assert.match(html, /class="lobby-console lobby-console-multi/);
  assert.match(html, /aria-label="Character preview view"/);
  assert.match(html, /aria-pressed="true">Your warden/);
  assert.match(html, /aria-pressed="false">The circle/);
  assert.match(html, /class="home-wardrobe"/);
  assert.doesNotMatch(html, /class="home-wardrobe" open/);
  assert.match(html, /PLAY WITH FRIENDS/);
  assert.match(html, /JOIN WITH CODE/);
  assert.match(html, /Your name/);
  assert.match(html, /How to Play/);
  assert.ok(html.indexOf('id="play-nickname"') < html.indexOf("CREATE ROOM"));
  assert.match(html, /SURPRISE ME/);
  assert.match(html, /class="home-play-shortcuts"/);
  assert.ok(html.indexOf('class="home-play-shortcuts"') < html.indexOf('class="lobby-copy studio-stage"'), "quick play is available before the decorative scene");
  assert.match(html, /href="#home-room-code"/);
  assert.match(html, /<details class="home-wardrobe"/);
  assert.match(html, /Pause animations/);
  assert.match(html, /class="home-entry-column"/);
  assert.match(html, /class="home-social-column"/);
  assert.doesNotMatch(html, /Brainwave|3D Boy Character|Dome Light|Add 3D objects|Export/);
});

test("home field guide exposes all six ordeals without changing match rules", async () => {
  const html = await (await render()).text();
  assert.match(html, /Explore the six Ordeals/);
  for (const title of ["Total Blackout", "Thick Sea Fog", "Moon Glare", "Rootwake", "Phantom Procession", "Mirror Pool"]) assert.ok(html.includes(title));
  const guide = html.match(/class="home-ordeal-menu"[\s\S]*?<article/)?.[0] ?? "";
  assert.equal((guide.match(/<button/g) ?? []).length, 6);
  assert.equal((guide.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(html, /id="home-ordeal-story"[\s\S]*?aria-live="polite"/);
});

test("welcome forest has layered decorative trees and a twilight palette without changing player colors", async () => {
  const html = await (await render()).text();
  for (const layer of ["distant", "middle", "near", "floor"]) assert.ok(html.includes(`data-forest-layer="${layer}"`));
  assert.ok((html.match(/href="#[^"]+-forest-pine"/g) ?? []).length >= 50, "reused tree art fills the forest without adding image downloads");
  assert.match(html, /class="home-atmosphere" aria-hidden="true"/);
  const css = await readFile(new URL("../app/home-welcome.css", import.meta.url), "utf8");
  assert.match(css, /--home-ink: #302e50/);
  assert.match(css, /\.home-atmosphere[^}]*pointer-events: none/);
  assert.doesNotMatch(css, /filter:\s*hue-rotate/, "recolor the scenery, not players' selected colors");
});

test("wardrobe offers five labeled eye styles with exactly one selected", async () => {
  const html = await (await render()).text();
  const picker = html.match(/class="eye-style-options"[\s\S]*?<\/div>/)?.[0] ?? "";
  for (const label of ["Fierce", "Round", "Dreamy", "Joyful", "Starry"]) {
    assert.ok(picker.includes(`aria-label="${label} eyes"`));
  }
  assert.equal((picker.match(/<button/g) ?? []).length, 5);
  assert.equal((picker.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(html, /Hidden when an Ordeal conceals your identity/);
});

test("join field uses a neutral code hint, not a sample room invitation", async () => {
  const html = await (await render()).text();
  assert.match(html, /placeholder="CODE"/);
  assert.doesNotMatch(html, /placeholder="LUNA"/);
  assert.match(html, /aria-label="4-letter room code"/);
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
  assert.match(source, /keepInRootCell/);
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
  assert.match(source, /drawMoonGlade/);
  assert.match(source, /checkWin/);
  assert.match(source, /roleChoice === "IMPOSTOR"/);
  assert.match(source, /roleChoice === "CREWMATE"/);
  assert.match(source, /roleReveal/);
  assert.match(source, /WARDEN/);
  assert.match(source, /IMPOSTOR/);
  assert.match(source, /YOUR RITUAL IS COMPLETE/);
  assert.match(source, /YOUR RITE IS COMPLETE/);
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

test("lobby exposes errors inside rooms and disables stale room controls", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /tab === "MULTI" && displayError/);
  assert.match(source, /className="waiting-room-controls" disabled=\{!mpState.connected\}/);
  assert.match(source, /This roster is no longer live/);
  assert.match(source, /RETURN TO LOBBY/);
  assert.doesNotMatch(source, /WEBSOCKET READY/);
});

test("wrong answers use a small non-blocking alert without a modal or focus capture", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const notification = source.slice(source.indexOf("{snapshot.taskFailure &&"), source.indexOf("{puzzle && ("));
  assert.match(notification, /className="task-failure-toast" role="alert"/);
  assert.doesNotMatch(notification, /modal-backdrop|aria-modal|autoFocus|<button/);
  assert.doesNotMatch(source, /if \(this\.taskFailure\)/);
  const style = css.match(/\.task-failure-toast \{([^}]+)\}/)?.[1] ?? "";
  assert.match(style, /width: min\(420px, calc\(100% - 24px\)\)/);
  assert.match(style, /pointer-events: none/);
  assert.doesNotMatch(style, /inset:|backdrop-filter/);
  assert.doesNotMatch(css, /task-failure-card/);
});

test("Moonsway explains the risk, confirms the actual destination, and preserves meeting chat", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /Moonsway: the body reporter’s player vote has a/);
  assert.match(source, /MOONSWAY — YOUR VOTE SHIFTED/);
  assert.match(source, /Your vote counts toward/);
  assert.match(source, /next\.candidates !== discussionCandidates/);
  assert.match(source, /!!meeting\.localVote \|\| !!meeting\.votePending/);
  assert.match(source, /className=\{`vote-receipt[^\n]*role="status"/);
});
