import type { Role } from "./game-types";

// Presentation names are separate from the stable multiplayer role IDs.
export const ROLE_LABELS = {
  CREWMATE: "Warden",
  IMPOSTOR: "The Hollow",
} as const satisfies Record<Role, string>;

export function ejectionVerdict(name: string, role: Role): string {
  return `${name} was ejected — ${ROLE_LABELS[role].toUpperCase()}`;
}

/** Accept legacy room-server verdicts without rewriting the ejected name. */
export function meetingVerdictLabel(verdict: string): string {
  return verdict
    .replace(/ was ejected — THE IMPOSTOR$/, " was ejected — THE HOLLOW")
    .replace(/ was ejected — CREWMATE$/, " was ejected — WARDEN");
}

const MATCH_RESULT_LABELS: Readonly<Record<string, string>> = {
  "CREW VICTORY — THE IMPOSTOR WAS EJECTED": "WARDEN VICTORY — THE HOLLOW WAS EJECTED",
  "CREW VICTORY — ALL MOON WARDS RESTORED": "WARDEN VICTORY — ALL MOON WARDS RESTORED",
  "IMPOSTOR VICTORY — CREW AT PARITY": "THE HOLLOW VICTORY — THE WARDENS ARE AT PARITY",
  "IMPOSTOR VICTORY — THE CREW IS AT PARITY": "THE HOLLOW VICTORY — THE WARDENS ARE AT PARITY",
};

/** Translate only known result codes, never arbitrary messages or player names. */
export function matchResultLabel(result: string): string {
  return Object.hasOwn(MATCH_RESULT_LABELS, result) ? MATCH_RESULT_LABELS[result] : result;
}
