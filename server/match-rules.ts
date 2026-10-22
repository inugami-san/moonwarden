/** Shared solo/server balance. Public progress is settled in anonymous batches. */
export const WARD_SETTLE_SECONDS = 4;
export const STEALTH_BODY_DELAY_SECONDS = 8;
export const STEALTH_COOLDOWN_SECONDS = 45;
export const STEALTH_ORDEAL_LOCKOUT = 2;
export const REPORTER_VOTE_DRIFT_CHANCE = 0.25;

export type VoteReceipt = { targetId: string | null; shifted: boolean };

/** Role-blind: a body's reporter can miscast one ballot, not detect a Hollow. */
export function resolveReporterVote(voterId: string, requestedTargetId: string | null, livingIds: readonly string[], bodyReporterId: string | null | undefined, random: () => number = Math.random, chaosMoonsway = false): VoteReceipt {
  const unchanged = { targetId: requestedTargetId, shifted: false };
  if (!chaosMoonsway || voterId !== bodyReporterId || requestedTargetId === null || !livingIds.includes(voterId) || !livingIds.includes(requestedTargetId)) return unchanged;
  const alternatives = livingIds.filter(id => id !== voterId && id !== requestedTargetId);
  if (!alternatives.length || random() >= REPORTER_VOTE_DRIFT_CHANCE) return unchanged;
  return { targetId: alternatives[Math.min(alternatives.length - 1, Math.floor(random() * alternatives.length))], shifted: true };
}

export function clampHollowCount(value: number | undefined, players: number): number {
  return Math.max(1, Math.min(Math.floor(Math.max(2, players) / 2), Number.isFinite(value) ? Math.floor(value!) : 1));
}

export function ritualProgress(livingWardens: number, ordeal: boolean, hollow = false, hollowCount = 1): number {
  // More hands means smaller contributions. At least ~7 complete shrine rounds
  // at 8 players, rather than two fast circuits ending the whole match.
  const gain = Math.max(1.5, Math.min(5, 14 / Math.max(1, livingWardens)));
  return Math.round(gain * (ordeal ? 1.25 : 1) * (hollow ? -0.65 / Math.max(1, hollowCount) : 1) * 10) / 10;
}

export function hollowVictory(wardens: number, hollows: number, startingWardens: number, startingHollows: number): boolean {
  // A 50/50 lobby must not end at spawn. Its first elimination breaks the tie.
  return hollows > 0 && (wardens === 0 || (hollows >= wardens && (wardens < startingWardens || hollows < startingHollows)));
}
