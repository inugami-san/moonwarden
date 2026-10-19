import type { Hazard } from "./game-types";

export const TASK_PROGRESS_REWARD = 8;
export const MOON_SIGHT_SECONDS = 3.2;
export const ECHO_SECONDS = 2;
export const ECHO_RANGE = 220;
export const HEARING_RANGE = 300;
export const HAZARDS: Hazard[] = ["BLACKOUT", "FOG", "MOONGLARE", "ROOTWAKE", "PHANTOMS"];

export function nextHazard(previous: Hazard, random = Math.random) {
  const options = HAZARDS.filter(hazard => hazard !== previous);
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))];
}

/** Shared seed + phase time means every observer sees the same wandering shapes. */
export function phantomPaths(seed: number) {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return Array.from({ length: 5 }, (_, i) => ({
    x: 280 + i * 170 + (random() - 0.5) * 90,
    y: 240 + random() * 270,
    rx: 65 + random() * 85,
    ry: 40 + random() * 70,
    speed: 0.5 + random() * 0.65,
    phase: random() * Math.PI * 2,
  }));
}
