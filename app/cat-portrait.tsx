"use client";

import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { drawMooncat } from "./mooncat-renderer";
import { loadMooncatSprites } from "./mooncat-sprites";
import { SLIME_CORE_PATH, SLIME_EYE_SCALE, SLIME_EYE_SHADE, SLIME_MATERIAL, SLIME_PATH, SLIME_SPROUT, slimePalette } from "./cat-art";
import { type EyeStyle } from "../server/appearance";
import { eyePath } from "./cat-eyes";
import { drawWornAccessory } from "./accessory-art";
import type { Hat } from "../server/game-types";
import { drawSeatedCat, loadSeatedCat } from "./seated-cat-art";

/** Two small forepaw lifts, always returning to the grounded contact pose. */
export function catGreetingPhase(progress: number) {
  if (!Number.isFinite(progress) || progress <= 0 || progress >= 1) return 0;
  const step = Math.min(4, Math.floor(progress * 5));
  return [0, Math.PI / 2, 0, Math.PI / 2, 0][step];
}

export function portraitPixelSize(width: number, pixelRatio: number) {
  if (!Number.isFinite(width) || width <= 0) return 0;
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? Math.min(2, pixelRatio) : 1;
  return Math.max(96, Math.min(672, Math.ceil(width * ratio)));
}

type PortraitAppearance = { color: string; eyeStyle: EyeStyle; accessory?: Hat; greeting: boolean; pose: "GAMEPLAY" | "SEATED" | "LOBBY"; animated: boolean; concealment: boolean };

/** High-resolution portrait using the exact same artwork as the live character. */
export function SlimePortrait({ color, eyeStyle = "FIERCE", accessory, greeting = false, pose = "GAMEPLAY", animated = true, concealment = true }: { color: string; eyeStyle?: EyeStyle; accessory?: Hat; greeting?: boolean; pose?: "GAMEPLAY" | "SEATED" | "LOBBY"; animated?: boolean; concealment?: boolean }) {
  const portrait = useRef<HTMLCanvasElement>(null);
  const silhouette = useRef<HTMLCanvasElement>(null);
  const appearance = useRef<PortraitAppearance>({ color, eyeStyle, accessory, greeting, pose, animated, concealment });
  const requestPaint = useRef<(() => void) | null>(null);
  // Cosmetic changes paint before the next browser frame, without rebuilding
  // the art loader, visibility subscriptions, or canvas backing stores.
  useLayoutEffect(() => {
    appearance.current = { color, eyeStyle, accessory, greeting, pose, animated, concealment };
    requestPaint.current?.();
  }, [color, eyeStyle, accessory, greeting, pose, animated, concealment]);
  useEffect(() => {
    let active = true;
    let frame = 0;
    let greetingStart = performance.now();
    let wasGreeting = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let lastPaint = -Infinity;
    let shapeDirty = true;
    let visible = true;
    let layoutVisible = true;
    let inView = true;
    let lastPose = appearance.current.pose;
    let lastConcealment = appearance.current.concealment;
    let requestedArt: "GAMEPLAY" | "SEATED" | undefined;
    let artReady = false;
    const paint = (now = performance.now()) => {
    if (!active) return;
    if (document.hidden || !visible) return;
    if (!artReady) return;
    const { color, eyeStyle, accessory, greeting, pose, animated } = appearance.current;
    if (pose !== "GAMEPLAY" && animated && !reduced.matches && now - lastPaint < 1000 / 30) { frame = requestAnimationFrame(paint); return; }
    lastPaint = now;
    const progress = (now - greetingStart) / 780;
    const animate = greeting && !reduced.matches && progress < 1;
    const phase = animate ? catGreetingPhase(progress) : 0;
    for (const [canvas, concealed] of [[portrait.current, false], [silhouette.current, true]] as const) {
      if (concealed && !shapeDirty) continue;
      const context = canvas?.getContext("2d"); if (!canvas || !context) continue;
      context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
      context.scale(canvas.width / 112, canvas.height / 112); context.translate(56, 64);
      if (pose === "SEATED" || pose === "LOBBY") {
        // Intentional chest-up framing, not a miniature full-body sprite.
        if (pose === "LOBBY") { context.translate(0, 19); context.scale(1.4, 1.4); }
        const t = animated && !reduced.matches && !concealed ? now / 1000 : 0;
        const hello = animate ? Math.sin(progress * Math.PI) * -.045 : 0;
        context.translate(0, 30); context.rotate(Math.sin(t * .7) * .004 + hello);
        context.scale(1, 1 + Math.sin(t * 1.7) * .005); context.translate(0, -30);
        const seated = drawSeatedCat(context, color, eyeStyle, t > 0 && t % 5.8 < .14, concealed);
        if (!seated) drawMooncat(context, { color, eyeStyle, direction: "SOUTH", stridePhase: 0, strideAmount: 0, blink: false, concealed });
        if (accessory && !concealed) drawWornAccessory(context, accessory, "SOUTH", false, 0, 0, "SEATED");
      } else {
      drawMooncat(context, { color, eyeStyle, direction: "SE", stridePhase: phase, strideAmount: animate ? 1 : 0, blink: false, concealed, walkStyle: "FRAMES" });
      if (accessory && !concealed) drawWornAccessory(context, accessory, "SE");
      }
    }
    shapeDirty = false;
    if (animate || (pose !== "GAMEPLAY" && animated && !reduced.matches)) frame = requestAnimationFrame(paint);
    };
    const restart = () => {
      cancelAnimationFrame(frame); lastPaint = -Infinity;
      const latest = appearance.current;
      if (latest.greeting && !wasGreeting) greetingStart = performance.now();
      wasGreeting = latest.greeting;
      if (latest.pose !== lastPose || latest.concealment !== lastConcealment) shapeDirty = true;
      lastPose = latest.pose; lastConcealment = latest.concealment;
      const source = latest.pose === "GAMEPLAY" ? "GAMEPLAY" : "SEATED";
      if (requestedArt !== source) {
        requestedArt = source; artReady = false;
        void (source === "SEATED" ? loadSeatedCat() : loadMooncatSprites()).then(() => {
          if (active && requestedArt === source) { artReady = true; shapeDirty = true; }
        }).then(() => { if (active) restart(); });
      }
      paint();
    };
    requestPaint.current = restart;
    // Match the displayed portrait to device pixels. Tiny roster icons no longer
    // allocate hero-size surfaces; the hero no longer upscales a 336px bitmap.
    const resize = () => {
      const bounds = portrait.current?.getBoundingClientRect();
      const wasVisible = visible;
      layoutVisible = Boolean(bounds?.width);
      visible = layoutVisible && inView;
      const size = portraitPixelSize(bounds?.width ?? 0, window.devicePixelRatio);
      if (!size) { cancelAnimationFrame(frame); return; }
      let changed = false;
      for (const canvas of [portrait.current, silhouette.current]) if (canvas && canvas.width !== size) { canvas.width = size; canvas.height = size; changed = true; }
      if (changed) shapeDirty = true;
      if (changed || !wasVisible) restart();
    };
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(resize);
    if (portrait.current) observer?.observe(portrait.current);
    const intersection = typeof IntersectionObserver === "undefined" ? undefined : new IntersectionObserver(entries => {
      inView = entries.some(entry => entry.isIntersecting);
      visible = layoutVisible && inView;
      if (visible) restart(); else cancelAnimationFrame(frame);
    });
    if (portrait.current) intersection?.observe(portrait.current);
    resize();
    restart();
    document.addEventListener("visibilitychange", restart); reduced.addEventListener("change", restart);
    return () => { active = false; cancelAnimationFrame(frame); observer?.disconnect(); intersection?.disconnect(); if (requestPaint.current === restart) requestPaint.current = null; document.removeEventListener("visibilitychange", restart); reduced.removeEventListener("change", restart); };
  }, []);
  return <span className="slime-portrait mooncat-portrait" data-pose={pose} aria-hidden="true">
    {concealment ? <canvas ref={silhouette} className="cat-portrait-concealed" width={336} height={336} /> : null}
    <canvas ref={portrait} className="slime-detail" width={336} height={336} />
  </span>;
}

/** Retained for older art-review consumers; live portraits use the game renderer above. */
export function LegacySlimePortrait({ color, eyeStyle = "FIERCE" }: { color: string; eyeStyle?: EyeStyle }) {
  const id = useId();
  const palette = slimePalette(color);
  const { gel, volume, glow, rim, edge, bounce, bouncePath } = SLIME_MATERIAL;
  const eyes = eyePath(eyeStyle);
  return (
    <svg className="slime-portrait" viewBox="-48 -54 96 96" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-gel`} gradientUnits="userSpaceOnUse" x1={gel.x1} y1={gel.y1} x2={gel.x2} y2={gel.y2}>
          <stop stopColor={palette.rim} />
          <stop offset=".46" stopColor={palette.body} />
          <stop offset="1" stopColor={palette.edge} />
        </linearGradient>
        <radialGradient id={`${id}-volume`} gradientUnits="userSpaceOnUse" cx={volume.x1} cy={volume.y1} r={volume.r1} fx={volume.x0} fy={volume.y0} fr={volume.r0}>
          <stop stopColor={palette.deep} stopOpacity="0" />
          <stop offset=".6" stopColor={palette.deep} stopOpacity=".06" />
          <stop offset="1" stopColor={palette.deep} stopOpacity=".42" />
        </radialGradient>
        <radialGradient id={`${id}-glow`} gradientUnits="userSpaceOnUse" cx={glow.x1} cy={glow.y1} r={glow.r1} fx={glow.x0} fy={glow.y0} fr={glow.r0}>
          <stop stopColor={palette.glow} stopOpacity=".62" />
          <stop offset=".55" stopColor={palette.glow} stopOpacity=".2" />
          <stop offset="1" stopColor={palette.glow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-rim`} gradientUnits="userSpaceOnUse" x1={rim.x1} y1={rim.y1} x2={rim.x2} y2={rim.y2}>
          <stop stopColor={palette.shine} stopOpacity=".62" />
          <stop offset=".55" stopColor={palette.rim} stopOpacity=".14" />
          <stop offset="1" stopColor={palette.rim} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-edge`} gradientUnits="userSpaceOnUse" x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}>
          <stop stopColor={palette.rim} stopOpacity=".55" />
          <stop offset=".5" stopColor={palette.edge} stopOpacity=".5" />
          <stop offset="1" stopColor={palette.deep} stopOpacity=".8" />
        </linearGradient>
        <linearGradient id={`${id}-bounce`} gradientUnits="userSpaceOnUse" x1={bounce.x1} y1={bounce.y1} x2={bounce.x2} y2={bounce.y2}>
          <stop stopColor={palette.glow} stopOpacity="0" /><stop offset="1" stopColor={palette.glow} stopOpacity=".38" />
        </linearGradient>
        <radialGradient id={`${id}-sheen`}>
          <stop stopColor={palette.shine} stopOpacity=".5" /><stop offset="1" stopColor={palette.shine} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-glint`}>
          <stop stopColor="#fffffa" stopOpacity=".92" /><stop offset="1" stopColor="#fffffa" stopOpacity=".18" />
        </radialGradient>
        <radialGradient id={`${id}-cheek`}>
          <stop stopColor={palette.blush} stopOpacity=".34" /><stop offset="1" stopColor={palette.blush} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-leaf`} gradientUnits="userSpaceOnUse" x1="-42" y1="-28" x2="-22" y2="10">
          <stop stopColor={palette.leaf} /><stop offset="1" stopColor={palette.leafShade} />
        </linearGradient>
        <clipPath id={`${id}-body`}><path d={SLIME_PATH} /></clipPath>
        <pattern id={`${id}-grain`} width="12" height="12" patternUnits="userSpaceOnUse">
          <path d="M1 2h.4M8 4h.6M4 9h.4" stroke={palette.shine} strokeWidth=".5" opacity=".05" />
          <path d="M4 1h.5M10 9h.4M1 7h.6" stroke={palette.core} strokeWidth=".5" opacity=".03" />
        </pattern>
      </defs>
      {/* Far 4th hind leg tucked slightly behind the under-belly arch */}
      <path d="M-18 16Q-18 24 -13.5 24Q-9.5 24 -9.5 16Z" fill={palette.edge} stroke={palette.deep} strokeWidth="2" strokeLinejoin="round" />
      <path className="slime-gel" d={SLIME_PATH} fill={`url(#${id}-gel)`} stroke={`url(#${id}-edge)`} strokeWidth="2.5" strokeLinejoin="round" />
      <g className="slime-detail" clipPath={`url(#${id}-body)`}>
        <path d={SLIME_PATH} fill={`url(#${id}-volume)`} />
        <path d={SLIME_PATH} fill={`url(#${id}-glow)`} />
        <path className="slime-seed" d={SLIME_CORE_PATH} fill={palette.glow} opacity=".08" />
        <path d={SLIME_PATH} fill="none" stroke={`url(#${id}-rim)`} strokeWidth="2.4" />
        <path d={bouncePath} fill="none" stroke={palette.deep} strokeOpacity=".92" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d={SLIME_PATH} fill={`url(#${id}-grain)`} />
        {/* Starry specks on the upper rump + Runic Foreleg Bracer */}
        <circle cx="-24" cy="-4" r=".85" fill="#e4f8ff" opacity=".82" />
        <circle cx="-19" cy="-8" r=".65" fill="#e4f8ff" opacity=".82" />
        <circle cx="-27" cy="1" r=".7" fill="#e4f8ff" opacity=".82" />
        <path d="M-4.8 15.5Q-.2 17.2 4.2 15.2L3.6 20.4Q-.3 22.1 -4.2 20.2Z" fill="#2b8ec9" stroke={palette.deep} strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M-2.2 17.2L-2.0 19.6M-.1 17.5L0 19.9M2.0 17.1L1.8 19.5" stroke="#9ef8ff" strokeWidth="1.1" strokeLinecap="round" />
        <g transform={`translate(12.5 -10.5) scale(${SLIME_EYE_SCALE})`}>
          <g transform="translate(0 .8)"><path className="slime-portrait-eyes slime-eye-shade" d={eyes} fill={SLIME_EYE_SHADE} /></g>
          {/* Glowing Forehead Crescent Moon Emblem */}
          <circle cx="2.2" cy="-5.2" r="4.9" fill="#82e8ff" opacity=".32" />
          <path d="M4.2 -8.2A3.6 3.6 0 1 0 5.4 -3.2Q1.4 -4.5 4.2 -8.2Z" fill="#ebfbff" />
          {/* Cute triangular coral-pink cat nose & 'w' mouth */}
          <path d="M.2 10.6L3.6 10.6L1.9 12.6Z" fill="#f27493" stroke="#161124" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M-1.2 13.8Q.4 15.1 1.9 13.1Q3.4 15.1 5.0 13.8" fill="none" stroke="#161124" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path className="slime-portrait-eyes" data-eye-style={eyeStyle} d={eyes} fill="#f5b83d" stroke="#161124" strokeWidth="1.6" strokeLinejoin="round" />
          <ellipse cx="-8.6" cy="7.6" rx="1.7" ry="2.8" fill="#161124" />
          <ellipse cx="12.8" cy="7.4" rx="1.6" ry="2.6" fill="#161124" />
          <circle cx="-10.2" cy="5.2" r="1.2" fill="#f5ffef" />
          <circle cx="11.3" cy="5.2" r="1.1" fill="#f5ffef" />
        </g>
      </g>
      <g className="slime-detail slime-sprout" strokeLinecap="round" strokeLinejoin="round">
        {/* Celestial Moonwarden Scarf & Crescent Pendant */}
        <path d="M-9 -4Q-19 -14 -15 -18Q-8 -16 -5 -7Z" fill="#5262cf" stroke={palette.deep} strokeWidth="2" />
        <path d="M-8 1Q-20 -4 -18 -11Q-11 -11 -6 -3Q2 10 18 9Q19 13 12 14Q-2 14 -10 5Z" fill="#48b8e8" stroke={palette.deep} strokeWidth="2" />
        <path d="M-14 -7Q-7 6 14 11" fill="none" stroke="#a8f8ff" strokeWidth=".9" />
        <circle cx="10.5" cy="12.2" r="4" fill="#262347" stroke={palette.deep} strokeWidth="1.6" />
        <path d="M11.6 10.1A2.5 2.5 0 1 0 12.1 14.1Q9.5 12.2 11.6 10.1Z" fill="#a8faff" />
        <path d={SLIME_SPROUT.leafLeft} fill={`url(#${id}-leaf)`} />
        <path d={SLIME_SPROUT.leafRight} fill={palette.deep} fillOpacity=".52" />
        <path d={SLIME_SPROUT.stem} fill="none" stroke={palette.deep} strokeWidth="2.3" />
        <path d={SLIME_SPROUT.vein} fill="none" stroke={palette.leafVein} strokeWidth="1.0" opacity=".28" />
        <circle cx="-36" cy="-24" r=".9" fill="#e8f9ff" />
        <circle cx="-28" cy="-35" r=".8" fill="#e8f9ff" />
        <circle cx="-21" cy="-28" r=".75" fill="#e8f9ff" />
      </g>
    </svg>
  );
}
