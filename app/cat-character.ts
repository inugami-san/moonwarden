export type CatAccessoryPass = "BACK" | "FRONT";
export type CatCharacterLayers = {
  drawBody: (ctx: CanvasRenderingContext2D) => void;
  drawAccessory?: (ctx: CanvasRenderingContext2D, pass: CatAccessoryPass) => void;
  concealed?: boolean;
};

// Includes the curled tail, tall antlers and seated paws without a full-screen
// allocation. Only fog/visibility fades need this single reusable surface.
const FRAME = { x: -96, y: -112, width: 192, height: 192 } as const;
let surface: HTMLCanvasElement | undefined;
let surfaceInUse = false;

function paintLayers(ctx: CanvasRenderingContext2D, layers: CatCharacterLayers) {
  ctx.save();
  try {
    if (!layers.concealed) layers.drawAccessory?.(ctx, "BACK");
    layers.drawBody(ctx);
    if (!layers.concealed) layers.drawAccessory?.(ctx, "FRONT");
  } finally {
    ctx.restore();
  }
}

/** Every live pose uses the same occlusion order. Fade the assembled character
 * once so a rear collar/cap cannot show through its translucent painted body. */
export function drawCatCharacter(ctx: CanvasRenderingContext2D, layers: CatCharacterLayers) {
  const alpha = ctx.globalAlpha;
  if (alpha <= 0) return;
  if (layers.concealed || !layers.drawAccessory || !(alpha < .999) || surfaceInUse || typeof document === "undefined") {
    paintLayers(ctx, layers);
    return;
  }
  const transform = ctx.getTransform?.();
  const magnification = transform ? Math.max(Math.hypot(transform.a, transform.b), Math.hypot(transform.c, transform.d)) : 1;
  const detail = Number.isFinite(magnification) ? Math.max(1, Math.min(3, Math.ceil(magnification))) : 1;
  if (!surface) surface = document.createElement("canvas");
  const size = FRAME.width * detail;
  if (surface.width !== size || surface.height !== size) { surface.width = size; surface.height = size; }
  const paint = surface.getContext("2d");
  if (!paint) { paintLayers(ctx, layers); return; }
  surfaceInUse = true;
  try {
    paint.setTransform(1, 0, 0, 1, 0, 0);
    paint.clearRect(0, 0, size, size);
    paint.globalAlpha = 1;
    paint.globalCompositeOperation = "source-over";
    paint.imageSmoothingEnabled = true;
    paint.imageSmoothingQuality = "high";
    paint.setTransform(detail, 0, 0, detail, -FRAME.x * detail, -FRAME.y * detail);
    paintLayers(paint, layers);
    ctx.drawImage(surface, FRAME.x, FRAME.y, FRAME.width, FRAME.height);
  } finally {
    surfaceInUse = false;
  }
}
