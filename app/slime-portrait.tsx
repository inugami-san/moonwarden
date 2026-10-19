"use client";

import { useId } from "react";
import { SLIME_CORE_PATH, SLIME_PATH, slimePalette } from "./slime-art";
import { type EyeStyle } from "../server/appearance";
import { eyePath } from "./slime-eyes";

/** Vector counterpart of the cached game sprite, crisp at every avatar size. */
export function SlimePortrait({ color, eyeStyle = "FIERCE" }: { color: string; eyeStyle?: EyeStyle }) {
  const id = useId();
  const palette = slimePalette(color);
  return (
    <svg className="slime-portrait" viewBox="-48 -54 96 96" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-gel`} x1="0%" y1="0%" x2="70%" y2="100%">
          <stop stopColor={palette.rim} />
          <stop offset=".46" stopColor={palette.body} />
          <stop offset="1" stopColor={palette.edge} />
        </linearGradient>
        <clipPath id={`${id}-body`}><path d={SLIME_PATH} /></clipPath>
      </defs>
      <g className="slime-detail slime-sprout">
        <path d="M4-32C14-48 29-44 35-36" fill="none" stroke={palette.edge} strokeWidth="3.2" strokeLinecap="round" />
        <ellipse cx="36" cy="-34" rx="4.5" ry="2.5" transform="rotate(34 36 -34)" fill={palette.core} />
      </g>
      <path className="slime-gel" d={SLIME_PATH} fill={`url(#${id}-gel)`} stroke={palette.edge} strokeWidth="1.4" />
      <g className="slime-detail" clipPath={`url(#${id}-body)`}>
        <path d={SLIME_CORE_PATH} fill={palette.core} opacity=".55" />
        <path d={SLIME_PATH} fill="none" stroke={palette.rim} strokeWidth="7" opacity=".85" />
        <g fill={palette.shine} opacity=".88">
          <ellipse cx="-10" cy="-22" rx="12" ry="6.5" transform="rotate(-29 -10 -22)" />
          <circle cx="-24" cy="-8" r="3.6" /><circle cx="13" cy="-18" r="2.4" />
          <circle cx="18" cy="-21" r="1.1" /><circle cx="24" cy="-14" r="3.4" />
        </g>
        <path className="slime-portrait-eyes" data-eye-style={eyeStyle} d={eyePath(eyeStyle)} fill="#f5ffef" />
      </g>
    </svg>
  );
}
