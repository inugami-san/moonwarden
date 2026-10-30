import packageInfo from "../package.json" with { type: "json" };

/** package.json is the single source of truth for the player-facing release. */
export const GAME_RELEASE_VERSION = packageInfo.version;
export const GAME_RELEASE_CHANNEL = "beta";
export const GAME_RELEASE_LABEL = `v${GAME_RELEASE_VERSION} · BETA`;

/** Bump when geometry, shared state or required cosmetic IDs become incompatible. */
export const GAME_WORLD_VERSION = "silverpine-wardrobe-v9";

export const GAME_RELEASE_INFO = Object.freeze({
  name: "Moonwarden",
  version: GAME_RELEASE_VERSION,
  channel: GAME_RELEASE_CHANNEL,
  worldVersion: GAME_WORLD_VERSION,
});

export const GAME_VERSION_MISMATCH = "The game page and room server use different map versions. Refresh the page and reconnect. For local testing, start the matching local room server; production needs both the site and room server updated together.";

export function isCompatibleServerInfo(value: unknown): value is { type: "SERVER_INFO"; worldVersion: string; compatible: true } {
  if (!value || typeof value !== "object") return false;
  const info = value as { type?: unknown; worldVersion?: unknown; compatible?: unknown };
  return info.type === "SERVER_INFO" && info.worldVersion === GAME_WORLD_VERSION && info.compatible === true;
}
