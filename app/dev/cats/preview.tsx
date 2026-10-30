"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { drawMooncat, drawVectorMooncat, type MooncatOptions } from "../../mooncat-renderer";
import { loadMooncatSprites, mooncatRigSummary } from "../../mooncat-sprites";
import { type CatDirection } from "../../cat-art";
import type { CatAccessoryPass } from "../../cat-character";
import { SlimePortrait } from "../../cat-portrait";
import { drawWornAccessory } from "../../accessory-art";
import { EYE_STYLES, type EyeStyle } from "../../../server/appearance";
import { HAT_IDS, HAT_META } from "../../../server/cosmetics";
import type { Hat } from "../../../server/game-types";
import { drawFallenCat } from "../../fallen-cat-art";
import { DEVOUR_SECONDS, drawCatConsumption } from "../../cat-devour";

const DIRECTIONS: CatDirection[] = ["NORTH", "NE", "EAST", "SE", "SOUTH", "SW", "WEST", "NW"];

/** Exercise the same directional layers as live gameplay, including anonymity. */
export function drawReviewCat(ctx: CanvasRenderingContext2D, options: MooncatOptions, accessory?: Hat, vectorFallback = false) {
  const { direction, muted = false, stridePhase, strideAmount, idlePhase = 0 } = options;
  if (accessory && !options.concealed) drawWornAccessory(ctx, accessory, direction, muted, stridePhase, strideAmount, "GAMEPLAY", idlePhase, "BACK");
  if (vectorFallback) drawVectorMooncat(ctx, options); else drawMooncat(ctx, options);
  if (accessory && !options.concealed) drawWornAccessory(ctx, accessory, direction, muted, stridePhase, strideAmount, "GAMEPLAY", idlePhase, "FRONT");
}

/** The consumption renderer supplies its own actor pose and back/front pass. */
export function reviewDevourAccessory(accessory?: Hat, concealed = false) {
  if (!accessory || concealed) return undefined;
  return (ctx: CanvasRenderingContext2D, direction: CatDirection, phase: number, amount: number, layer: CatAccessoryPass = "FRONT") => {
    drawWornAccessory(ctx, accessory, direction, false, phase, amount, "GAMEPLAY", 0, layer);
  };
}

export function CatPreview() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const focusCanvas = useRef<HTMLCanvasElement>(null);
  const scaleCanvas = useRef<HTMLCanvasElement>(null);
  const [direction, setDirection] = useState<CatDirection>("SE");
  const [accessory, setAccessory] = useState<Hat | "NONE">("moonbell");
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
  const worn = accessory === "NONE" ? undefined : accessory;
  useEffect(() => {
    let active = true;
    void loadMooncatSprites().then(value => { if (active) { setReady(value); setRigSummary(mooncatRigSummary()); } });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d"); if (!ctx) return;
    let frame = 0, lastPaint = -Infinity;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const paint = (now: number) => {
      if (document.hidden) return;
      const animate = playing && !preference.matches;
      if (animate && now - lastPaint < 1000 / 30) { frame = requestAnimationFrame(paint); return; }
      lastPaint = now;
      const time = animate ? now / 1000 * walkSpeed : 0;
      const options: MooncatOptions = { color, direction, stridePhase: time * 8, strideAmount: animate && !resting ? .8 : 0,
        idlePhase: animate ? time * 1.7 : 0, blink: animate && time % 5.7 < .13, eyeStyle: eyes, concealed, walkStyle };
      const focused = focusCanvas.current?.getContext("2d");
      if (focused) {
        focused.setTransform(1, 0, 0, 1, 0, 0); focused.clearRect(0, 0, 640, 640);
        if (devour) {
          focused.translate(165, 350); focused.scale(2.8, 2.8);
          drawCatConsumption(focused, { startX: 0, startY: 0, x: 95, y: 0, killerColor: color, victimColor: "#4abbb8" },
            animate ? Math.min(1, time % (DEVOUR_SECONDS + .8) / DEVOUR_SECONDS) : captureFrame,
            { concealed, eyes, reducedMotion: preference.matches, drawHat: reviewDevourAccessory(worn, concealed) });
        } else {
          focused.translate(320, 370); focused.scale(5.2, 5.2);
          if (!fallen) { focused.fillStyle = "#22223925"; focused.beginPath(); focused.ellipse(0, 28, 31, 7, 0, 0, Math.PI * 2); focused.fill(); }
          if (fallen) { focused.translate(0, 26); drawFallenCat(focused, color, concealed); }
          else drawReviewCat(focused, options, worn);
        }
      }
      ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, 1120, 540);
      DIRECTIONS.forEach((heading, index) => {
        const x = 140 + index % 4 * 280, y = 123 + Math.floor(index / 4) * 265;
        for (const [offset, walking] of [[-66, false], [66, true]] as const) {
          ctx.save(); ctx.translate(x + offset, y); ctx.scale(1.8, 1.8);
          ctx.fillStyle = "#22223930"; ctx.beginPath(); ctx.ellipse(0, 28, 34, 8, 0, 0, Math.PI * 2); ctx.fill();
          drawReviewCat(ctx, { ...options, direction: heading, strideAmount: walking && animate ? .8 : 0,
            tailTilt: Math.sin(time * 1.5) * .08 }, worn); ctx.restore();
          ctx.fillStyle = "#645c77"; ctx.textAlign = "center"; ctx.font = "12px system-ui";
          ctx.fillText(walking ? "Walk" : "Idle", x + offset, y + 78);
        }
        ctx.fillStyle = "#39324d"; ctx.font = "600 15px system-ui"; ctx.fillText(heading, x, y + 106);
      });
      const actual = scaleCanvas.current?.getContext("2d");
      if (actual) {
        actual.setTransform(2, 0, 0, 2, 0, 0); actual.clearRect(0, 0, 360, 165);
        for (const [x, title, walking, vector] of [[60, "Idle", false, false], [180, "Walk", true, false], [300, "Vector fallback", true, true]] as const) {
          actual.save(); actual.translate(x, 80);
          drawReviewCat(actual, { ...options, strideAmount: walking && animate ? .8 : 0 }, worn, vector);
          actual.restore(); actual.textAlign = "center"; actual.font = "12px system-ui"; actual.fillStyle = "#39324d";
          actual.fillText(title, x, 140);
        }
      }
      if (animate) frame = requestAnimationFrame(paint);
    };
    const restart = () => { cancelAnimationFrame(frame); lastPaint = -Infinity; if (!document.hidden) frame = requestAnimationFrame(paint); };
    restart();
    document.addEventListener("visibilitychange", restart); preference.addEventListener("change", restart);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("visibilitychange", restart); preference.removeEventListener("change", restart); };
  }, [playing, color, eyes, concealed, direction, worn, fallen, devour, captureFrame, resting, walkStyle, walkSpeed, ready]);
  return <main style={{ minHeight: "100dvh", background: "#ede2ca", color: "#302b42", padding: 24, fontFamily: "system-ui" }}>
    <h1>Moonwarden · Moon-cat art review</h1>
    <p>Shared directional accessories · idle and walking fit · gameplay, seated and lobby poses.</p>
    <p role="status">{ready ? "Painted sprite artwork loaded" : "Loading artwork · safe vector fallback active"}</p>
    {rigSummary ? <small>Paw layers: {rigSummary}</small> : null}
    <p><Link href="/" style={{ color: "#57417e", textDecoration: "underline" }}>Try the character in game →</Link></p>
    <div role="group" aria-label="Character review controls" style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", margin: "18px 0" }}>
      <button type="button" onClick={() => setPlaying(value => !value)} style={{ padding: 12 }}>{playing ? "Pause animation" : "Play animation"}</button>
      <label>Accessory <select value={accessory} onChange={event => setAccessory(event.target.value as Hat | "NONE")}><option value="NONE">No accessory</option>{HAT_IDS.map(id => <option key={id} value={id}>{HAT_META[id].title}</option>)}</select></label>
      <label>Coat <input type="color" value={color} onChange={event => setColor(event.target.value)} /></label>
      <label>Eyes <select value={eyes} onChange={event => setEyes(event.target.value as EyeStyle)}>{EYE_STYLES.map(style => <option key={style}>{style}</option>)}</select></label>
      <label>Direction <select value={direction} onChange={event => setDirection(event.target.value as CatDirection)}>{DIRECTIONS.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Walk <select value={walkStyle} onChange={event => setWalkStyle(event.target.value as "SMOOTH" | "FRAMES")}><option value="SMOOTH">Smooth paws</option><option value="FRAMES">Original four frames</option></select></label>
      <label>Playback {walkSpeed.toFixed(2)}× <input type="range" min={.25} max={1.5} step={.05} value={walkSpeed} onChange={event => setWalkSpeed(Number(event.target.value))} /></label>
      <label><input type="checkbox" checked={concealed} onChange={event => setConcealed(event.target.checked)} /> Anonymous silhouette</label>
      <label><input type="checkbox" checked={fallen} onChange={event => setFallen(event.target.checked)} /> Fallen cat marker</label>
      <label><input type="checkbox" checked={resting} onChange={event => setResting(event.target.checked)} /> Focus resting idle</label>
      <label><input type="checkbox" checked={devour} onChange={event => setDevour(event.target.checked)} /> Hollow devour preview</label>
      {devour && !playing ? <label>Capture frame <input type="range" min={0} max={1} step={.01} value={captureFrame} onChange={event => setCaptureFrame(Number(event.target.value))} /></label> : null}
    </div>
    <p role="status">{concealed ? "Anonymous view: coat, eyes and all accessories are hidden." : worn ? `Reviewing ${HAT_META[worn].title}. Front and rear layers follow the same live character rig.` : "No accessory selected: inspect the underlying character silhouette."}</p>
    <section style={{ display: "flex", flexWrap: "wrap", alignItems: "start", gap: 20, marginBottom: 20 }} aria-label="Gameplay, seated and lobby accessory comparison">
      <div><h2 style={{ fontSize: 16 }}>In-game character · {direction}</h2><canvas ref={focusCanvas} width={640} height={640} aria-label="Enlarged live moon-cat character with selected accessory" style={{ width: "min(360px, 100%)", maxWidth: "100%", display: "block", borderRadius: 20, background: "#f6eedb" }} /></div>
      {(["SEATED", "LOBBY"] as const).map(pose => <div key={pose}>
        <h2 style={{ fontSize: 16 }}>{pose === "SEATED" ? "Seated full body" : "Lobby close-up"}</h2>
        <div className={concealed ? "preview-fog" : undefined} style={{ width: 240, height: 240, position: "relative", borderRadius: 20, background: "#25364e", overflow: "hidden" }}>
          <SlimePortrait color={color} eyeStyle={eyes} accessory={concealed ? undefined : worn} pose={pose} animated={playing} />
        </div>
        <p style={{ maxWidth: 240, fontSize: 13 }}>{pose === "SEATED" ? "Full seated pose used by the home character." : "The actual lobby portrait, using the same selection."}</p>
      </div>)}
    </section>
    <section aria-labelledby="direction-review-title">
      <h2 id="direction-review-title">Eight-direction fit check</h2>
      <p id="direction-review-help">Idle is on the left; walking is on the right. Check that straps wrap behind the neck, ornaments stay attached, and rear views hide front-facing details.</p>
      <canvas ref={canvas} width={2240} height={1080} aria-label="All eight cat directions, each shown idle and walking with selected accessory" aria-describedby="direction-review-help" style={{ width: "min(1120px, 100%)", display: "block", borderRadius: 20, background: "#f6eedb" }} />
    </section>
    <section aria-labelledby="game-scale-title" style={{ marginTop: 20 }}>
      <h2 id="game-scale-title">Actual gameplay size · 1×</h2>
      <p id="game-scale-help">Compare painted idle, painted walking, and the vector fallback without enlarging the art. The selected direction and accessory apply to all three.</p>
      <canvas ref={scaleCanvas} width={720} height={330} aria-label="Actual-size cat and accessory readability comparison" aria-describedby="game-scale-help" style={{ width: 360, maxWidth: "100%", display: "block", borderRadius: 20, background: "#f6eedb" }} />
    </section>
  </main>;
}
