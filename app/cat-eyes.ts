import { normalizeEyeStyle, type EyeStyle } from "../server/appearance";

type EyeCommand = ["M" | "L", number, number] | ["Q", number, number, number, number] | ["Z"];

/** The same commands generate Canvas eyes and SVG portraits/picker previews. */
const SHAPES: Record<EyeStyle, readonly EyeCommand[]> = {
  FIERCE: [
    ["M", -15, 3], ["Q", -8, 1, -3, 6], ["Q", -3, 14, -9, 14], ["Q", -16, 14, -15, 3], ["Z"],
    ["M", 7, 4], ["Q", 13, 1, 18, 3], ["Q", 19, 13, 13, 13], ["Q", 7, 13, 7, 4], ["Z"],
  ],
  ROUND: [
    ["M", -15, 7], ["Q", -15, 1, -9, 1], ["Q", -3, 1, -3, 7], ["Q", -3, 14, -9, 14], ["Q", -15, 14, -15, 7], ["Z"],
    ["M", 7, 7], ["Q", 7, 1, 13, 1], ["Q", 18, 1, 18, 7], ["Q", 18, 13, 13, 13], ["Q", 7, 13, 7, 7], ["Z"],
  ],
  DREAMY: [
    ["M", -15, 6], ["L", -3, 6], ["Q", -3, 14, -9, 14], ["Q", -15, 14, -15, 6], ["Z"],
    ["M", 7, 6], ["L", 18, 6], ["Q", 18, 13, 13, 13], ["Q", 7, 13, 7, 6], ["Z"],
  ],
  JOYFUL: [
    ["M", -15, 10], ["Q", -9, -1, -3, 10], ["L", -6, 11], ["Q", -9, 3, -13, 11], ["Z"],
    ["M", 7, 10], ["Q", 13, -1, 18, 10], ["L", 15, 11], ["Q", 13, 3, 9, 11], ["Z"],
  ],
  STARRY: [
    ["M", -9, 0], ["L", -6, 4], ["L", -2, 5], ["L", -5, 9], ["L", -4, 14], ["L", -9, 11], ["L", -14, 14], ["L", -13, 9], ["L", -17, 5], ["L", -12, 4], ["Z"],
    ["M", 13, 1], ["L", 16, 4], ["L", 19, 5], ["L", 16, 9], ["L", 17, 13], ["L", 13, 11], ["L", 8, 13], ["L", 9, 9], ["L", 6, 5], ["L", 10, 4], ["Z"],
  ],
};

export const EYE_LABELS: Record<EyeStyle, string> = { FIERCE: "Fierce", ROUND: "Round", DREAMY: "Dreamy", JOYFUL: "Joyful", STARRY: "Starry" };

export function eyePath(style: EyeStyle = "FIERCE"): string {
  return SHAPES[normalizeEyeStyle(style)].map(([command, ...points]) => `${command}${points.join(" ")}`).join("");
}

export function drawEyeShape(ctx: CanvasRenderingContext2D, style: EyeStyle = "FIERCE") {
  for (const command of SHAPES[normalizeEyeStyle(style)]) {
    switch (command[0]) {
      case "M": ctx.moveTo(command[1], command[2]); break;
      case "L": ctx.lineTo(command[1], command[2]); break;
      case "Q": ctx.quadraticCurveTo(command[1], command[2], command[3], command[4]); break;
      case "Z": ctx.closePath(); break;
    }
  }
}
