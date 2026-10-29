"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { drawForestSanctum, drawSanctumStatus, type Sanctum } from "../../sanctum-art";
import { loadShrineSprites } from "../../shrine-sprites";

const SHRINES = [
  { title: "Celestial Sundial", label: "STAR ALTAR", reward: "SONAR" },
  { title: "Weeping Moon-Basin", label: "MOONWELL", reward: "FLASHLIGHT" },
  { title: "Four-Phase Totem", label: "OWL TOTEM", reward: "FLARE" },
] as const;
const WIDTH = 1080, HEIGHT = 600;

export function ShrinePreview() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const completedAt = useRef<number | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [claimed, setClaimed] = useState(false);
  useEffect(() => {
    let active = true;
    void loadShrineSprites().then(value => { if (active) setReady(value); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d"); if (!ctx) return;
    let frame = 0, lastPaint = -Infinity;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const paint = (now: number) => {
      if (document.hidden) return;
      if (now - lastPaint < 1000 / 30) { frame = requestAnimationFrame(paint); return; }
      lastPaint = now;
      const time = preference.matches ? 0 : now / 1000;
      ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.textAlign = "center";
      for (let row = 0; row < 2; row++) SHRINES.forEach((definition, column) => {
        const x = column * 360 + 8, y = row * 300 + 8;
        ctx.fillStyle = row ? "#24384a" : "#202b3d";
        ctx.strokeStyle = row ? "#7a7eaa" : "#4d6178"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(x, y, 344, 284, 18); ctx.fill(); ctx.stroke();
        ctx.font = "700 16px system-ui"; ctx.fillStyle = "#e6e4f4";
        ctx.fillText(definition.title, x + 172, y + 31);
        ctx.font = "600 10px ui-monospace, monospace";
        ctx.fillStyle = locked ? "#a9b3c4" : row ? "#c4e7f2" : "#b0bdd1";
        ctx.fillText(locked ? "ORDEAL LOCK · LIGHT DIMMED" : row ? claimed ? "ACTIVATED · PERSONAL RITE SEALED" : "ACTIVATED · YOUR RITE STILL AVAILABLE" : "INACTIVE · TASK AVAILABLE", x + 172, y + 52);
        const station: Sanctum = {
          x: 0, y: 0, pulse: column * 1.3, completed: row === 1 && claimed,
          teamRestored: row === 1, rootClosure: locked ? 1 : 0,
          completedAt: row && !preference.matches ? completedAt.current : undefined,
          label: definition.label, reward: definition.reward,
        };
        ctx.save(); ctx.translate(x + 172, y + 186); ctx.scale(1.6, 1.6);
        drawForestSanctum(ctx, station, time, locked, false);
        // Preserve the live personal-completion badge without granting a task.
        drawSanctumStatus(ctx, station, time, locked, false);
        ctx.restore();
      });
      if (!preference.matches) frame = requestAnimationFrame(paint);
    };
    const restart = () => { cancelAnimationFrame(frame); lastPaint = -Infinity; paint(performance.now()); };
    restart(); preference.addEventListener("change", restart); document.addEventListener("visibilitychange", restart);
    return () => { cancelAnimationFrame(frame); preference.removeEventListener("change", restart); document.removeEventListener("visibilitychange", restart); };
  }, [ready, locked, claimed]);
  return <main style={{ minHeight: "100dvh", padding: 24, background: "#131e2d", color: "#e4ecf6", fontFamily: "system-ui" }}>
    <header style={{ maxWidth: WIDTH, margin: "0 auto 18px" }}>
      <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>Moonwarden · Celestial shrine review</h1>
      <p style={{ color: "#b7c8dd", margin: "0 0 12px" }}>Top: inactive. Bottom: activated. Shared restoration glows without claiming another warden’s personal ritual.</p>
      <p role="status" style={{ margin: "0 0 14px", color: "#c4b6ed" }}>{ready ? "Painted shrine artwork loaded" : "Loading shrine artwork · safe fallback active"}</p>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18 }}>
        <label><input type="checkbox" checked={locked} onChange={event => setLocked(event.target.checked)} /> Ordeal lock</label>
        <label><input type="checkbox" checked={claimed} onChange={event => setClaimed(event.target.checked)} /> Personal rite completed</label>
        <button type="button" disabled={locked} onClick={() => { completedAt.current = performance.now() / 1000; }} style={{ minHeight: 36, padding: "7px 13px", borderRadius: 10, border: "1px solid #7e85ae", background: "#344764", color: "#edf2ff", cursor: "pointer" }}>Replay completion pulse</button>
        <Link href="/" style={{ color: "#d1c1f5" }}>Back to the game →</Link>
      </div>
    </header>
    <canvas ref={canvas} width={WIDTH * 2} height={HEIGHT * 2} role="img" aria-label="Three shrine types compared in inactive and activated states: celestial sundial, cat moon-basin and four-phase totem" style={{ display: "block", width: "min(100%, 1080px)", height: "auto", margin: "auto" }} />
  </main>;
}
