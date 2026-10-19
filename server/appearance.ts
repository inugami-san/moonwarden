/** Public cosmetic identifiers only. Older clients safely default to Fierce. */
export const EYE_STYLES = ["FIERCE", "ROUND", "DREAMY", "JOYFUL", "STARRY"] as const;
export type EyeStyle = typeof EYE_STYLES[number];
export function isEyeStyle(value: unknown): value is EyeStyle {
  return typeof value === "string" && EYE_STYLES.some(style => style === value);
}
export function normalizeEyeStyle(value: unknown): EyeStyle {
  return isEyeStyle(value) ? value : "FIERCE";
}
