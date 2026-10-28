"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { drawMooncat, drawVectorMooncat } from "../../mooncat-renderer";
import { loadMooncatSprites, mooncatRigSummary } from "../../mooncat-sprites";
import { type CatDirection } from "../../cat-art";
import { SlimePortrait } from "../../cat-portrait";
import { EYE_STYLES, type EyeStyle } from "../../../server/appearance";
import { drawFallenCat } from "../../fallen-cat-art";
import { DEVOUR_SECONDS, drawCatConsumption } from "../../cat-devour";

const DIRECTIONS: CatDirection[] = ["NORTH", "NE", "EAST", "SE", "SOUTH", "SW", "WEST", "NW"];
export function CatPreview() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const focusCanvas = useRef<HTMLCanvasElement>(null);
  const [direction, setDirection] = useState<CatDirection>("SE");
  const [ready, setReady] = useState(false);
  const [rigSummary, setRigSummary] = useState("");
  const [playing, setPlaying] = useState(true);
  const [color, setColor] = useState("#8257cb");
  const [eyes, setEyes] = useState<EyeStyle>("FIERCE");
  const [concealed, setConcealed] = useState(false);
  const [fallen, setFallen] = useState(false);
  const [devour, setDevour] = useState(false);
  const [captureFrame, setCaptureFrame] = useState(.35);
  const [resting, setResting] = useState(false);
  const [walkStyle, setWalkStyle] = useState<"SMOOTH" | "FRAMES">("SMOOTH");
  const [walkSpeed, setWalkSpeed] = useState(.65);
  useEffect(() => {
    let active = true; void loadMooncatSprites().then(value => { if (active) { setReady(value); setRigSummary(mooncatRigSummary()); } });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d"); if (!ctx) return;
    let frame = 0;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const paint = (now: number) => {
      const animate = playing && !preference.matches;
      const time = animate ? now / 1000 * walkSpeed : 0;
      const focused = focusCanvas.current?.getContext("2d");
      if (focused) {
        focused.setTransform(1, 0, 0, 1, 0, 0); focused.clearRect(0, 0, 640, 640);
        if (devour) {
          focused.translate(165, 350); focused.scale(2.8, 2.8);
          drawCatConsumption(focused, { startX: 0, startY: 0, x: 95, y: 0, killerColor: color, victimColor: "#4abbb8" },
            animate ? Math.min(1, time % (DEVOUR_SECONDS + .8) / DEVOUR_SECONDS) : captureFrame,
            { concealed, eyes, reducedMotion: preference.matches });
        } else {
        focused.translate(320, 370); focused.scale(5.2, 5.2);
        if (!fallen) { focused.fillStyle = "#22223925"; focused.beginPath(); focused.ellipse(0, 28, 31, 7, 0, 0, Math.PI * 2); focused.fill(); }
        if (fallen) { focused.translate(0, 26); drawFallenCat(focused, color, concealed); }
        else drawMooncat(focused, { color, direction, stridePhase: time * 8, strideAmount: animate && !resting ? .8 : 0, idlePhase: animate ? time * 1.7 : 0, blink: animate && time % 5.7 < .13, eyeStyle: eyes, concealed, walkStyle });
        }
      }
      ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, 960, 640);
      DIRECTIONS.forEach((direction, index) => {
        const x = 120 + index % 4 * 240, y = 145 + Math.floor(index / 4) * 250;
        ctx.save(); ctx.translate(x, y); ctx.scale(2, 2);
        ctx.fillStyle = "#22223930"; ctx.beginPath(); ctx.ellipse(0, 28, 34, 8, 0, 0, Math.PI * 2); ctx.fill();
        drawMooncat(ctx, { color, direction, stridePhase: time * 8, strideAmount: animate && !resting ? .8 : 0, idlePhase: animate ? time * 1.7 : 0, blink: animate && time % 5.7 < .13, eyeStyle: eyes, concealed, walkStyle, tailTilt: Math.sin(time * 1.5) * .08 }); ctx.restore();
        ctx.fillStyle = "#39324d"; ctx.textAlign = "center"; ctx.font = "600 15px system-ui"; ctx.fillText(direction, x, y + 82);
      });
      // Actual-size control: compare silhouette and readability at game scale.
      ctx.save(); ctx.translate(100, 585); drawVectorMooncat(ctx, { color, direction: "SE", stridePhase: time * 8, strideAmount: animate ? .8 : 0, blink: false }); ctx.restore();
      ctx.save(); ctx.translate(265, 585); drawMooncat(ctx, { color, direction: "SE", stridePhase: time * 8, strideAmount: animate ? .8 : 0, blink: false, eyeStyle: eyes }); ctx.restore();
      ctx.font = "12px system-ui"; ctx.fillStyle = "#39324d"; ctx.fillText("Previous · game scale", 100, 632); ctx.fillText("Updated · game scale", 265, 632);
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint); return () => cancelAnimationFrame(frame);
  }, [playing, color, eyes, concealed, direction, fallen, devour, captureFrame, resting, walkStyle, walkSpeed]);
  return <main style={{ minHeight: "100dvh", background: "#ede2ca", color: "#302b42", padding: 24, fontFamily: "system-ui" }}>
    <h1>Moonwarden · Moon-cat art review</h1>
    <p>Painted moon-cat · grounded paws · shoulder breathing · shared gameplay art.</p>
    <p role="status">{ready ? "Painted sprite artwork loaded" : "Loading artwork · safe vector fallback active"}</p>
    {rigSummary ? <small>Paw layers: {rigSummary}</small> : null}
    <Link href="/" style={{ color: "#57417e", textDecoration: "underline" }}>Try the character in game →</Link>
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", margin: "18px 0" }}>
      <button onClick={() => setPlaying(value => !value)} style={{ padding: 12 }}>{playing ? "Pause walk" : "Play walk"}</button>
      <label>Coat <input type="color" value={color} onChange={event => setColor(event.target.value)} /></label>
      <label>Eyes <select value={eyes} onChange={event => setEyes(event.target.value as EyeStyle)}>{EYE_STYLES.map(style => <option key={style}>{style}</option>)}</select></label>
      <label>Direction <select value={direction} onChange={event => setDirection(event.target.value as CatDirection)}>{DIRECTIONS.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Walk <select value={walkStyle} onChange={event => setWalkStyle(event.target.value as "SMOOTH" | "FRAMES")}><option value="SMOOTH">Smooth paws</option><option value="FRAMES">Original four frames</option></select></label>
      <label>Playback {walkSpeed.toFixed(2)}× <input type="range" min={.25} max={1.5} step={.05} value={walkSpeed} onChange={event => setWalkSpeed(Number(event.target.value))} /></label>
      <label><input type="checkbox" checked={concealed} onChange={event => setConcealed(event.target.checked)} /> Anonymous silhouette</label>
      <label><input type="checkbox" checked={fallen} onChange={event => setFallen(event.target.checked)} /> Fallen cat marker</label>
      <label><input type="checkbox" checked={resting} onChange={event => setResting(event.target.checked)} /> Resting idle</label>
      <label><input type="checkbox" checked={devour} onChange={event => setDevour(event.target.checked)} /> Hollow devour preview</label>
      {devour && !playing ? <label>Capture frame <input type="range" min={0} max={1} step={.01} value={captureFrame} onChange={event => setCaptureFrame(Number(event.target.value))} /></label> : null}
      <span style={{ width: 72, height: 72 }}><SlimePortrait color={color} eyeStyle={eyes} /></span>
    </div>
    <canvas ref={focusCanvas} width={640} height={640} aria-label="Enlarged live moon-cat character" style={{ width: "min(360px, 100%)", display: "block", borderRadius: 20, background: "#f6eedb", marginBottom: 20 }} />
    <canvas ref={canvas} width={1920} height={1280} aria-label="Eight animated moon-cat directions and an actual-size before-and-after comparison" style={{ width: "min(960px, 100%)", display: "block", borderRadius: 20, background: "#f6eedb" }} />
  </main>;
}
