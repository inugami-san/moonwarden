import type { Hat, Role } from "../server/game-types";
import { normalizeEyeStyle, type EyeStyle } from "../server/appearance";
import { matchResultLabel } from "../server/role-presentation";

export type VictoryKind = "WARDEN" | "HOLLOW" | "NEUTRAL";
export type VictoryAppearance = { color: string; hat: Hat; eyeStyle: EyeStyle };
export type MatchVictory = {
  kind: VictoryKind;
  team: string;
  headline: string;
  detail: string;
  personal: string;
  won: boolean;
  hero: VictoryAppearance;
};

// Exact official result codes only. Never guess a winner from player names,
// the local roster's masked roles, or an arbitrary message containing "victory".
const WARDEN_RESULTS = new Set([
  "CREW VICTORY — ALL HOLLOWS WERE EXPOSED",
  "CREW VICTORY — THE IMPOSTOR WAS EJECTED",
  "CREW VICTORY — ALL MOON WARDS RESTORED",
]);
const HOLLOW_RESULTS = new Set([
  "IMPOSTOR VICTORY — CREW AT PARITY",
  "IMPOSTOR VICTORY — THE CREW IS AT PARITY",
]);

export function victoryKind(result: string): VictoryKind {
  return WARDEN_RESULTS.has(result) ? "WARDEN" : HOLLOW_RESULTS.has(result) ? "HOLLOW" : "NEUTRAL";
}

/** Presentation only, called after MATCH_RESULT / the solo engine's final win check. */
export function matchVictory(result: string, local?: VictoryAppearance & { role: Role }): MatchVictory {
  const kind = victoryKind(result);
  const won = kind !== "NEUTRAL" && !!local && (kind === "WARDEN") === (local.role === "CREWMATE");
  const hero: VictoryAppearance = won && local
    ? { color: local.color, hat: local.hat, eyeStyle: normalizeEyeStyle(local.eyeStyle) }
    : { color: kind === "HOLLOW" ? "#a78ad9" : "#83d7d3", hat: kind === "HOLLOW" ? "mooncap" : "antlers", eyeStyle: kind === "HOLLOW" ? "FIERCE" : "JOYFUL" };
  return {
    kind, won, hero,
    team: kind === "WARDEN" ? "Warden victory" : kind === "HOLLOW" ? "The Hollow victory" : "Match complete",
    headline: kind === "WARDEN" ? "Let your light bloom." : kind === "HOLLOW" ? "The Hollow owns the night." : "The circle rests.",
    detail: kind === "WARDEN"
      ? result.endsWith("ALL MOON WARDS RESTORED") ? "Every moonward shines again. The sanctuary is safe." : "Every Hollow has been exposed. The forest can breathe again."
      : kind === "HOLLOW" ? "The shadows outlasted the circle. The sanctuary falls silent." : matchResultLabel(result),
    personal: kind === "NEUTRAL" ? "Thanks for sharing the forest."
      : won ? kind === "WARDEN" ? "You won with the Wardens." : "You won with The Hollow."
        : "Not your night. Your next story awaits.",
  };
}

export const VICTORY_SECONDS = { WARDEN: 5.4, HOLLOW: 5.8, NEUTRAL: 0 } as const;
export const VICTORY_SOUND_AT = 1.15;
export const victoryProgress = (time: number, start: number, end: number) => Number.isFinite(time) ? Math.max(0, Math.min(1, (time - start) / (end - start))) : 0;
