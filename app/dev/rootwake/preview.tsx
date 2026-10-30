"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { drawMoonGlade } from "../../moon-glade";
import { drawForestObstacle } from "../../forest-art";
import { loadForestSprites } from "../../forest-sprites";
import { drawRootwakeChamber, drawRootwakeWalls } from "../../rootwake-art";
import { SANCTUARY_OBSTACLES } from "../../../server/sanctuary-map";

const VIEW = { x: 450, y: 260, width: 1020, height: 560 };
const OBSERVER = { x: 960, y: 430 };
const STAGES = [{ label: "Warning", at: -1.5 }, { label: "Erupt", at: .25 }, { label: "Sealed", at: 2 }, { label: "Doors open", at: 6.3 }, { label: "Recede", at: 11.8 }];

export function RootwakePreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedTime, setSelectedTime] = useState(2);
  const [elapsed, setElapsed] = useState(2);
  const [playing, setPlaying] = useState(true);
  const [hollow, setHollow] = useState(true);
  const [still, setStill] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { let live = true; void loadForestSprites().then(() => { if (live) setReady(true); }); return () => { live = false; }; }, []);
  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const background = document.createElement("canvas"); background.width = 1920; background.height = 1140;
    const floor = background.getContext("2d"); if (!floor) return;
    drawMoonGlade(floor);
    for (const obstacle of SANCTUARY_OBSTACLES) drawForestObstacle(floor, obstacle, 0, OBSERVER, true);
    let frame = 0, lastPaint = -Infinity, lastLabel = -Infinity;
    const start = performance.now();
    const paint = (now: number) => {
      if (document.hidden) return;
      const reducedMotion = preference.matches || still;
      const time = playing && !preference.matches ? ((selectedTime + 3 + (now - start) / 1000) % 15) - 3 : selectedTime;
      if (now - lastPaint >= 1000 / 30) {
        lastPaint = now;
        ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, VIEW.width, VIEW.height);
        ctx.save(); ctx.translate(-VIEW.x, -VIEW.y); ctx.drawImage(background, 0, 0);
        ctx.fillStyle = "#0a15252b"; ctx.fillRect(VIEW.x, VIEW.y, VIEW.width, VIEW.height);
        if (!hollow && time >= 0) drawRootwakeChamber(ctx, OBSERVER, 12 - time);
        drawRootwakeWalls(ctx, { phase: time < 0 ? "COUNTDOWN" : "ORDEAL", remaining: time < 0 ? -time : 12 - time, reducedMotion, hollow, view: VIEW });
        ctx.restore();
        if (now - lastLabel > 120) { lastLabel = now; setElapsed(time); }
      }
      if (playing && !preference.matches) frame = requestAnimationFrame(paint);
    };
    const restart = () => { cancelAnimationFrame(frame); lastPaint = -Infinity; paint(performance.now()); };
    restart(); preference.addEventListener("change", restart); document.addEventListener("visibilitychange", restart);
    return () => { cancelAnimationFrame(frame); preference.removeEventListener("change", restart); document.removeEventListener("visibilitychange", restart); };
  }, [selectedTime, playing, hollow, still, ready]);
  const choose = (time: number) => { setPlaying(false); setSelectedTime(time); setElapsed(time); };
  return <main style={{ minHeight: "100dvh", padding: 24, background: "#131e2d", color: "#e4ecf6", fontFamily: "system-ui" }}>
    <header style={{ maxWidth: VIEW.width, margin: "0 auto 18px" }}>
      <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>Rootwake · Living roots</h1>
      <p style={{ color: "#b7c8dd", margin: "0 0 14px" }}>The live renderer: earth fissures → braided roots → curling doors → retraction.</p>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <button type="button" onClick={() => { if (playing) choose(elapsed); else setPlaying(true); }} style={buttonStyle}>{playing ? "Pause" : "Play sequence"}</button>
        {STAGES.map(stage => <button key={stage.label} type="button" onClick={() => choose(stage.at)} style={buttonStyle}>{stage.label}</button>)}
        <label style={{ display: "flex", alignItems: "center", minHeight: 44, gap: 6 }}><input type="checkbox" checked={hollow} onChange={event => setHollow(event.target.checked)} /> Whole grove</label>
        <label style={{ display: "flex", alignItems: "center", minHeight: 44, gap: 6 }}><input type="checkbox" checked={still} onChange={event => setStill(event.target.checked)} /> Reduced motion</label>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12 }}>Timeline <input aria-label="Rootwake timeline" type="range" min={-3} max={12} step={.01} value={elapsed} onChange={event => choose(Number(event.target.value))} style={{ flex: 1, minHeight: 44 }} /><output style={{ minWidth: 48 }}>{elapsed.toFixed(1)}s</output></label>
    </header>
    <canvas ref={canvasRef} width={VIEW.width * 2} height={VIEW.height * 2} role="img" aria-label="Rootwake roots grow along the sanctuary walls and curl aside at the moon doors" style={{ display: "block", width: "min(100%, 1020px)", height: "auto", margin: "auto", borderRadius: 16, border: "1px solid #4e6075" }} />
    <p style={{ maxWidth: VIEW.width, margin: "16px auto", color: "#b7c8dd", fontSize: 13 }}>Doors open at six seconds. Chamber masks and collision rules are unchanged. <Link href="/" style={{ color: "#d1c1f5" }}>Back to game →</Link></p>
  </main>;
}
const buttonStyle = { minHeight: 44, padding: "7px 13px", borderRadius: 10, border: "1px solid #7e85ae", background: "#344764", color: "#edf2ff", cursor: "pointer" };
