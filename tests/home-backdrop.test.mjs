import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { MenuGroveBackdrop } from "../app/home-backdrop.tsx";

test("landing scenery is decorative, local and high-priority without obscuring navigation", () => {
  const html = render(createElement(MenuGroveBackdrop));
  assert.match(html, /class="menu-grove-backdrop" aria-hidden="true"/);
  assert.match(html, /src="\/art\/forest\/menu-grove-v1.webp"/);
  assert.match(html, /alt=""/);
  assert.match(html, /fetchPriority="high"|fetchpriority="high"/);
  assert.equal((html.match(/<img /g) ?? []).length, 1);
  assert.equal((html.match(/--spore-x:/g) ?? []).length, 14);
  assert.doesNotMatch(html, /<button|<a |<canvas|<iframe/);
});

test("painted backdrop is optimized WebP and stored with the project", async () => {
  const bytes = await readFile(new URL("../public/art/forest/menu-grove-v1.webp", import.meta.url));
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  assert.ok(bytes.length > 10_000 && bytes.length < 350_000, "keep the menu backdrop within its download budget");
});

test("new scenery is HOME-only and wardrobe/room navigation keeps its existing backgrounds", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /!inRoom && \(menuScreen === "HOME" \? <MenuGroveBackdrop \/> : <HomeAtmosphere \/>\)/);
  const css = await readFile(new URL("../app/home-backdrop.css", import.meta.url), "utf8");
  assert.match(css, /pointer-events: none/);
  assert.match(css, /\[data-menu="HOME"\] \.home-grove \{ display: none/);
  assert.match(css, /max-width: 650px\) and \(orientation: portrait\)/);
  assert.match(css, /object-fit: cover/);
  assert.doesNotMatch(css, /overflow:\s*(?:scroll|auto)/);
});

test("ambient motion respects both the existing pause setting and reduced-motion preference", async () => {
  const css = await readFile(new URL("../app/home-backdrop.css", import.meta.url), "utf8");
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.home-motion-paused \.menu-grove-backdrop \* \{ animation: none !important/);
  const source = await readFile(new URL("../app/home-backdrop.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /requestAnimationFrame|setInterval|setTimeout|useState|addEventListener/);
});
