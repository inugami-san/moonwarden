"use client";

import { useEffect, useRef, useState } from "react";
import type { Hat, Role } from "../server/game-types";
import type { EyeStyle } from "../server/appearance";
import { SlimePortrait } from "./cat-portrait";

export function roleRevealPresentation(role: Role) {
  return role === "IMPOSTOR"
    ? { label: "The Hollow", lead: "A secret beneath the moonlight", objective: "Blend in at shrines. Hunt once per Ordeal until your side matches or outnumbers the Wardens.", promise: "Let the forest hide your next move." }
    : { label: "Warden", lead: "A little light the forest needs", objective: "Restore the forest to 100%, or work with the circle to vote out every Hollow.", promise: "Protect the light. Choose your company carefully." };
}

/** Shared scenery contains no roster, role inference, timers or match state. */
export function ForestCinematicBackdrop({ tone = "NEUTRAL" }: { tone?: "WARDEN" | "HOLLOW" | "NEUTRAL" }) {
  return <div className="forest-cinematic-backdrop" data-tone={tone} aria-hidden="true">
    <span className="forest-cinematic-moon" /><span className="forest-cinematic-mist" />
    <svg className="forest-cinematic-branches" viewBox="0 0 1200 700" preserveAspectRatio="none" focusable="false"><g fill="none" stroke="currentColor" strokeLinecap="round"><path d="M-30 590C60 470 55 360 155 250M37 481l-9-105m28 56 94-42m-46-66 2-91m109-111 30-61M1230 585c-87-92-60-225-170-320m112 227 39-101m-71 48-87-30m36-87-6-95" strokeWidth="12" /><path d="M-20 680c126-50 190-41 293-18m947 18c-136-42-193-47-300-15" strokeWidth="20" /></g><g fill="currentColor"><ellipse cx="100" cy="356" rx="14" ry="34" transform="rotate(42 100 356)" /><ellipse cx="146" cy="283" rx="12" ry="30" transform="rotate(35 146 283)" /><ellipse cx="1108" cy="365" rx="13" ry="32" transform="rotate(-40 1108 365)" /><ellipse cx="1064" cy="288" rx="12" ry="29" transform="rotate(-34 1064 288)" /></g></svg>
    <div className="forest-cinematic-leaves">{[0, 1, 2, 3, 4, 5].map(index => <i key={index} />)}</div>
  </div>;
}

/** Presentation only; the parent retains the existing reveal clock and role assignment. */
export function RoleReveal({ role, color, accessory, eyeStyle, reducedMotion = false, onAwaken, onContinue }: { role: Role; color: string; accessory?: Hat; eyeStyle?: EyeStyle; reducedMotion?: boolean; onAwaken?: (kind: "WARDEN" | "HOLLOW") => void; onContinue: () => void }) {
  const action = useRef<HTMLButtonElement>(null);
  const catAction = useRef<HTMLButtonElement>(null);
  const catMotion = useRef<HTMLSpanElement>(null);
  const responseMotion = useRef<Animation | null>(null);
  const [response, setResponse] = useState(0);
  const copy = roleRevealPresentation(role);
  const hollow = role === "IMPOSTOR";
  useEffect(() => {
    const previous = document.activeElement;
    action.current?.focus();
    return () => { responseMotion.current?.cancel(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const settle = () => { if (reducedMotion || preference.matches) responseMotion.current?.cancel(); };
    settle(); preference.addEventListener("change", settle);
    return () => preference.removeEventListener("change", settle);
  }, [reducedMotion]);
  const awaken = () => {
    const still = reducedMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!still) {
      setResponse(value => value + 1);
      responseMotion.current?.cancel();
      responseMotion.current = catMotion.current?.animate([
        { transform: "translateY(0) scale(1)" },
        { transform: hollow ? "translateY(3px) scale(1.05, .96)" : "translateY(4px) scale(1.04, .96)", offset: .2 },
        { transform: hollow ? "translateY(-5px) scale(1.08)" : "translateY(-14px) scale(.98, 1.03)", offset: .48 },
        { transform: "translateY(0) scale(1)" },
      ], { duration: hollow ? 620 : 740, easing: "cubic-bezier(.2,.7,.3,1)" }) ?? null;
    }
    onAwaken?.(hollow ? "HOLLOW" : "WARDEN");
  };

  return <div className={`role-reveal-forest ${hollow ? "role-reveal-hollow" : "role-reveal-warden"}${reducedMotion ? " is-reduced-motion" : ""}`} role="dialog" aria-modal="true" aria-labelledby="role-reveal-title" aria-describedby="role-reveal-objective"
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); onContinue(); }
      if (event.key === "Tab") {
        event.preventDefault();
        const controls = [catAction.current, action.current].filter((button): button is HTMLButtonElement => !!button);
        const index = controls.findIndex(button => button === document.activeElement);
        controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
      }
    }}>
    <ForestCinematicBackdrop tone={hollow ? "HOLLOW" : "WARDEN"} />
    <div className="role-reveal-theatre" aria-hidden="true"><span className="role-veil role-veil-left" /><span className="role-veil role-veil-right" /><span className="role-arrival-light" /><div className="role-reveal-motes">{[0, 1, 2, 3, 4, 5, 6, 7].map(index => <i key={index} />)}</div></div>
    <div className="role-reveal-portrait">
      <span className="role-reveal-aura" aria-hidden="true" />
      <svg className="role-reveal-crest" viewBox="0 0 300 300" fill="none" aria-hidden="true" focusable="false"><path className="role-crest-moon" d="M197 52a106 106 0 1 0 47 157A100 100 0 0 1 197 52Z" /><g className="role-crest-boughs"><path d="M46 246c10-38-28-59-14-98m3 47-19-16m23 36 16-19M254 246c-10-38 28-59 14-98m-3 47 19-16m-23 36-16-19" /><path d="M29 171c-20-2-19-18-16-26 14 6 18 14 16 26Zm20 39c21-3 22-17 20-25-15 5-21 14-20 25Zm222-39c20-2 19-18 16-26-14 6-18 14-16 26Zm-20 39c-21-3-22-17-20-25 15 5 21 14 20 25Z" /></g></svg>
      <span className="role-reveal-ground" aria-hidden="true" />
      <button ref={catAction} type="button" className="role-reveal-cat" onClick={awaken} aria-label={hollow ? "Stir the Hollow’s shadow" : "Awaken your Warden’s moonlight"}>
        <span ref={catMotion} className="role-cat-response"><SlimePortrait color={color} eyeStyle={eyeStyle ?? (hollow ? "FIERCE" : "JOYFUL")} accessory={accessory} pose="SEATED" animated={!reducedMotion} concealment={false} /></span>
        <span key={response} className={`role-touch-wave${response ? " is-response" : ""}`} aria-hidden="true" />
      </button>
      <span className="role-reveal-fern fern-left" aria-hidden="true" /><span className="role-reveal-fern fern-right" aria-hidden="true" />
      <small className="role-touch-hint">{hollow ? "Tap to stir the shadows" : "Tap to awaken your light"}</small>
    </div>
    <div className="role-reveal-story"><small>{copy.lead}</small><p className="role-reveal-you">YOU ARE{hollow ? "" : " A"}</p><h2 id="role-reveal-title">{copy.label}</h2><p id="role-reveal-objective">{copy.objective}</p><span className="role-reveal-promise">{copy.promise}</span><button ref={action} type="button" onClick={onContinue}>Enter the sanctuary <span aria-hidden="true">→</span></button></div>
    <span className="role-reveal-private">Only you can see this role.</span>
  </div>;
}
