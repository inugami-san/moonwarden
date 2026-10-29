import type { Hazard, Phase } from "../server/game-types";
import { WORLD_HEIGHT, WORLD_WIDTH, type SanctuaryObstacle, type WorldPoint } from "../server/sanctuary-map";
import { SIGHT_RANGES } from "../server/visibility";

type AtmosphereView = {
  observer: WorldPoint;
  camera: WorldPoint;
  width: number;
  height: number;
  phase: Phase;
  hazard: Hazard;
  elapsed: number;
  reducedMotion: boolean;
  moonSight: boolean;
  beamAngle?: number;
  flares: readonly (WorldPoint & { life: number })[];
  stations: readonly WorldPoint[];
  obstacles: readonly SanctuaryObstacle[];
};

/** Scenery-only lighting. No remote player/body positions ever enter this layer.
 * Actors still pass the shared local sight rule before they are drawn. */
export class ForestAtmosphere {
  private ground?: HTMLCanvasElement;
  private groundKey = "";
  private veil?: HTMLCanvasElement;

  drawGround(ctx: CanvasRenderingContext2D, obstacles: readonly SanctuaryObstacle[]) {
    const key = obstacles.map(o => `${o.id}:${o.x}:${o.y}:${o.r}:${o.canopyRadius}:${o.canopyHeight}`).join("|");
    if (!this.ground || key !== this.groundKey) {
      this.ground ??= document.createElement("canvas");
      this.ground.width = WORLD_WIDTH / 2;
      this.ground.height = WORLD_HEIGHT / 2;
      this.groundKey = key;
      const ground = this.ground.getContext("2d");
      if (!ground) return;
      ground.scale(.5, .5);
      for (const obstacle of obstacles) {
        // One moon above the north-east treeline casts consistent long shadows.
        ground.save();
        ground.translate(obstacle.x - obstacle.canopyHeight * .32, obstacle.y + obstacle.canopyHeight * .28);
        ground.rotate(-.65);
        ground.scale(1.9, .58);
        const shadow = ground.createRadialGradient(0, 0, 2, 0, 0, obstacle.canopyRadius);
        shadow.addColorStop(0, "rgba(12,20,39,.3)");
        shadow.addColorStop(.6, "rgba(16,25,44,.18)");
        shadow.addColorStop(1, "rgba(16,25,44,0)");
        ground.fillStyle = shadow;
        ground.fillRect(-obstacle.canopyRadius, -obstacle.canopyRadius, obstacle.canopyRadius * 2, obstacle.canopyRadius * 2);
        ground.restore();
      }
    }
    ctx.drawImage(this.ground, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }

  drawVeil(ctx: CanvasRenderingContext2D, view: AtmosphereView) {
    const { observer, camera, width, height, phase, hazard } = view;
    const ordeal = phase === "ORDEAL";
    // Moon Glare owns its bright exposure; never turn it into another blackout.
    if (ordeal && hazard === "MOONGLARE") return;
    this.veil ??= document.createElement("canvas");
    const scale = Math.min(.5, 640 / width);
    const pixelWidth = Math.ceil(width * scale), pixelHeight = Math.ceil(height * scale);
    if (this.veil.width !== pixelWidth || this.veil.height !== pixelHeight) {
      this.veil.width = pixelWidth;
      this.veil.height = pixelHeight;
    }
    const mask = this.veil.getContext("2d");
    if (!mask) return;
    mask.setTransform(1, 0, 0, 1, 0, 0);
    mask.clearRect(0, 0, pixelWidth, pixelHeight);
    // Match the actual rounded buffer dimensions so camera movement never
    // exposes a one-pixel unshaded strip at a viewport edge.
    mask.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, -camera.x * pixelWidth / width, -camera.y * pixelHeight / height);
    mask.globalCompositeOperation = "source-over";
    const blackout = ordeal && hazard === "BLACKOUT";
    const fog = ordeal && hazard === "FOG";
    mask.fillStyle = `rgba(15,23,46,${blackout || fog ? .04 : .13})`;
    mask.fillRect(camera.x, camera.y, width, height);

    const radius = !ordeal ? SIGHT_RANGES.calm : blackout ? SIGHT_RANGES.blackout : fog ? SIGHT_RANGES.fog : SIGHT_RANGES.ordeal;
    if (!view.moonSight) {
      // The terrain recedes with the characters instead of remaining bright
      // behind suddenly missing slimes. Existing Ordeal masks remain primary.
      const strength = blackout ? .08 : fog ? .26 : .8;
      const edge = mask.createRadialGradient(observer.x, observer.y, 0, observer.x, observer.y, radius * 1.4);
      edge.addColorStop(0, "rgba(18,27,48,0)");
      edge.addColorStop(.38, "rgba(18,27,48,0)");
      edge.addColorStop(.52, `rgba(42,54,77,${strength * .1})`);
      edge.addColorStop(.71, `rgba(38,49,72,${strength * .72})`);
      edge.addColorStop(1, `rgba(17,25,45,${strength})`);
      mask.fillStyle = edge;
      mask.fillRect(camera.x, camera.y, width, height);
    }

    // Warm shrine pools make destinations legible, not brighter players.
    // They cannot undo cover, and do not change any identity/visibility rule.
    mask.globalCompositeOperation = "destination-out";
    for (const station of view.stations) this.cutLight(mask, station, 88, .48);
    for (const flare of view.flares) if (flare.life > 0) this.cutLight(mask, flare, 152, .95);
    if (view.beamAngle !== undefined) {
      const beam = mask.createRadialGradient(observer.x, observer.y, 24, observer.x, observer.y, SIGHT_RANGES.light);
      beam.addColorStop(0, "rgba(0,0,0,.98)");
      beam.addColorStop(.72, "rgba(0,0,0,.88)");
      beam.addColorStop(1, "rgba(0,0,0,0)");
      mask.fillStyle = beam;
      mask.beginPath(); mask.moveTo(observer.x, observer.y);
      mask.arc(observer.x, observer.y, SIGHT_RANGES.light, view.beamAngle - Math.PI / 8, view.beamAngle + Math.PI / 8);
      mask.closePath(); mask.fill();
    }
    mask.globalCompositeOperation = "source-over";
    if (!view.moonSight) {
      for (const obstacle of view.obstacles) {
        const distance = Math.hypot(obstacle.x - observer.x, obstacle.y - observer.y);
        if (distance > SIGHT_RANGES.light + obstacle.r + 40 || distance <= obstacle.r + 12) continue;
        // Tangent wedges start behind the same r+8 collider used by sightAt.
        // Two nested edges soften the penumbra without a costly canvas blur.
        this.coverShadow(mask, view, obstacle, obstacle.r + 14, .15);
        this.coverShadow(mask, view, obstacle, obstacle.r + 8, blackout ? .24 : .52);
      }
    }
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.veil, camera.x, camera.y, width, height);
    ctx.restore();

    // Subdued amber against blue moonlight, confined to the shrine floor.
    ctx.save(); ctx.globalCompositeOperation = "screen";
    for (const station of view.stations) {
      const distance = Math.hypot(station.x - observer.x, station.y - observer.y);
      if (distance > radius || blackout || (ordeal && hazard === "ROOTWAKE")) continue;
      const glow = ctx.createRadialGradient(station.x, station.y + 10, 3, station.x, station.y + 10, 78);
      glow.addColorStop(0, "rgba(230,191,124,.13)");
      glow.addColorStop(1, "rgba(230,191,124,0)");
      ctx.fillStyle = glow; ctx.fillRect(station.x - 78, station.y - 68, 156, 156);
    }
    ctx.restore();
  }

  drawMist(ctx: CanvasRenderingContext2D, view: AtmosphereView) {
    const ordeal = view.phase === "ORDEAL";
    if (ordeal && (view.hazard === "BLACKOUT" || view.hazard === "MOONGLARE")) return;
    const time = view.reducedMotion ? 0 : view.elapsed;
    const density = ordeal && view.hazard === "FOG" ? .13 : .055;
    ctx.save();
    // World-anchored wisps: never follow or reveal a hidden actor. Reduced
    // motion holds them still rather than disabling important concealment.
    for (let i = 0; i < 18; i++) {
      const rx = 140 + i % 4 * 36, ry = 38 + i % 3 * 15;
      const x = ((i * 317 + time * (3 + i % 3)) % (WORLD_WIDTH + rx * 2)) - rx;
      const y = 65 + (i * 173 % (WORLD_HEIGHT - 100)) + Math.sin(time * .08 + i) * 16;
      if (x + rx < view.camera.x || x - rx > view.camera.x + view.width || y + ry < view.camera.y || y - ry > view.camera.y + view.height) continue;
      ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx);
      const mist = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      mist.addColorStop(0, `rgba(184,199,218,${density})`);
      mist.addColorStop(.45, `rgba(156,176,204,${density * .6})`);
      mist.addColorStop(1, "rgba(156,176,204,0)");
      ctx.fillStyle = mist; ctx.fillRect(-rx, -rx, rx * 2, rx * 2); ctx.restore();
    }
    ctx.restore();
  }

  private cutLight(ctx: CanvasRenderingContext2D, point: WorldPoint, radius: number, strength: number) {
    const light = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
    light.addColorStop(0, `rgba(0,0,0,${strength})`);
    light.addColorStop(.45, `rgba(0,0,0,${strength * .8})`);
    light.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = light; ctx.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
  }

  private coverShadow(ctx: CanvasRenderingContext2D, view: AtmosphereView, obstacle: SanctuaryObstacle, radius: number, opacity: number) {
    const { observer } = view;
    const distance = Math.hypot(obstacle.x - observer.x, obstacle.y - observer.y);
    if (distance <= radius) return;
    const angle = Math.atan2(obstacle.y - observer.y, obstacle.x - observer.x);
    const spread = Math.asin(radius / distance);
    const tangent = Math.sqrt(distance * distance - radius * radius);
    const reach = Math.hypot(view.width, view.height) + distance + 200;
    const shade = ctx.createRadialGradient(observer.x, observer.y, Math.max(0, tangent - 10), observer.x, observer.y, tangent + 75);
    shade.addColorStop(0, "rgba(12,20,36,0)");
    shade.addColorStop(1, `rgba(12,20,36,${opacity})`);
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.moveTo(observer.x + Math.cos(angle - spread) * tangent, observer.y + Math.sin(angle - spread) * tangent);
    ctx.lineTo(observer.x + Math.cos(angle - spread) * reach, observer.y + Math.sin(angle - spread) * reach);
    ctx.arc(observer.x, observer.y, reach, angle - spread, angle + spread);
    ctx.lineTo(observer.x + Math.cos(angle + spread) * tangent, observer.y + Math.sin(angle + spread) * tangent);
    ctx.closePath(); ctx.fill();
  }

  clear() {
    // Release backing stores when leaving a match, especially on mobile.
    if (this.ground) this.ground.width = this.ground.height = 1;
    if (this.veil) this.veil.width = this.veil.height = 1;
    this.ground = undefined; this.veil = undefined; this.groundKey = "";
  }
}
