import type { WorldPoint } from "../server/sanctuary-map";

export function restorationTier(progress: number) {
  return Number.isFinite(progress) ? Math.max(0, Math.min(3, Math.floor(progress / 25))) : 0;
}

export const RESTORATION_MESSAGES = ["", "25% restored — wildflowers return to the forest.", "50% restored — the shrine lanterns awaken.", "75% restored — the sanctuary is full of life."] as const;
const gardens = new Map<number, HTMLCanvasElement>();

/** Three small cached floral patches; decorative only, never collision or light sources. */
function garden(tier: number) {
  let sprite = gardens.get(tier);
  if (sprite) return sprite;
  sprite = document.createElement("canvas"); sprite.width = 200; sprite.height = 112;
  const ctx = sprite.getContext("2d");
  if (!ctx) return null;
  for (let i = 0; i < tier * 5; i++) {
    const x = 12 + i * 47 % 176, y = 13 + i * 29 % 88;
    ctx.strokeStyle = "#78988a"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x, y + 5); ctx.quadraticCurveTo(x - 3, y, x, y - 4); ctx.stroke();
    ctx.fillStyle = i % 3 === 0 ? "#dfc6dc" : "#e3e5c8";
    for (let petal = 0; petal < 5; petal++) {
      const a = petal * Math.PI * .4;
      ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 2.7, y - 4 + Math.sin(a) * 1.8, 2.8, 1.6, a, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#dfbd7c"; ctx.beginPath(); ctx.arc(x, y - 4, 1.4, 0, Math.PI * 2); ctx.fill();
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
      ctx.strokeStyle = "#938576"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y + 30); ctx.quadraticCurveTo(x + lantern * 4, y + 9, x, y - 7); ctx.stroke();
      ctx.fillStyle = "#c8a778"; ctx.beginPath(); ctx.ellipse(x, y, 5, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#f5dda5"; ctx.beginPath(); ctx.ellipse(x, y, 2.5, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#e5c78d1c"; ctx.beginPath(); ctx.ellipse(x, y + 24, 20, 9, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (tier === 3) {
      ctx.fillStyle = "#f0dfa9aa";
      for (let mote = 0; mote < 3; mote++) {
        const phase = index + mote * 2.1, t = reducedMotion ? 0 : time * .7;
        ctx.beginPath(); ctx.arc(station.x + Math.cos(t + phase) * 65, station.y - 25 + Math.sin(t * .7 + phase) * 24, 1.6, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  ctx.restore();
}
