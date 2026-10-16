// One room-wide palette shared by player assignment, bots, and the wardrobe.
export const PLAYER_COLORS = ["#20d8ed", "#95ef45", "#ff5d9e", "#ffd94a", "#a879ff", "#ff9843", "#5ea7ff", "#48e0a4"];

export function availablePlayerColor(preferred: string, occupied: Iterable<string>): string | undefined {
  const taken = new Set(Array.from(occupied, (color) => color.toLowerCase()));
  const normalized = preferred.toLowerCase();
  if (PLAYER_COLORS.includes(normalized) && !taken.has(normalized)) return normalized;
  return PLAYER_COLORS.find((color) => !taken.has(color));
}
