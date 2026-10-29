/** Shared solo/server balance. Public progress is settled in anonymous batches. */
export const WARD_SETTLE_SECONDS = 4;
export const STEALTH_BODY_DELAY_SECONDS = 8;
export const STEALTH_COOLDOWN_SECONDS = 45;
export const STEALTH_ORDEAL_LOCKOUT = 2;
export const REPORTER_VOTE_DRIFT_CHANCE = 0.25;
export const MEETING_DISCUSSION_MS = 10_000;
export const MEETING_DURATION_MS = 75_000;
export const ROUND_SIPHON_LIMIT = 4;

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
  return Math.max(1, Math.min(players >= 7 ? 2 : 1, Number.isFinite(value) ? Math.floor(value!) : 1));
}

export function ritualProgress(livingWardens: number, ordeal: boolean, hollow = false, hollowCount = 1): number {
  // Keep larger teams' first seals meaningful; follow-up and sabotage ceilings
  // are enforced separately by the per-cycle ledger below.
  const gain = Math.max(3, Math.min(4, 18 / Math.max(1, livingWardens)));
  return Math.round(gain * (ordeal ? 1.25 : 1) * (hollow ? -0.65 / Math.max(1, hollowCount) : 1) * 10) / 10;
}

/** Shared by solo and rooms. Personal rewards never consume someone else's rite.
 * Only two follow-up rites per shrine add a small team bonus; sabotage has one
 * shared ceiling for the entire Hollow team, not a ceiling per attacker. */
export class RestorationLedger {
  private claims = new Map<string, number>();
  private siphoned = 0;
  private bonusSpent = false;
  reset() { this.claims.clear(); this.siphoned = 0; this.bonusSpent = false; }
  claim(station: string, wardens: number, ordeal: boolean, hollow: boolean, hollows: number, overgrown = false) {
    if (hollow) {
      const loss = Math.min(ROUND_SIPHON_LIMIT - this.siphoned, -ritualProgress(wardens, ordeal, true, hollows));
      this.siphoned = Math.round((this.siphoned + loss) * 10) / 10;
      return -loss || 0;
    }
    const count = this.claims.get(station) ?? 0;
    this.claims.set(station, count + 1);
    let gain = count === 0 ? ritualProgress(wardens, ordeal) : count < 3 ? .5 : 0;
    if (overgrown && ordeal && !this.bonusSpent) { gain += 1.5; this.bonusSpent = true; }
    return Math.round(gain * 10) / 10;
  }
}

export function hollowVictory(wardens: number, hollows: number, startingWardens: number, startingHollows: number): boolean {
  // A 50/50 lobby must not end at spawn. Its first elimination breaks the tie.
  return hollows > 0 && (wardens === 0 || (hollows >= wardens && (wardens < startingWardens || hollows < startingHollows)));
}
