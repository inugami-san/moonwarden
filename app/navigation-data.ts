import {
  SANCTUARY_CLEARINGS,
  STATIONS,
  clampWorldPoint,
  getRootCell,
  type WorldPoint,
} from "../server/sanctuary-map";
import { createMatchLayout } from "../server/match-layout";
import { SHADE_POCKETS } from "../server/sanctuary-design";

/** Navigation accepts shrine state, never a roster, bodies, roles, or sound cues. */
export type NavigationStation = WorldPoint & {
  id: string;
  label: string;
  personalCompleted: boolean;
  teamRestored: boolean;
  overgrown?: boolean;
};

export type NavigationInput = {
  position: WorldPoint;
  phase: string;
  hazard: string;
  stations: readonly NavigationStation[];
  destinationId: string | null;
  layoutSeed?: number;
};

const STATION_CATALOG = new Map(STATIONS.map(station => [station.id, station]));

/** Strip unknown IDs and extra properties before anything reaches the map. */
export function navigationView(input: NavigationInput) {
  const catalog = input.layoutSeed === undefined ? STATION_CATALOG : new Map(createMatchLayout(input.layoutSeed).stations.map(station => [station.id, station]));
  const position = clampWorldPoint(input.position.x, input.position.y);
  const rootLocked = input.phase === "ORDEAL" && input.hazard === "ROOTWAKE";
  const cell = rootLocked ? getRootCell(position.x, position.y) : null;
  const visibleStations: NavigationStation[] = [];
  const seen = new Set<string>();
  for (const state of input.stations) {
    const station = catalog.get(state.id);
    if (!station || seen.has(station.id)) continue;
    seen.add(station.id);
    if (cell && getRootCell(station.x, station.y).index !== cell.index) continue;
    visibleStations.push({
      id: station.id,
      label: station.label,
      x: station.x,
      y: station.y,
      personalCompleted: state.personalCompleted === true,
      teamRestored: state.teamRestored === true,
      ...(state.overgrown === true ? { overgrown: true } : {}),
    });
  }
  return {
    shadePockets: input.phase === "ORDEAL" && input.hazard === "MOONGLARE" ? SHADE_POCKETS : [],
    position,
    cell,
    rootLocked,
    stations: visibleStations,
    clearings: SANCTUARY_CLEARINGS.filter(clearing => !cell || getRootCell(clearing.x, clearing.y).index === cell.index),
    destination: visibleStations.find(station => station.id === input.destinationId) ?? null,
    destinationHidden: !!cell && input.destinationId !== null && STATION_CATALOG.has(input.destinationId)
      && !visibleStations.some(station => station.id === input.destinationId),
  };
}

export type NavigationView = ReturnType<typeof navigationView>;

export function navigationStationState(station: Pick<NavigationStation, "personalCompleted" | "teamRestored">, phase: string) {
  if (station.personalCompleted) return { label: "Reward claimed", kind: "claimed" as const };
  if (phase === "DISCUSSION") return { label: "Ritual resting during discussion", kind: "locked" as const };
  if (phase === "ORDEAL") {
    return station.teamRestored
      ? { label: "Personal gear rite · Ordeal risk", kind: "gear" as const }
      : { label: "Risky rite · restore ward + earn gear", kind: "available" as const };
  }
  if (station.teamRestored) return { label: "Ward restored · your gear is available", kind: "gear" as const };
  return { label: "Restore the ward + earn gear", kind: "available" as const };
}

export function mapTitle(label: string) {
  return label.toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
}
