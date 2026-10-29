import type { Hazard, ItemKind } from "../server/game-types";
import { STATIONS } from "../server/sanctuary-map";

export const ORDEAL_PREPARATION: Record<Hazard, { item: ItemKind; title: string; reason: string }> = {
  BLACKOUT: { item: "FLASHLIGHT", title: "Bring light into the blackout", reason: "Earn a Glowing Mushroom to reveal the path and nearby shapes." },
  FOG: { item: "FLASHLIGHT", title: "Prepare a path through the fog", reason: "A Glowing Mushroom helps you inspect shapes close to its beam." },
  MOONGLARE: { item: "SONAR", title: "Listen beneath the bright moon", reason: "Earn an Echo Bell to follow movement while identities are bleached." },
  ROOTWAKE: { item: "SONAR", title: "Choose a chamber, then listen", reason: "Prepare an Echo Bell before roots divide the forest. Stay aware inside your chamber." },
  PHANTOMS: { item: "SONAR", title: "Know an echo from a phantom", reason: "An Echo Bell briefly marks the procession’s false shapes." },
  MIRROR_POOL: { item: "FLARE", title: "Keep a familiar light nearby", reason: "Earn a Moonblossom for a shared landmark while bumps swap colors. Movement stays normal." },
};

export function preparationStation(hazard: Hazard, position: { x: number; y: number }, personalCompleted: readonly string[], stations = STATIONS) {
  const available = stations.filter(station => !personalCompleted.includes(station.id));
  const preferred = available.filter(station => station.reward === ORDEAL_PREPARATION[hazard].item);
  return [...(preferred.length ? preferred : available)].sort((a, b) =>
    Math.hypot(a.x - position.x, a.y - position.y) - Math.hypot(b.x - position.x, b.y - position.y),
  )[0]?.id ?? null;
}

export function restorationMilestone(progress: number) {
  if (progress >= 100) return "The forest is restored";
  if (progress >= 75) return "Final wards — bring the forest home";
  if (progress >= 50) return "The glade is coming back to life";
  if (progress >= 25) return "The first lights have returned";
  return "Restore the wards to win";
}
