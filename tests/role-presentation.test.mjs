import assert from "node:assert/strict";
import test from "node:test";
import { ROLE_LABELS, ejectionVerdict, matchResultLabel, meetingVerdictLabel } from "../server/role-presentation.ts";

test("role labels present The Hollow and Warden without changing role IDs", () => {
  assert.deepEqual(ROLE_LABELS, { CREWMATE: "Warden", IMPOSTOR: "The Hollow" });
});

test("ejection verdicts use themed names and preserve the player's name exactly", () => {
  assert.equal(ejectionVerdict("Impostor THE IMPOSTOR", "IMPOSTOR"), "Impostor THE IMPOSTOR was ejected — THE HOLLOW");
  assert.equal(ejectionVerdict("Crewmate", "CREWMATE"), "Crewmate was ejected — WARDEN");
});

test("legacy meeting verdicts translate only their role suffix and are idempotent", () => {
  for (const name of ["Mochi", "Impostor", "THE IMPOSTOR", "Crewmate", "The Hollow", "was ejected — THE IMPOSTOR"]) {
    for (const [legacy, label] of [["THE IMPOSTOR", "THE HOLLOW"], ["CREWMATE", "WARDEN"]]) {
      const formatted = `${name} was ejected — ${label}`;
      assert.equal(meetingVerdictLabel(`${name} was ejected — ${legacy}`), formatted);
      assert.equal(meetingVerdictLabel(formatted), formatted);
    }
  }
  for (const message of ["Vote tied — no one was ejected", "Vote skipped — no one was ejected", "THE IMPOSTOR", "Impostor said CREWMATE", ""]) {
    assert.equal(meetingVerdictLabel(message), message);
  }
});

test("known solo and multiplayer result codes receive themed presentation", () => {
  assert.equal(matchResultLabel("CREW VICTORY — THE IMPOSTOR WAS EJECTED"), "WARDEN VICTORY — THE HOLLOW WAS EJECTED");
  assert.equal(matchResultLabel("CREW VICTORY — ALL MOON WARDS RESTORED"), "WARDEN VICTORY — ALL MOON WARDS RESTORED");
  for (const result of ["IMPOSTOR VICTORY — CREW AT PARITY", "IMPOSTOR VICTORY — THE CREW IS AT PARITY"]) {
    assert.equal(matchResultLabel(result), "THE HOLLOW VICTORY — THE WARDENS ARE AT PARITY");
  }
});

test("unknown result text and names are not rewritten", () => {
  for (const message of ["Impostor's room", "THE IMPOSTOR", "CREW VICTORY — CUSTOM RESULT", "toString", "__proto__", ""]) {
    assert.equal(matchResultLabel(message), message);
  }
});
