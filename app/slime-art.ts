const skins = new Map<string, HTMLCanvasElement>();

/** A smooth fluid mound, shared by the material and concealed silhouettes. */
export function slimeOutline(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(-32, 23);
  ctx.bezierCurveTo(-34, 6, -25, -31, -7, -35);
  ctx.bezierCurveTo(13, -41, 28, -17, 30, 8);
  ctx.bezierCurveTo(31, 17, 38, 24, 31, 29);
  ctx.bezierCurveTo(21, 35, 9, 31, 0, 33);
  ctx.bezierCurveTo(-13, 35, -35, 33, -32, 23);
  ctx.closePath();
}

/** Bake translucent material, surface grain, and reflected light once per color. */
export function slimeSkin(color: string, moonlit = true): HTMLCanvasElement {
  // Fog/Blackout keep their subdued material, separate from the brighter normal skin.
  const cacheKey = `${color}:${moonlit}`;
  const cached = skins.get(cacheKey);
  if (cached) return cached;
  const rgb = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16));
  const pigment = rgb.map((channel, index) => Math.round(channel * 0.74 + [91, 116, 125][index] * 0.26));
  const tone = (light: number, alpha: number) => `rgba(${pigment.map((channel) => Math.round(channel * light)).join(",")},${alpha})`;
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 224;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);
  ctx.translate(48, 54);
  slimeOutline(ctx);
  const body = ctx.createLinearGradient(-24, -37, 22, 37);
  body.addColorStop(0, moonlit ? "rgba(202,223,229,.84)" : "rgba(164,186,195,.76)");
  body.addColorStop(0.17, tone(moonlit ? 1.06 : 0.95, 0.88));
  body.addColorStop(0.46, tone(moonlit ? 0.97 : 0.75, moonlit ? 0.82 : 0.64));
  body.addColorStop(0.8, tone(moonlit ? 0.73 : 0.51, 0.89));
  body.addColorStop(1, moonlit ? "rgba(39,70,79,.94)" : "rgba(12,29,39,.96)");
  ctx.fillStyle = body;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const depth = ctx.createRadialGradient(-10, -18, 3, 5, 4, 47);
  depth.addColorStop(0, "rgba(207,229,231,.13)");
  depth.addColorStop(0.48, "rgba(13,38,49,0)");
  depth.addColorStop(1, moonlit ? "rgba(15,41,53,.32)" : "rgba(3,17,28,.57)");
  ctx.fillStyle = depth;
  ctx.fillRect(-42, -46, 84, 94);
  const core = ctx.createRadialGradient(4, 16, 1, 4, 16, 27);
  core.addColorStop(0, tone(1.05, 0.18));
  core.addColorStop(1, tone(0.8, 0));
  ctx.fillStyle = core;
  ctx.fillRect(-34, -15, 70, 58);

  // Soft reflected moonlight, without a painted white shine.
  ctx.save();
  ctx.translate(-10, -24);
  ctx.rotate(-0.32);
  ctx.scale(1, 0.23);
  const reflection = ctx.createRadialGradient(0, 0, 0, 0, 0, 21);
  reflection.addColorStop(0, moonlit ? "rgba(229,244,242,.52)" : "rgba(218,234,237,.4)");
  reflection.addColorStop(0.5, "rgba(184,207,217,.18)");
  reflection.addColorStop(1, "rgba(184,207,217,0)");
  ctx.fillStyle = reflection;
  ctx.fillRect(-22, -22, 44, 44);
  ctx.restore();

  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(206,229,234,.27)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-28, 13);
  ctx.bezierCurveTo(-29, -6, -18, -30, -9, -32);
  ctx.stroke();
  ctx.strokeStyle = "rgba(170,203,211,.15)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(22, -10);
  ctx.bezierCurveTo(29, 7, 23, 19, 30, 25);
  ctx.moveTo(-25, 28);
  ctx.bezierCurveTo(-13, 23, -2, 31, 16, 28);
  ctx.stroke();

  // Fine surface grain is identical across players and baked into the cache.
  let grain = 173;
  for (let i = 0; i < 280; i++) {
    grain = (grain * 16807) % 2147483647;
    const x = (grain % 800) / 10 - 40;
    grain = (grain * 16807) % 2147483647;
    const y = (grain % 900) / 10 - 45;
    ctx.fillStyle = i % 2 ? "rgba(218,235,231,.035)" : "rgba(3,17,27,.06)";
    ctx.fillRect(x, y, 0.55, 0.55);
  }
  ctx.restore();
  const rim = ctx.createLinearGradient(-27, -35, 24, 32);
  rim.addColorStop(0, "rgba(202,225,230,.55)");
  rim.addColorStop(0.36, tone(0.9, 0.25));
  rim.addColorStop(0.75, "rgba(12,26,35,.5)");
  rim.addColorStop(1, "rgba(110,153,166,.27)");
  slimeOutline(ctx);
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1;
  ctx.stroke();
  skins.set(cacheKey, canvas);
  return canvas;
}
