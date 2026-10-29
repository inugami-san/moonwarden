"use client";

import { useEffect, useRef } from "react";
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
export function RoleReveal({ role, color, accessory, eyeStyle, onContinue }: { role: Role; color: string; accessory?: Hat; eyeStyle?: EyeStyle; onContinue: () => void }) {
  const action = useRef<HTMLButtonElement>(null);
  const copy = roleRevealPresentation(role);
  const hollow = role === "IMPOSTOR";
  useEffect(() => {
    const previous = document.activeElement;
    action.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);

  return <div className={`role-reveal-forest ${hollow ? "role-reveal-hollow" : "role-reveal-warden"}`} role="dialog" aria-modal="true" aria-labelledby="role-reveal-title" aria-describedby="role-reveal-objective"
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); onContinue(); }
      // This short reveal has a single action: keep focus inside its modal surface.
      if (event.key === "Tab") { event.preventDefault(); action.current?.focus(); }
    }}>
    <ForestCinematicBackdrop tone={hollow ? "HOLLOW" : "WARDEN"} />
    <div className="role-reveal-portrait" aria-hidden="true"><span className="role-reveal-ground" /><SlimePortrait color={color} eyeStyle={eyeStyle ?? (hollow ? "FIERCE" : "JOYFUL")} accessory={accessory} pose="SEATED" /><span className="role-reveal-fern fern-left" /><span className="role-reveal-fern fern-right" /></div>
    <div className="role-reveal-story"><small>{copy.lead}</small><p className="role-reveal-you">YOU ARE{hollow ? "" : " A"}</p><h2 id="role-reveal-title">{copy.label}</h2><p id="role-reveal-objective">{copy.objective}</p><span className="role-reveal-promise">{copy.promise}</span><button ref={action} type="button" onClick={onContinue}>Enter the sanctuary <span aria-hidden="true">→</span></button></div>
    <span className="role-reveal-private">Only you can see this role.</span>
  </div>;
}
