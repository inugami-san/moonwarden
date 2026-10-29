"use client";

import { useEffect, useRef } from "react";
import type { EyeStyle } from "../server/appearance";
import { drawSeatedCat, loadSeatedCat } from "./seated-cat-art";
import { drawMooncat } from "./mooncat-renderer";

/** Shared, static head-only portrait: no full-body pose or independent RAF loop. */
export function CatHead({ color, eyeStyle = "FIERCE" }: { color: string; eyeStyle?: EyeStyle }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    const paint = () => {
      if (!active) return;
      const context = canvas.current?.getContext("2d"); if (!context) return;
      context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, 240, 240);
      context.scale(240 / 72, 240 / 72); context.translate(36, 65);
      // The jaw ends above the scarf. Clip the neck/body/tail out of every icon.
      context.save(); context.beginPath();
      context.moveTo(-36, -65); context.lineTo(36, -65); context.lineTo(36, -23);
      context.quadraticCurveTo(29, -9, 0, -7);
      context.quadraticCurveTo(-29, -9, -36, -23); context.closePath(); context.clip();
      if (!drawSeatedCat(context, color, eyeStyle)) drawMooncat(context, {
        color, eyeStyle, direction: "SOUTH", stridePhase: 0, strideAmount: 0, blink: false,
      });
      context.restore();
    };
    paint(); void loadSeatedCat().then(() => { if (active) paint(); });
    return () => { active = false; };
  }, [color, eyeStyle]);
  return <canvas ref={canvas} className="cat-head" width={240} height={240} data-eye-style={eyeStyle} aria-hidden="true" />;
}
