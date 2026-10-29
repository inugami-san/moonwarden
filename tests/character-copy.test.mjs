import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { banishmentOutcome } from "../app/banishment.ts";

test("character UI has no leftover slime wording in labels, tooltips or accessibility text", async () => {
  for (const file of ["page.tsx", "banishment.ts", "banishment-overlay.tsx", "meeting-roster.tsx"]) {
    const source = await readFile(new URL(`../app/${file}`, import.meta.url), "utf8");
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = node => {
      if (ts.isStringLiteralLike(node) || ts.isJsxText(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
        // Ignore code identifiers, CSS class names and paths, not human-readable words.
        assert.doesNotMatch(node.text, /(?:^|\s)slimes?(?=[\s.!?:,]|$)/i, `${file}: ${node.text}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
});

test("unnamed vote-out uses a neutral cat fallback without exposing a role", () => {
  const outcome = banishmentOutcome({ key: "unnamed", ejectedId: "p1", candidates: [], tally: [] });
  assert.equal(outcome.name, "A cat");
  assert.equal(outcome.kind, "UNREVEALED");
  assert.equal(outcome.headline, "A cat was banished.");
  assert.equal(outcome.announcement, "A cat was banished. Their role stays hidden.");
});

test("skip and tie cinematic openings refer to the circle, not an ejected cat", async () => {
  const overlay = await readFile(new URL("../app/banishment-overlay.tsx", import.meta.url), "utf8");
  assert.match(overlay, /outcome.kind === "NONE" \? "The circle" : displayName\(outcome.name\)/);
  for (const tied of [true, false]) {
    const outcome = banishmentOutcome({ key: "no-ejection", tied, candidates: [], tally: [] });
    assert.equal(outcome.kind, "NONE");
    assert.equal(outcome.name, "");
    assert.equal(outcome.headline, "No one was banished.");
  }
});
