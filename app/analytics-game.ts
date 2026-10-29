import { trackGameEvent } from "./analytics";

type GameMode = "solo" | "multiplayer";

/** A player's participation, not a global count of unique matches. */
export class GameAnalyticsLifecycle {
  private participation: { mode: GameMode; startedAt: number; completed: boolean } | null = null;

  constructor(
    private readonly emit: typeof trackGameEvent = trackGameEvent,
    private readonly now: () => number = () => performance.now(),
  ) {}

  start(mode: GameMode, playerCount: number) {
    // Server retries and React effect replay must not count the same match twice.
    if (this.participation) return;
    this.participation = { mode, startedAt: this.now(), completed: false };
    this.emit("match_started", { mode, player_count: playerCount });
  }

  complete(result: string) {
    const participation = this.participation;
    if (!participation || participation.completed) return;
    participation.completed = true;
    // Translate the known result prefix only; never send display text or names.
    const outcome = result.startsWith("CREW VICTORY")
      ? "wardens"
      : result.startsWith("IMPOSTOR VICTORY") ? "impostor" : "unknown";
    this.emit("match_completed", {
      mode: participation.mode,
      duration_seconds: this.duration(participation.startedAt),
      outcome,
    });
  }

  leave() {
    const participation = this.participation;
    if (!participation) return;
    this.participation = null;
    if (!participation.completed) {
      this.emit("match_left", {
        mode: participation.mode,
        duration_seconds: this.duration(participation.startedAt),
      });
    }
  }

  private duration(startedAt: number) {
    return Math.max(0, Math.round((this.now() - startedAt) / 1000));
  }
}
