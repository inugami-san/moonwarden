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

const VERDICT_ROLE_SUFFIXES: readonly (readonly [string, Role])[] = [
  [" was ejected — THE HOLLOW", "IMPOSTOR"],
  [" was ejected — THE IMPOSTOR", "IMPOSTOR"],
  [" was ejected — WARDEN", "CREWMATE"],
  [" was ejected — CREWMATE", "CREWMATE"],
];

/**
 * The single post-verdict role source for presentation. It reads only the
 * official concluded-meeting verdict (current or legacy room servers), never a
 * locally defaulted role. Anything unrecognised returns null: no role reveal.
 */
export function verdictRole(verdict: string | null | undefined): Role | null {
  if (typeof verdict !== "string") return null;
  for (const [suffix, role] of VERDICT_ROLE_SUFFIXES) {
    if (verdict.length > suffix.length && verdict.endsWith(suffix)) return role;
  }
  return null;
}

const MATCH_RESULT_LABELS: Readonly<Record<string, string>> = {
  "CREW VICTORY — ALL HOLLOWS WERE EXPOSED": "WARDEN VICTORY — ALL HOLLOWS WERE EXPOSED",
  "CREW VICTORY — THE IMPOSTOR WAS EJECTED": "WARDEN VICTORY — THE HOLLOW WAS EJECTED",
  "CREW VICTORY — ALL MOON WARDS RESTORED": "WARDEN VICTORY — ALL MOON WARDS RESTORED",
  "IMPOSTOR VICTORY — CREW AT PARITY": "THE HOLLOW VICTORY — THE WARDENS ARE AT PARITY",
  "IMPOSTOR VICTORY — THE CREW IS AT PARITY": "THE HOLLOW VICTORY — THE WARDENS ARE AT PARITY",
};

/** Translate only known result codes, never arbitrary messages or player names. */
export function matchResultLabel(result: string): string {
  return Object.hasOwn(MATCH_RESULT_LABELS, result) ? MATCH_RESULT_LABELS[result] : result;
}
