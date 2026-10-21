/** Bump when world geometry or shared gameplay state becomes incompatible. */
export const GAME_WORLD_VERSION = "silverpine-seeded-hollows-stealth-v3";

export const GAME_VERSION_MISMATCH = "The game page and room server use different map versions. Refresh the page and reconnect. For local testing, start the matching local room server; production needs both the site and room server updated together.";

export function isCompatibleServerInfo(value: unknown): value is { type: "SERVER_INFO"; worldVersion: string; compatible: true } {
  if (!value || typeof value !== "object") return false;
  const info = value as { type?: unknown; worldVersion?: unknown; compatible?: unknown };
  return info.type === "SERVER_INFO" && info.worldVersion === GAME_WORLD_VERSION && info.compatible === true;
}
