export const PAIR_RITUAL_SECONDS = 1.25;
export const PAIR_INTENT_TTL_MS = 1000;
export const PAIR_RITUAL_RANGE = 84;

export type RitualIntent = { stationId: string; until: number; roundId: number };
export type RitualActor = { id: string; x: number; y: number; alive: boolean; vx: number; vy: number };

/** Role-blind eligibility. No roster/role information is added to public cues. */
export function validRitualActors(actors: readonly RitualActor[], station: { id: string; x: number; y: number }, intents: ReadonlyMap<string, RitualIntent>, completed: (id: string) => boolean, roundId: number, now: number) {
  return actors.filter(actor => {
    const intent = intents.get(actor.id);
    return actor.alive && intent?.stationId === station.id && intent.roundId === roundId && intent.until > now
      && !completed(actor.id) && Math.hypot(actor.x - station.x, actor.y - station.y) <= PAIR_RITUAL_RANGE
      && Math.hypot(actor.vx, actor.vy) < 12;
  });
}

export function advancePairRitual(progress: number, participants: number, dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return progress;
  // Both participants must stay for the full channel. No banked progress or solo finish.
  return participants >= 2 ? Math.min(1, progress + Math.min(dt, .1) / PAIR_RITUAL_SECONDS) : 0;
}

export class PairedRituals {
  readonly intents = new Map<string, RitualIntent>();
  private progress = new Map<string, number>();
  private lastNoise = new Map<string, number>();
  private lastState = new Map<string, string>();

  hold(playerId: string, stationId: string, roundId: number, now: number) {
    this.intents.set(playerId, { stationId, roundId, until: now + PAIR_INTENT_TTL_MS });
  }
  release(playerId: string) { this.intents.delete(playerId); this.lastState.delete(playerId); }
  clear() { this.intents.clear(); this.progress.clear(); this.lastNoise.clear(); this.lastState.clear(); }

  tick(actors: readonly RitualActor[], stations: readonly { id: string; x: number; y: number }[], completed: (playerId: string, stationId: string) => boolean, roundId: number, now: number, dt: number) {
    const updates: { playerId: string; stationId: string; progress: number; participants: number; roundId: number }[] = [];
    const completions: { playerId: string; stationId: string }[] = [];
    const sounds: { x: number; y: number }[] = [];
    for (const [id, intent] of this.intents) {
      const actor = actors.find(actor => actor.id === id), station = stations.find(station => station.id === intent.stationId);
      if (!actor || !station || !validRitualActors([actor], station, this.intents, actorId => completed(actorId, station.id), roundId, now).length) {
        updates.push({ playerId: id, stationId: intent.stationId, progress: 0, participants: 0, roundId });
        this.release(id);
      }
    }
    for (const station of stations) {
      const participants = validRitualActors(actors, station, this.intents, id => completed(id, station.id), roundId, now);
      const progress = advancePairRitual(this.progress.get(station.id) ?? 0, participants.length, dt);
      this.progress.set(station.id, progress);
      if (participants.length && now - (this.lastNoise.get(station.id) ?? -Infinity) >= 900) {
        sounds.push({ x: station.x, y: station.y }); this.lastNoise.set(station.id, now);
      }
      for (const actor of participants) {
        const visibleProgress = progress >= 1 - 1e-8 ? 1 : Math.floor(progress * 10) / 10;
        const signature = `${station.id}:${visibleProgress}:${participants.length}:${roundId}`;
        if (signature !== this.lastState.get(actor.id)) {
          updates.push({ playerId: actor.id, stationId: station.id, progress: visibleProgress, participants: participants.length, roundId });
          this.lastState.set(actor.id, signature);
        }
        if (progress >= 1 - 1e-8) completions.push({ playerId: actor.id, stationId: station.id });
      }
      if (progress >= 1 - 1e-8) {
        for (const actor of participants) this.release(actor.id);
        this.progress.set(station.id, 0);
      }
    }
    return { updates, completions, sounds };
  }
}
