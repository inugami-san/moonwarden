"use client";

import { useId } from "react";
import { SLIME_EYE_SCALE, SLIME_PATH, slimePalette } from "./slime-art";
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
        <radialGradient id={`${id}-core`} cx="57%" cy="80%" r="55%">
          <stop stopColor={palette.core} stopOpacity=".56" /><stop offset="1" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-light`} cx="28%" cy="35%" r="55%">
          <stop stopColor={palette.rim} stopOpacity=".32" /><stop offset="1" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-shine`}>
          <stop stopColor={palette.shine} stopOpacity=".7" /><stop offset="1" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-body`}><path d={SLIME_PATH} /></clipPath>
      </defs>
      <g className="slime-detail slime-sprout">
        <path d="M4-32C14-48 29-44 35-36" fill="none" stroke={palette.edge} strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="36" cy="-34" rx="4.5" ry="2.5" transform="rotate(34 36 -34)" fill={palette.core} />
      </g>
      <path className="slime-gel" d={SLIME_PATH} fill={`url(#${id}-gel)`} stroke={palette.edge} strokeWidth=".8" />
      <g className="slime-detail" clipPath={`url(#${id}-body)`}>
        <path d={SLIME_PATH} fill={`url(#${id}-core)`} />
        <path d={SLIME_PATH} fill={`url(#${id}-light)`} />
        <ellipse cx="-12" cy="-24" rx="18" ry="5.4" transform="rotate(-25 -12 -24)" fill={`url(#${id}-shine)`} />
        <path d="M-28 3C-26-11-18-25-7-29" fill="none" stroke={palette.shine} strokeWidth="1.2" opacity=".52" strokeLinecap="round" />
        <path d="M-28 27Q0 33 29 26" fill="none" stroke={palette.rim} strokeWidth="1.5" opacity=".36" />
        <g transform={`translate(0 1.5) scale(${SLIME_EYE_SCALE})`}>
          <path className="slime-portrait-eyes" data-eye-style={eyeStyle} d={eyePath(eyeStyle)} fill="#f5ffef" />
        </g>
      </g>
    </svg>
  );
}
