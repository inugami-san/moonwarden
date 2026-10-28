import type { Hazard, Phase } from "./game-types";
import { isOccludedByObstacle } from "./ordeal-rules";
import { sharesRootCell, type SanctuaryObstacle, type WorldPoint } from "./sanctuary-map";
import { sameShade } from "./sanctuary-design";

export type SightKind = "HIDDEN" | "SHAPE" | "IDENTIFIED";
export type Sight = { kind: SightKind; alpha: number };
export type SightPoint = WorldPoint & { id?: string; flashlight?: boolean };
export type SightContext = {
  observer: SightPoint;
  phase: Phase;
  hazard: Hazard;
  obstacles: readonly SanctuaryObstacle[];
  flares: readonly (WorldPoint & { life: number })[];
  beamAngle?: number;
  ambientLit?: boolean;
  /** Only the private, active Moon Sight ability can bypass cover/chambers. */
  moonSight?: boolean;
};

export const SIGHT_RANGES = Object.freeze({ calm: 280, ordeal: 220, fog: 180, blackout: 66, light: 330, identity: 92 });
const hidden: Sight = Object.freeze({ kind: "HIDDEN", alpha: 0 });

/** Physical visibility and identity are separate. Lighting never sees through cover.
 * Role-blind target data keeps real players and anonymous phantoms consistent. */
export function sightAt(target: SightPoint, context: SightContext): Sight {
  const { observer, phase, hazard } = context;
  const ordeal = phase === "ORDEAL";
  const anonymous = ordeal && (hazard === "MOONGLARE" || hazard === "PHANTOMS");
  const local = target.id !== undefined && target.id === observer.id;
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(observer.x) || !Number.isFinite(observer.y)) return hidden;
  if (context.moonSight) return { kind: "IDENTIFIED", alpha: 1 };
  if (local) return { kind: anonymous && !(hazard === "MOONGLARE" && sameShade(observer, target)) ? "SHAPE" : "IDENTIFIED", alpha: 1 };
  if (ordeal && hazard === "ROOTWAKE" && !sharesRootCell(observer, target)) return hidden;
  if (isOccludedByObstacle(observer, target, context.obstacles)) return hidden;

  const distance = Math.hypot(target.x - observer.x, target.y - observer.y);
  const flareLit = context.flares.some(flare => flare.life > 0 && Math.hypot(target.x - flare.x, target.y - flare.y) < 146);
  let beamLit = false;
  if (context.beamAngle !== undefined && distance <= SIGHT_RANGES.light) {
    const toward = Math.atan2(target.y - observer.y, target.x - observer.x);
    const delta = Math.atan2(Math.sin(toward - context.beamAngle), Math.cos(toward - context.beamAngle));
    beamLit = Math.abs(delta) < Math.PI / 8;
  }
  const lit = beamLit || flareLit || context.ambientLit || target.flashlight;
  const radius = lit ? SIGHT_RANGES.light : !ordeal ? SIGHT_RANGES.calm : hazard === "BLACKOUT" ? SIGHT_RANGES.blackout : hazard === "FOG" ? SIGHT_RANGES.fog : SIGHT_RANGES.ordeal;
  if (distance >= radius) return hidden;
  // A broad, eased distance transition avoids popping at the sight boundary.
  // Cover/chamber rejection above stays immediate: never retain hidden actors
  // for a temporal fade that could reveal movement behind an obstacle.
  const fade = Math.min(1, (radius - distance) / Math.min(76, radius * .42));
  const alpha = fade * fade * (3 - 2 * fade);
  if (anonymous) return { kind: hazard === "MOONGLARE" && distance < SIGHT_RANGES.identity && sameShade(observer, target) ? "IDENTIFIED" : "SHAPE", alpha };
  const obscured = ordeal && (hazard === "FOG" || hazard === "MIRROR_POOL");
  return { kind: obscured && !lit && distance >= SIGHT_RANGES.identity ? "SHAPE" : "IDENTIFIED", alpha };
}
