import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RoleReveal, ForestCinematicBackdrop, roleRevealPresentation } from "../app/role-reveal.tsx";

const source = name => readFile(new URL(`../app/${name}`, import.meta.url), "utf8");

test("private role reveal presents actual Warden/Hollow goals without legacy scanner art", () => {
  const warden = roleRevealPresentation("CREWMATE"), hollow = roleRevealPresentation("IMPOSTOR");
  assert.equal(warden.label, "Warden");
  assert.equal(hollow.label, "The Hollow");
  assert.match(warden.objective, /100%/);
  assert.match(warden.objective, /every Hollow/);
  assert.match(hollow.objective, /once per Ordeal/);
  assert.match(hollow.objective, /matches or outnumbers/);
  for (const role of ["CREWMATE", "IMPOSTOR"]) {
    const html = renderToStaticMarkup(createElement(RoleReveal, { role, color: "#96cbd1", accessory: "leafband", eyeStyle: "DREAMY", onContinue() {} }));
    assert.match(html, /role="dialog" aria-modal="true"/);
    assert.match(html, /Only you can see this role/);
    assert.match(html, /Enter the sanctuary/);
    assert.match(html, /data-pose="SEATED"/);
    assert.doesNotMatch(html, /scanline|reveal-orbit|reveal-progress/);
  }
});

test("role scenes preserve chosen accessories/eyes and leave assignment and timers to the parent", async () => {
  const text = await source("role-reveal.tsx");
  assert.match(text, /accessory=\{accessory\}/);
  assert.match(text, /eyeStyle=\{eyeStyle \?\?/);
  assert.match(text, /previous\.isConnected/);
  assert.match(text, /event.key === "Escape"/);
  assert.doesNotMatch(text, /localStorage|sessionStorage|fetch\(|WebSocket|setInterval|setTimeout/);
});

test("banishment remains neutral before authoritative reveal and never invents a role", async () => {
  const text = await source("banishment-overlay.tsx");
  assert.match(text, /const sceneKind = revealed \? outcome.kind.toLowerCase\(\) : "opening"/);
  assert.match(text, /const tone = revealed && \(outcome.kind === "WARDEN" \|\| outcome.kind === "HOLLOW"\) \? outcome.kind : "NEUTRAL"/);
  assert.match(text, /banishmentRevealAt\(outcome.kind, reducedMotion\)/);
  assert.match(text, /banishmentDuration\(outcome.kind, reducedMotion\)/);
  assert.match(text, /key=\{props.outcome.key\}/);
  assert.match(text, /if \(finishedRef.current\) return/);
  assert.match(text, /clearTimeout\(complete\)/);
  assert.match(text, /outcome.kind !== "NONE"/);
  assert.match(text, /The forest keeps this secret/);
  assert.doesNotMatch(text, /BanishmentScene|slimeSkin|slimeEyes|requestAnimationFrame/);
});

test("the shared backdrop is decorative and exact tone choices contain no inferred roster", () => {
  for (const tone of ["WARDEN", "HOLLOW", "NEUTRAL"]) {
    const html = renderToStaticMarkup(createElement(ForestCinematicBackdrop, { tone }));
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, new RegExp(`data-tone="${tone}"`));
    assert.equal((html.match(/<i>/g) ?? []).length, 6);
    assert.doesNotMatch(html, /playerId|roster|winner|<button/);
  }
});

test("forest cinematic motion is bounded, responsive and reduced-motion safe", async () => {
  const role = await source("role-reveal.css"), banishment = await source("banishment.css"), victory = await source("victory.css");
  assert.match(role, /menu-grove-v1\.webp/);
  assert.match(role, /safe-area-inset/);
  assert.match(role, /orientation: landscape/);
  for (const css of [role, banishment, victory]) {
    assert.match(css, /prefers-reduced-motion: reduce/);
    assert.doesNotMatch(css, /infinite|strobe|shake|https?:\/\//);
  }
  assert.match(banishment, /banishment-moonward-farewell/);
  assert.match(banishment, /banishment-shadow-unravel/);
  assert.match(victory, /victory-flower-bloom/);
  assert.match(victory, /victory-root-arrive/);
});

test("art-preview control styling cannot resize or restyle cinematic overlays", async () => {
  const css = await source("victory.css");
  const preview = await source("dev/victory/victory-preview.tsx");
  assert.match(preview, /className="victory-preview-controls"/);
  assert.match(css, /\.victory-preview-controls \{ display: grid; gap: 18px; width: min\(500px, 100%\)/);
  assert.doesNotMatch(css, /\.victory-preview\s+(?:>|h1|p|small|a|button)/);
});
