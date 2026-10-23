"use client";

import { useId } from "react";
import { SLIME_CORE_PATH, SLIME_EYE_SCALE, SLIME_EYE_SHADE, SLIME_LIGHT, SLIME_MATERIAL, SLIME_PATH, SLIME_SPROUT, slimePalette } from "./slime-art";
import { type EyeStyle } from "../server/appearance";
import { eyePath } from "./slime-eyes";

/** Vector counterpart of the cached game sprite, crisp at every avatar size. */
export function SlimePortrait({ color, eyeStyle = "FIERCE" }: { color: string; eyeStyle?: EyeStyle }) {
  const id = useId();
  const palette = slimePalette(color);
  const { sheen, glint, spark, cheek } = SLIME_LIGHT;
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
        <linearGradient id={`${id}-leaf`} gradientUnits="userSpaceOnUse" x1="-6" y1="-47" x2="18" y2="-40">
          <stop stopColor={palette.leaf} /><stop offset="1" stopColor={palette.leafShade} />
        </linearGradient>
        <clipPath id={`${id}-body`}><path d={SLIME_PATH} /></clipPath>
        <pattern id={`${id}-grain`} width="12" height="12" patternUnits="userSpaceOnUse">
          <path d="M1 2h.4M8 4h.6M4 9h.4" stroke={palette.shine} strokeWidth=".5" opacity=".05" />
          <path d="M4 1h.5M10 9h.4M1 7h.6" stroke={palette.core} strokeWidth=".5" opacity=".03" />
        </pattern>
      </defs>
      <path className="slime-gel" d={SLIME_PATH} fill={`url(#${id}-gel)`} stroke={`url(#${id}-edge)`} strokeWidth=".9" />
      <g className="slime-detail" clipPath={`url(#${id}-body)`}>
        <path d={SLIME_PATH} fill={`url(#${id}-volume)`} />
        <path d={SLIME_PATH} fill={`url(#${id}-glow)`} />
        <path className="slime-seed" d={SLIME_CORE_PATH} fill={palette.glow} opacity=".24" />
        <path d={SLIME_PATH} fill="none" stroke={`url(#${id}-rim)`} strokeWidth="6" />
        <path d={bouncePath} fill="none" stroke={`url(#${id}-bounce)`} strokeWidth="1.6" strokeLinecap="round" />
        {[-1, 1].map((side) => (
          <ellipse key={side} cx={side * cheek.x} cy={cheek.y} rx={cheek.rx} ry={cheek.ry} fill={`url(#${id}-cheek)`} />
        ))}
        <ellipse cx={sheen.x} cy={sheen.y} rx={sheen.rx} ry={sheen.ry} transform={`rotate(${sheen.angle} ${sheen.x} ${sheen.y})`} fill={`url(#${id}-sheen)`} />
        <ellipse cx={glint.x} cy={glint.y} rx={glint.rx} ry={glint.ry} transform={`rotate(${glint.angle} ${glint.x} ${glint.y})`} fill={`url(#${id}-glint)`} />
        <circle cx={spark.x} cy={spark.y} r={spark.r} fill="#fffffa" fillOpacity=".78" />
        <path d={SLIME_PATH} fill={`url(#${id}-grain)`} />
        <g transform={`translate(0 1.5) scale(${SLIME_EYE_SCALE})`}>
          <g transform="translate(0 1.1)"><path className="slime-portrait-eyes slime-eye-shade" d={eyes} fill={SLIME_EYE_SHADE} /></g>
          <path className="slime-portrait-eyes" data-eye-style={eyeStyle} d={eyes} fill="#f5ffef" />
        </g>
      </g>
      <g className="slime-detail slime-sprout" strokeLinecap="round" strokeLinejoin="round">
        <path d={SLIME_SPROUT.stem} fill="none" stroke={palette.leafShade} strokeWidth="1.7" />
        <path d={SLIME_SPROUT.leafLeft} fill={`url(#${id}-leaf)`} />
        <path d={SLIME_SPROUT.leafRight} fill={`url(#${id}-leaf)`} />
        <path d={SLIME_SPROUT.vein} fill="none" stroke={palette.leafVein} strokeWidth=".6" opacity=".55" />
      </g>
    </svg>
  );
}
