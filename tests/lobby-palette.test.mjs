import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import postcss from "postcss";

const css = await readFile(new URL("../app/home-welcome.css", import.meta.url), "utf8");
const ast = postcss.parse(css);
const shared = ast.nodes.find(node => node.type === "rule" && node.selector === ".moon-studio");
const tokens = Object.fromEntries(shared.nodes.filter(node => node.type === "decl").map(node => [node.prop, node.value]));
const roomRules = [];
ast.walkRules(rule => { if (rule.selector.includes(".studio-in-room")) roomRules.push(rule); });

function declaration(selector, property) {
  return roomRules.find(rule => rule.selector === selector)?.nodes.find(node => node.type === "decl" && node.prop === property)?.value;
}

function contrast(a, b) {
  const luminance = hex => {
    const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  const first = luminance(a), second = luminance(b);
  return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
}

test("home and room inherit the same twilight interface tokens, not a home-only palette", () => {
  assert.ok(shared, "the shared shell owns its palette before either state is selected");
  assert.equal(tokens["--home-ink"], "#302e50");
  assert.equal(tokens["--home-paper"], "#fffef8");
  assert.equal(tokens["--home-gold"], "#e9cea5");
  assert.equal(tokens["--studio-ink"], "var(--home-ink)");
  assert.equal(tokens.color, "var(--home-ink)");
  assert.match(declaration(".studio-in-room", "background"), /#e5e4f3, #d8dded 58%, #c6cce1/);
  assert.equal(declaration(".studio-in-room .studio-frame", "background"), "transparent");
  assert.equal(declaration(".studio-in-room .lobby-console", "background"), "var(--home-paper)");
});

test("all waiting-room surfaces and the start button use the welcome palette", () => {
  const surfaces = roomRules.find(rule => rule.selector.includes(":is(.room-code-banner,"));
  for (const className of [".room-code-banner", ".inroom-profile-bar", ".inroom-wardrobe-drawer", ".lobby-comms-box", ".host-panel"]) assert.ok(surfaces.selector.includes(className));
  assert.equal(surfaces.nodes.find(node => node.prop === "background").value, "var(--home-soft)");
  const startSelector = ".studio-in-room .mp-btn-primary, .studio-in-room .launch-button";
  assert.equal(declaration(startSelector, "background"), "var(--home-gold)");
  assert.equal(declaration(startSelector, "color"), "var(--home-gold-ink)");
  assert.equal(declaration(".studio-in-room .warden-slot-card.is-you", "background"), "#ece5f5");
  assert.equal(declaration(".studio-in-room .lobby-comms-line", "color"), "#49415f");
});

test("twilight text, preparation, ready and primary action colors retain readable contrast", () => {
  for (const [foreground, background] of [
    [tokens["--home-ink"], tokens["--home-paper"]],
    [tokens["--home-muted"], tokens["--home-soft"]],
    [tokens["--home-gold-ink"], tokens["--home-gold"]],
    [tokens["--home-ready"], "#e3eaf5"],
    ["#fff8ea", tokens["--home-accent"]],
  ]) assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background}`);
});

test("room recoloring never filters player sprites, overrides identity fills, or leaks into gameplay", () => {
  for (const rule of roomRules) {
    assert.doesNotMatch(rule.selector, /(?:^|,)\s*(?:body|:root|\.game-shell|canvas)\b/);
    assert.doesNotMatch(rule.selector, /\.slime-(?:portrait|gel)|\.comms-author/);
    if (rule.selector.includes(".mp-color-btn")) {
      assert.ok(rule.nodes.every(node => node.type !== "decl" || !["background", "background-color", "fill", "filter"].includes(node.prop)), "the identity swatch may receive only selection chrome");
    }
  }
  assert.match(declaration(".studio-in-room :is(button, input, summary):focus-visible", "outline"), /3px solid/);
  assert.equal(declaration(".studio-in-room .waiting-status, .studio-in-room .bot-checkbox-row", "animation"), "none", "legacy pulsing cyan must not return during waiting");
});
