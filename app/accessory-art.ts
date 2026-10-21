import type { Hat } from "../server/game-types";

function paintAccessory(ctx: CanvasRenderingContext2D, hat: Hat, x: number, y: number, muted: boolean) {
    ctx.save();
    ctx.translate(x, y + 5);
    ctx.scale(0.82, 0.82);
    x = 0;
    y = 0;
    const pale = muted ? "#9ca9ae" : "#a1b4b8";
    const cloth = ctx.createLinearGradient(-25, -15, 25, 20);
    cloth.addColorStop(0, muted ? "#69767d" : "#475361");
    cloth.addColorStop(1, muted ? "#48545b" : "#1b2935");
    const night = cloth;
    ctx.strokeStyle = "rgba(10,22,30,.6)";
    ctx.lineWidth = 1.5;
    if (hat === "antlers") {
      ctx.strokeStyle = muted ? "#66716f" : "#817b69";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x - 14, y + 17);
      ctx.quadraticCurveTo(x - 27, y + 2, x - 23, y - 13);
      ctx.moveTo(x - 24, y - 5);
      ctx.lineTo(x - 34, y - 12);
      ctx.moveTo(x - 24, y + 2);
      ctx.lineTo(x - 36, y + 1);
      ctx.moveTo(x + 14, y + 17);
      ctx.quadraticCurveTo(x + 27, y + 2, x + 23, y - 13);
      ctx.moveTo(x + 24, y - 5);
      ctx.lineTo(x + 34, y - 12);
      ctx.moveTo(x + 24, y + 2);
      ctx.lineTo(x + 36, y + 1);
      ctx.stroke();
      ctx.lineCap = "butt";
      ctx.fillStyle = night;
      ctx.beginPath();
      ctx.ellipse(x, y + 14, 25, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(10,22,30,.6)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (hat === "hood") {
      ctx.fillStyle = night;
      ctx.beginPath();
      ctx.moveTo(x - 26, y + 18);
      ctx.quadraticCurveTo(x - 23, y - 13, x, y - 18);
      ctx.quadraticCurveTo(x + 23, y - 13, x + 26, y + 18);
      ctx.quadraticCurveTo(x, y + 6, x - 26, y + 18);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(10,22,30,.6)";
      ctx.stroke();
      ctx.fillStyle = pale;
      ctx.beginPath();
      ctx.arc(x - 2, y - 2, 8, -Math.PI * .6, Math.PI * .6);
      ctx.fill();
    } else if (hat === "moth") {
      ctx.fillStyle = muted ? "#839093" : "#9ca9bb";
      ctx.strokeStyle = "rgba(10,22,30,.6)";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(x - 14, y + 5, 17, 10, -.48, 0, Math.PI * 2);
      ctx.ellipse(x + 14, y + 5, 17, 10, .48, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = muted ? "#647275" : "#5d6c81";
      ctx.beginPath();
      ctx.ellipse(x, y + 7, 7, 15, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = night;
      ctx.strokeStyle = "rgba(10,22,30,.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 27, y + 17);
      ctx.quadraticCurveTo(x - 8, y - 7, x + 7, y - 22);
      ctx.quadraticCurveTo(x + 17, y - 4, x + 25, y + 17);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = pale;
      ctx.beginPath();
      ctx.arc(x + 2, y + 1, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = night;
      ctx.beginPath();
      ctx.arc(x + 6, y - 2, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

const cache = new Map<string, HTMLCanvasElement>();
export function drawAccessory(ctx: CanvasRenderingContext2D, hat: Hat, x = 0, y = 0, muted = false) {
  const key = `${hat}:${muted}`;
  let sprite = cache.get(key);
  if (!sprite) {
    sprite = document.createElement("canvas"); sprite.width = 192; sprite.height = 144;
    const paint = sprite.getContext("2d");
    if (!paint) return;
    paint.scale(2, 2); paint.translate(48, 34); paintAccessory(paint, hat, 0, 0, muted); cache.set(key, sprite);
  }
  ctx.drawImage(sprite, x - 48, y - 34, 96, 72);
}

