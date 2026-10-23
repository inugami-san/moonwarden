export const TASK_HOLD_SECONDS = 1.8;

/** Quantize the HUD only; the actual channel keeps its full-resolution clock. */
export function holdTaskProgress(seconds: number) {
  if (!Number.isFinite(seconds)) return 0;
  return Math.round(Math.max(0, Math.min(1, seconds / TASK_HOLD_SECONDS)) * 100) / 100;
}
