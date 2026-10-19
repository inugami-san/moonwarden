import { normalizeEyeStyle, type EyeStyle } from "../server/appearance";

type EyeCommand = ["M" | "L", number, number] | ["Q", number, number, number, number] | ["Z"];

/** The same commands generate Canvas eyes and SVG portraits/picker previews. */
const SHAPES: Record<EyeStyle, readonly EyeCommand[]> = {
  FIERCE: [["M",-15,-1],["Q",-17,17,-10,14],["Q",-5,12,-6,4],["Z"],["M",16,-1],["Q",19,17,12,14],["Q",7,12,8,4],["Z"]],
  ROUND: [["M",-6,7],["Q",-6,-3,-11,-3],["Q",-16,-3,-16,7],["Q",-16,17,-11,17],["Q",-6,17,-6,7],["Z"],["M",17,7],["Q",17,-3,12,-3],["Q",7,-3,7,7],["Q",7,17,12,17],["Q",17,17,17,7],["Z"]],
  DREAMY: [["M",-16,6],["L",-6,6],["Q",-5,16,-11,15],["Q",-17,15,-16,6],["Z"],["M",7,6],["L",17,6],["Q",18,16,12,15],["Q",6,15,7,6],["Z"]],
  JOYFUL: [["M",-18,11],["Q",-12,-5,-5,11],["L",-8,12],["Q",-12,3,-15,12],["Z"],["M",5,11],["Q",12,-5,19,11],["L",16,12],["Q",12,3,8,12],["Z"]],
  STARRY: [["M",-11,-3],["L",-8,3],["L",-2,4],["L",-7,8],["L",-6,15],["L",-11,12],["L",-16,15],["L",-15,8],["L",-20,4],["L",-14,3],["Z"],["M",12,-3],["L",15,3],["L",21,4],["L",16,8],["L",17,15],["L",12,12],["L",7,15],["L",8,8],["L",3,4],["L",9,3],["Z"]],
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
