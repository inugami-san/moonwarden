// One room-wide palette and callsign pool shared by player assignment, bots, and the wardrobe.
export const PLAYER_COLORS = ["#20d8ed", "#95ef45", "#ff5d9e", "#ffd94a", "#a879ff", "#ff9843", "#5ea7ff", "#48e0a4"];

export const WARDEN_CALLSIGNS = [
  "Sylph",
  "Bramble",
  "Lumen",
  "Vesper",
  "Mochi",
  "Cinder",
  "Nori",
  "Thistle",
  "Solstice",
  "Glimmer",
  "Rune",
  "Zephyr",
  "Pebble",
  "Bubbles",
  "Gloop",
  "Fizz",
  "Pip",
  "Wobble",
];

export function availablePlayerColor(preferred: string, occupied: Iterable<string>): string | undefined {
  const taken = new Set(Array.from(occupied, (color) => color.toLowerCase()));
  const normalized = preferred.toLowerCase();
  if (PLAYER_COLORS.includes(normalized) && !taken.has(normalized)) return normalized;
  return PLAYER_COLORS.find((color) => !taken.has(color));
}

export function randomWardenCallsign(occupied: Iterable<string> = []): string {
  const taken = new Set(Array.from(occupied, (name) => name.trim().toLowerCase()));
  const available = WARDEN_CALLSIGNS.filter((callsign) => !taken.has(callsign.toLowerCase()));
  const pool = available.length > 0 ? available : WARDEN_CALLSIGNS;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function availablePlayerName(preferred: string, occupied: Iterable<string>): string {
  const taken = new Set(Array.from(occupied, (name) => name.trim().toLowerCase()));
  const trimmed = preferred.trim().slice(0, 16);
  if (trimmed && trimmed.toLowerCase() !== "warden" && !taken.has(trimmed.toLowerCase())) {
    return trimmed;
  }
  const untakenCallsign = randomWardenCallsign(occupied);
  if (!taken.has(untakenCallsign.toLowerCase())) {
    return untakenCallsign;
  }
  const base = (trimmed || "Warden").slice(0, 13);
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`.toLowerCase())) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}
