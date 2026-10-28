export const PAIR_RITUAL_SECONDS = 3;
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
  private beats = new Map<string, { count: number; lastAt: number }>();
  private active = new Map<string, { ids: string[]; roundId: number; at: number }>();

  pulse(playerId: string, stationId: string, rune: number, roundId: number, now: number) {
    const active = this.active.get(stationId), beat = this.beats.get(stationId) ?? { count: 0, lastAt: -Infinity };
    if (!active || active.roundId !== roundId || now - active.at > 200 || active.ids.length < 2
      || beat.count >= 4 || now - beat.lastAt < 350 || active.ids[beat.count % 2] !== playerId || rune !== beat.count % 2) return false;
    this.beats.set(stationId, { count: beat.count + 1, lastAt: now });
    return true;
  }
  autoPulse(playerId: string, stationId: string, roundId: number, now: number) {
    return this.pulse(playerId, stationId, (this.beats.get(stationId)?.count ?? 0) % 2, roundId, now);
  }

  hold(playerId: string, stationId: string, roundId: number, now: number) {
    this.intents.set(playerId, { stationId, roundId, until: now + PAIR_INTENT_TTL_MS });
  }
  release(playerId: string) { this.intents.delete(playerId); this.lastState.delete(playerId); }
  clear() { this.intents.clear(); this.progress.clear(); this.lastNoise.clear(); this.lastState.clear(); this.beats.clear(); this.active.clear(); }

  tick(actors: readonly RitualActor[], stations: readonly { id: string; x: number; y: number }[], completed: (playerId: string, stationId: string) => boolean, roundId: number, now: number, dt: number) {
    const updates: { playerId: string; stationId: string; progress: number; participants: number; roundId: number; beats?: number; rune?: number; nextPlayerId?: string }[] = [];
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
      const ids = participants.map(actor => actor.id).sort().slice(0, 2);
      const previous = this.active.get(station.id);
      if (ids.length < 2 || previous?.ids.join() !== ids.join()) { this.beats.delete(station.id); this.progress.delete(station.id); }
      this.active.set(station.id, { ids, roundId, at: now });
      const progress = advancePairRitual(this.progress.get(station.id) ?? 0, participants.length, dt);
      this.progress.set(station.id, progress);
      const beats = this.beats.get(station.id)?.count ?? 0;
      const ready = progress >= 1 - 1e-8 && beats >= 4;
      if (participants.length && now - (this.lastNoise.get(station.id) ?? -Infinity) >= 900) {
        sounds.push({ x: station.x, y: station.y }); this.lastNoise.set(station.id, now);
      }
      for (const actor of participants) {
        const visibleProgress = ready ? 1 : Math.floor(Math.min(progress, beats / 4) * 10) / 10;
        const signature = `${station.id}:${visibleProgress}:${participants.length}:${roundId}:${beats}:${ids.join()}`;
        if (signature !== this.lastState.get(actor.id)) {
          updates.push({ playerId: actor.id, stationId: station.id, progress: visibleProgress, participants: participants.length, roundId, beats, rune: beats % 2, nextPlayerId: ids[beats % 2] });
          this.lastState.set(actor.id, signature);
        }
        if (ready && ids.includes(actor.id)) completions.push({ playerId: actor.id, stationId: station.id });
      }
      if (ready) {
        for (const id of ids) this.release(id);
        this.progress.set(station.id, 0);
        this.beats.delete(station.id); this.active.delete(station.id);
      }
    }
    return { updates, completions, sounds };
  }
}
