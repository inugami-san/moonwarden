import { SANCTUARY_CLEARINGS } from "../server/sanctuary-map";

export const OBSERVATION_LOCATIONS = ["WARDEN COURTYARD", ...SANCTUARY_CLEARINGS.map(clearing => clearing.label)];
export const OBSERVATION_TIMES = ["before the Ordeal", "during the Ordeal", "after the Ordeal"] as const;
export type ObservationNote = { playerName: string; location: string; when: typeof OBSERVATION_TIMES[number] };
export type KnownName = { id: string; name: string };

/** A manually chosen claim, not a tracker. Never accepts coordinates or roles. */
export function makeObservation(roster: readonly KnownName[], playerId: string, location: string, when: string): ObservationNote | null {
  const player = roster.find(player => player.id === playerId);
  if (!player || !OBSERVATION_LOCATIONS.includes(location) || !OBSERVATION_TIMES.some(value => value === when)) return null;
  return { playerName: player.name.replace(/\s*\(YOU\)$/, "").slice(0, 24), location, when: when as ObservationNote["when"] };
}

export function observationClaim(note: ObservationNote) {
  return `I saw ${note.playerName} near ${note.location.toLowerCase()} ${note.when}.`;
}
