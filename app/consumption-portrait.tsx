"use client";

import { useEffect, useRef } from "react";
import { DEVOUR_SECONDS, drawCatConsumption } from "./cat-devour";
import { loadMooncatSprites } from "./mooncat-sprites";

/** Victim-only replay shares the arena effect and stops after one capture. */
export function ConsumptionPortrait({ killerColor, victimColor }: { killerColor: string; victimColor: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d"); if (!ctx) return;
    let active = true, frame = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const play = () => {
      if (!active) return;
      const start = performance.now();
      const paint = (now: number) => {
        if (!active) return;
        const progress = reduced.matches ? 1 : Math.min(1, (now - start) / (DEVOUR_SECONDS * 1000));
        ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, 260, 170);
        drawCatConsumption(ctx, { startX: 92, startY: 115, x: 199, y: 115, killerColor, victimColor }, progress, { reducedMotion: reduced.matches });
        if (progress < 1) frame = requestAnimationFrame(paint);
      };
      frame = requestAnimationFrame(paint);
    };
    void loadMooncatSprites().then(play);
    return () => { active = false; cancelAnimationFrame(frame); };
  }, [killerColor, victimColor]);
  return <canvas ref={canvas} className="consumption-portrait" width={520} height={340} aria-hidden="true" />;
}
