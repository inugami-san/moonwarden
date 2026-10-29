import type { WorldPoint } from "../server/sanctuary-map";

export function restorationTier(progress: number) {
  return Number.isFinite(progress) ? Math.max(0, Math.min(3, Math.floor(progress / 25))) : 0;
}

export const RESTORATION_MESSAGES = ["", "25% restored — wildflowers return to the forest.", "50% restored — the shrine lanterns awaken.", "75% restored — the sanctuary is full of life."] as const;
const gardens = new Map<number, HTMLCanvasElement>();

/** Three cached bioluminescent mushroom & glow-shrub patches; decorative only, never collision or light sources. */
function garden(tier: number) {
  let sprite = gardens.get(tier);
  if (sprite) return sprite;
  sprite = document.createElement("canvas"); sprite.width = 200; sprite.height = 112;
  const ctx = sprite.getContext("2d");
  if (!ctx) return null;
  for (let i = 0; i < tier * 5; i++) {
    const x = 12 + i * 47 % 176, y = 13 + i * 29 % 88;
    // Dark indigo-moss Glow-Patch Shrub base tuft.
    ctx.fillStyle = i % 2 ? "#152244cc" : "#1c335ecc";
    ctx.beginPath(); ctx.ellipse(x, y + 5, 8.5, 4.2, 0, 0, Math.PI * 2); ctx.fill();
    // Tiny Spore Cluster stem & glowing cyan bioluminescent mushroom cap.
    ctx.strokeStyle = "#31487a"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x, y + 5); ctx.quadraticCurveTo(x - 2, y, x, y - 5); ctx.stroke();
    ctx.fillStyle = i % 3 === 0 ? "#2466bd" : "#22b8e6";
    ctx.beginPath(); ctx.ellipse(x, y - 5, 5.2, 3.1, 0, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#5efaff";
    ctx.beginPath(); ctx.ellipse(x, y - 5, 4.4, 1.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#b5ffff";
    ctx.beginPath(); ctx.arc(x - 1.5, y - 6.5, .9, 0, Math.PI * 2); ctx.arc(x + 1.6, y - 6.2, .7, 0, Math.PI * 2); ctx.fill();
  }
  gardens.set(tier, sprite); return sprite;
}

export function drawRestorationGarden(ctx: CanvasRenderingContext2D, stations: readonly WorldPoint[], progress: number, time: number, reducedMotion = false) {
  const tier = restorationTier(progress);
  if (!tier) return;
  const sprite = garden(tier);
  if (!sprite) return;
  ctx.save();
  for (const [index, station] of stations.entries()) {
    // Stable positions follow the shared match layout; never track a player.
    const side = index % 2 ? 1 : -1;
    ctx.drawImage(sprite, station.x + side * 104 - 72, station.y + 37, 144, 81);
    ctx.drawImage(sprite, station.x - side * 88 - 50, station.y - 105, 100, 56);
    if (tier < 2) continue;
    for (const lantern of tier === 3 ? [-1, 1] : [-1]) {
      const x = station.x + lantern * 60, y = station.y - 12;
      ctx.strokeStyle = "#354975"; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(x, y + 30); ctx.quadraticCurveTo(x + lantern * 4, y + 9, x, y - 7); ctx.stroke();
      ctx.fillStyle = "#1f56ad"; ctx.beginPath(); ctx.ellipse(x, y, 6, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#66fcff"; ctx.beginPath(); ctx.ellipse(x, y, 3.2, 5.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#4df8ff26"; ctx.beginPath(); ctx.ellipse(x, y + 24, 20, 9, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (tier === 3) {
      ctx.fillStyle = "#7affffbb";
      for (let mote = 0; mote < 3; mote++) {
        const phase = index + mote * 2.1, t = reducedMotion ? 0 : time * .7;
        ctx.beginPath(); ctx.arc(station.x + Math.cos(t + phase) * 65, station.y - 25 + Math.sin(t * .7 + phase) * 24, 1.8, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  ctx.restore();
}
