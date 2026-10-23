import type { Hat, Role } from "../server/game-types";
import { normalizeEyeStyle, type EyeStyle } from "../server/appearance";
import { verdictRole } from "../server/role-presentation";

/**
 * "The Moon's Judgment" — the vote-out cinematic. This module is pure data:
 * which ending to play, the copy to show, and the shared timeline. It never
 * decides a meeting outcome; it only presents the official concluded verdict.
 */
export type BanishmentKind = "WARDEN" | "HOLLOW" | "UNREVEALED" | "NONE";

export type BanishmentOutcome = {
  /** One cinematic per concluded meeting. */
  key: string;
  kind: BanishmentKind;
  tied: boolean;
  playerId: string | null;
  name: string;
  color: string | null;
  hat: Hat | null;
  eyeStyle: EyeStyle;
  isLocal: boolean;
  eyebrow: string;
  headline: string;
  detail: string;
  /** A single sentence for assistive technology, announced once at the reveal. */
  announcement: string;
};

type TallyLike = { targetId: string | null; targetName: string; targetColor: string | null; targetEyeStyle?: EyeStyle };
type CandidateLike = { id: string; name: string; color: string; hat?: Hat; eyeStyle?: EyeStyle };

export type ConcludedMeeting = {
  key: string;
  ejectedId?: string | null;
  verdict?: string;
  tied?: boolean;
  tally?: readonly TallyLike[];
  candidates: readonly CandidateLike[];
  localPlayerId?: string | null;
};

const ROLE_KIND: Record<Role, BanishmentKind> = { CREWMATE: "WARDEN", IMPOSTOR: "HOLLOW" };
const HATS: readonly Hat[] = ["antlers", "hood", "moth", "mooncap"];

/** Names on the local roster carry a "(YOU)" marker that is not part of the name. */
export function displayName(name: string): string {
  return name.replace(/\s*\(YOU\)$/, "").trim() || "A slime";
}

/** Build the presentation from the official verdict; returns null before a tally exists. */
export function banishmentOutcome(meeting: ConcludedMeeting): BanishmentOutcome | null {
  if (!meeting.tally) return null;
  const ejectedId = meeting.ejectedId ?? null;
  const tied = Boolean(meeting.tied);
  if (!ejectedId) {
    return {
      key: meeting.key, kind: "NONE", tied, playerId: null, name: "", color: null, hat: null,
      eyeStyle: "FIERCE", isLocal: false,
      eyebrow: tied ? "The circle is divided" : "The circle holds its judgment",
      headline: "No one was banished.",
      detail: tied ? "The vote was tied. The rune fades without a verdict." : "The circle chose to skip. The rune fades without a verdict.",
      announcement: tied ? "The vote was tied. No one was banished." : "The vote was skipped. No one was banished.",
    };
  }
  const entry = meeting.tally.find(item => item.targetId === ejectedId);
  const candidate = meeting.candidates.find(item => item.id === ejectedId);
  const name = displayName(entry?.targetName || candidate?.name || "");
  const role = verdictRole(meeting.verdict);
  // An unreadable verdict still banishes the right slime, but reveals nothing.
  const kind = role ? ROLE_KIND[role] : "UNREVEALED";
  const isLocal = Boolean(meeting.localPlayerId && meeting.localPlayerId === ejectedId);
  const subject = isLocal ? "You" : name;
  const copula = isLocal ? "were" : "was";
  const headline = kind === "WARDEN" ? `${subject} ${copula} a Warden.`
    : kind === "HOLLOW" ? `${subject} ${copula} The Hollow.`
      : `${subject} ${copula} banished.`;
  const detail = kind === "WARDEN" ? "An innocent light returns to the moon."
    // Never imply victory: other Hollows may still walk among the circle.
    : kind === "HOLLOW" ? "The forest rejects this shadow and seals it beneath the clearing."
      : "The moon keeps its secret.";
  return {
    key: meeting.key, kind, tied: false, playerId: ejectedId, name,
    color: entry?.targetColor ?? candidate?.color ?? null,
    hat: candidate?.hat && HATS.includes(candidate.hat) ? candidate.hat : null,
    eyeStyle: normalizeEyeStyle(entry?.targetEyeStyle ?? candidate?.eyeStyle),
    isLocal,
    eyebrow: isLocal ? "The circle has chosen you" : "The circle has chosen",
    headline, detail,
    announcement: kind === "UNREVEALED" ? `${headline} Their role stays hidden.` : headline,
  };
}

/**
 * Seconds from the start of the cinematic. The opening is shared and neutral;
 * nothing role-specific is drawn before `branch`. The whole presentation stays
 * well inside the room server's seven-second result window.
 */
export const BANISHMENT_TIMELINE = Object.freeze({
  opening: 1.0,
  branch: 1.0,
  reveal: { WARDEN: 2.4, HOLLOW: 2.55, UNREVEALED: 2.1, NONE: 1.2 } satisfies Record<BanishmentKind, number>,
  settle: { WARDEN: 3.2, HOLLOW: 3.3, UNREVEALED: 2.9, NONE: 2.35 } satisfies Record<BanishmentKind, number>,
  reducedReveal: 1.3,
  reducedSettle: 2.6,
  fadeOut: 0.42,
});

export function banishmentRevealAt(kind: BanishmentKind, reducedMotion = false) {
  return reducedMotion ? Math.min(BANISHMENT_TIMELINE.reducedReveal, BANISHMENT_TIMELINE.reveal[kind]) : BANISHMENT_TIMELINE.reveal[kind];
}

/** When the overlay begins to fade back to the tally. */
export function banishmentSettleAt(kind: BanishmentKind, reducedMotion = false) {
  return reducedMotion ? Math.min(BANISHMENT_TIMELINE.reducedSettle, BANISHMENT_TIMELINE.settle[kind]) : BANISHMENT_TIMELINE.settle[kind];
}

export function banishmentDuration(kind: BanishmentKind, reducedMotion = false) {
  return banishmentSettleAt(kind, reducedMotion) + BANISHMENT_TIMELINE.fadeOut;
}

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
/** Normalised progress of `t` through [start, end]. */
export const span = (t: number, start: number, end: number) => clamp01((t - start) / (end - start));
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeInOut = (x: number) => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
export const easeIn = (x: number) => x * x * x;
export const easeOutBack = (x: number) => { const c = 1.5; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

/** Deterministic per-meeting randomness: every viewer of a key sees the same scene. */
export function seededRandom(seedText: string) {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i++) seed = Math.imul(seed ^ seedText.charCodeAt(i), 16777619);
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
