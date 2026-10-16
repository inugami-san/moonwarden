import type { NetMovement } from "../server/game-types";

type Sample = NetMovement & { at: number };

/** Render a little behind the server so uneven packet arrivals become smooth motion.
 * Prediction stops after 100ms: a stalled connection never sends a slime drifting forever.
 */
export class MovementBuffer {
  private tracks = new Map<string, Sample[]>();
  private clockOffset: number | null = null;

  push(players: NetMovement[], serverTime: number | undefined, receivedAt: number) {
    const at = serverTime ?? receivedAt;
    const offset = receivedAt - at;
    this.clockOffset = this.clockOffset === null ? offset : Math.min(offset, this.clockOffset + 0.5);
    for (const player of players) {
      const track = this.tracks.get(player.id) ?? [];
      if (track.length && at <= track[track.length - 1].at) continue;
      // Teleports and reconnects must not interpolate through the whole arena.
      if (track.length && Math.hypot(player.x - track[track.length - 1].x, player.y - track[track.length - 1].y) > 190) track.length = 0;
      track.push({ ...player, at });
      if (track.length > 24) track.shift();
      this.tracks.set(player.id, track);
    }
  }

  sample(id: string, now: number): NetMovement | undefined {
    const track = this.tracks.get(id);
    if (!track?.length) return;
    const renderAt = now - (this.clockOffset ?? 0) - 100;
    while (track.length > 2 && track[1].at <= renderAt) track.shift();
    const first = track[0];
    if (renderAt <= first.at) return first;
    const next = track[1];
    if (next && renderAt <= next.at) {
      const t = (renderAt - first.at) / (next.at - first.at);
      const angleDelta = Math.atan2(Math.sin(next.angle - first.angle), Math.cos(next.angle - first.angle));
      return { ...next, x: first.x + (next.x - first.x) * t, y: first.y + (next.y - first.y) * t, angle: first.angle + angleDelta * t };
    }
    const last = track[track.length - 1];
    const seconds = last.alive ? Math.min(100, Math.max(0, renderAt - last.at)) / 1000 : 0;
    return { ...last, x: last.x + last.vx * seconds, y: last.y + last.vy * seconds };
  }

  remove(id: string) {
    this.tracks.delete(id);
  }

  clear() {
    this.tracks.clear();
    this.clockOffset = null;
  }
}
