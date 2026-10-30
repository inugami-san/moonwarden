"use client";

import type { ReactNode } from "react";
import type { Hazard, ItemKind, Phase, Role } from "../server/game-types";
import { ORDEAL_PREPARATION } from "./warden-objectives";

export const GEAR_ORDER: readonly ItemKind[] = ["FLASHLIGHT", "FLARE", "SONAR"];
export const GEAR_LABELS: Readonly<Record<ItemKind, string>> = {
  FLASHLIGHT: "Glowing Mushroom",
  FLARE: "Moonblossom",
  SONAR: "Echo Bell",
};
const GEAR_SHORT_LABELS: Readonly<Record<ItemKind, string>> = { FLASHLIGHT: "Light", FLARE: "Bloom", SONAR: "Echo" };
export const GEAR_DESCRIPTIONS: Readonly<Record<ItemKind, string>> = {
  FLASHLIGHT: "Aim its moonlit spores to light the path for seven seconds.",
  FLARE: "Plant a shared circle of soft light for five seconds.",
  SONAR: "Ring for six seconds of movement echoes and phantom detection.",
};

const PHASE_NAMES: Readonly<Record<Phase, string>> = { CALM: "Calm", COUNTDOWN: "Get ready", ORDEAL: "Ordeal", DISCUSSION: "Discussion" };
const HAZARD_NAMES: Readonly<Record<Hazard, string>> = {
  BLACKOUT: "Blackout", FOG: "Sea Fog", MOONGLARE: "Moon Glare", ROOTWAKE: "Rootwake", PHANTOMS: "Phantom Procession", MIRROR_POOL: "Mirror Pool",
};
const HAZARD_SURVIVAL: Readonly<Record<Hazard, string>> = {
  BLACKOUT: "Keep moving carefully when the forest goes dark.",
  FOG: "Stay close enough to recognize what you actually see.",
  MOONGLARE: "Watch movement; moonlight can bleach identities.",
  ROOTWAKE: "Keep watch inside your chamber while roots divide the forest.",
  PHANTOMS: "False shapes walk among the circle. An echo is not an identity.",
  MIRROR_POOL: "Bumps can swap colors. A familiar color is not proof.",
};

type GearCharges = Readonly<Record<ItemKind, number>>;
export type GuidanceInput = {
  role: Role;
  phase: Phase;
  hazard: Hazard;
  alive: boolean;
  charges: GearCharges;
  selectedItem: ItemKind;
  destinationLabel?: string | null;
  allRitesComplete?: boolean;
  strikeSpent?: boolean;
};
export type PlayerGuidance = { title: string; detail: string; item: ItemKind | null };

/** Presentation only: no roster, enemy positions, timers, or inferred evidence. */
export function playerGuidance({ role, phase, hazard, alive, charges, selectedItem, destinationLabel, allRitesComplete = false, strikeSpent = false }: GuidanceInput): PlayerGuidance {
  if (!alive) return { title: "Watch over the circle", detail: "You are spectating. The living circle carries on.", item: null };
  if (phase === "DISCUSSION") return {
    title: role === "IMPOSTOR" ? "Blend into the discussion" : "Compare what you actually saw",
    detail: role === "IMPOSTOR" ? "Listen to the circle before the vote." : "Share observations, not guesses about colors or echoes.", item: null,
  };
  if (role === "IMPOSTOR" && phase === "CALM") return {
    title: allRitesComplete ? "Blend in with the circle" : "Blend in with a shrine ritual",
    detail: allRitesComplete ? "Your shrines reopen next Calm. Keep your secret." : "A completed fake ritual earns gear and can slow forest restoration.", item: null,
  };
  if (role === "IMPOSTOR" && phase === "ORDEAL") return {
    title: strikeSpent ? "Stay hidden until Calm" : "Find a moment to hunt",
    detail: strikeSpent ? "Your strike is spent for this Ordeal. Avoid suspicion." : "One strike this Ordeal. Sight and Echo share your special action.", item: null,
  };
  if (phase === "CALM") return {
    title: allRitesComplete ? "Keep watch with the circle" : destinationLabel ? `Restore ${destinationLabel}` : "Restore a shrine to earn gear",
    detail: allRitesComplete ? "Your shrines reopen next Calm. Your earned gear stays." : "Complete a ritual to earn gear and restore the forest.", item: null,
  };

  const preferred = ORDEAL_PREPARATION[hazard].item;
  // Offer a hazard-specific item first, then a useful light/echo already earned.
  const item = charges[preferred] > 0 ? preferred : charges[selectedItem] > 0 ? selectedItem : GEAR_ORDER.find(kind => charges[kind] > 0) ?? null;
  if (phase === "COUNTDOWN") return {
    title: item ? `${selectedItem === item ? "Keep" : "Equip"} ${GEAR_LABELS[item]} ready` : "Choose a safe place for the Ordeal",
    detail: item ? `${HAZARD_NAMES[hazard]} is next. ${GEAR_DESCRIPTIONS[item]}` : `${HAZARD_NAMES[hazard]} is next. ${HAZARD_SURVIVAL[hazard]}`,
    item,
  };
  return {
    title: item ? `${selectedItem === item ? "Use" : "Equip"} ${GEAR_LABELS[item]} to stay aware` : "Survive this Ordeal",
    detail: item ? GEAR_DESCRIPTIONS[item] : HAZARD_SURVIVAL[hazard], item,
  };
}

export function roleWinSummary(role: Role): string {
  return role === "IMPOSTOR"
    ? "Win when surviving Hollows match or outnumber the Wardens after a cat falls. Siphoning slows restoration; it is not a separate win."
    : "Win together by restoring the forest to 100%, or by voting out every Hollow.";
}

export function earnedGear(charges: GearCharges): { item: ItemKind; shortcut: number; charges: number }[] {
  return GEAR_ORDER.flatMap((item, index) => charges[item] > 0 ? [{ item, shortcut: index + 1, charges: charges[item] }] : []);
}

export function ObjectiveStrip(props: GuidanceInput & { progress: number; allies?: string }) {
  const guidance = playerGuidance(props);
  const progress = Math.max(0, Math.min(100, Number.isFinite(props.progress) ? Math.floor(props.progress) : 0));
  return <details className="objective-strip" data-no-joystick aria-label="Your objective">
    <summary className="objective-pill" aria-label={`Forest ${progress}% restored. Open your goal and help.`}>
      <span>Forest</span><progress value={progress} max={100} aria-label="Forest restoration" /><b>{progress}%</b><span className="objective-chevron" aria-hidden="true">⌄</span>
    </summary>
    <div className="objective-goal-panel">
      <small>{props.alive ? props.role === "IMPOSTOR" ? "Hollow · your secret role" : "Warden" : "Spectator"} · {PHASE_NAMES[props.phase]}</small>
      <strong>{guidance.title}</strong><p>{guidance.detail}</p><p className="objective-win-goal">{roleWinSummary(props.role)}</p>
      {props.role === "IMPOSTOR" && props.allies ? <p className="objective-allies">Your fellow Hollows: {props.allies}</p> : null}
    </div>
  </details>;
}

export type EarnedGearDockProps = {
  charges: GearCharges;
  selectedItem: ItemKind;
  onSelect: (item: ItemKind) => void;
  renderIcon: (item: ItemKind) => ReactNode;
  disabled?: boolean;
  showSelectedDescription?: boolean;
};

export function EarnedGearDock({ charges, selectedItem, onSelect, renderIcon, disabled = false }: EarnedGearDockProps) {
  const available = earnedGear(charges);
  if (!available.length) return null;
  return <section className="earned-gear-dock" data-no-joystick aria-label="Your earned gear">
    <div className="earned-gear-choices" role="group" aria-label="Available gear">{available.map(({ item, shortcut, charges: count }) => <button type="button" key={item} className={selectedItem === item ? "is-selected" : undefined} onClick={() => onSelect(item)} disabled={disabled} aria-pressed={selectedItem === item} aria-keyshortcuts={String(shortcut)} aria-label={`Equip ${GEAR_LABELS[item]}, ${count} ${count === 1 ? "charge" : "charges"}, key ${shortcut}`} title={`${GEAR_LABELS[item]} · Key ${shortcut}. ${GEAR_DESCRIPTIONS[item]}`}>
      <span className="earned-gear-icon" aria-hidden="true">{renderIcon(item)}</span><span className="earned-gear-label">{GEAR_SHORT_LABELS[item]}</span><span className="earned-gear-count"><kbd>{shortcut}</kbd><b>×{count}</b></span>
    </button>)}</div>
    <details className="gear-catalog">
      <summary aria-label="Gear information and all items">Info</summary>
      <div className="gear-catalog-panel">{GEAR_ORDER.map((item, index) => <button type="button" key={item} disabled={disabled || charges[item] <= 0} onClick={() => onSelect(item)} aria-pressed={selectedItem === item} title={GEAR_DESCRIPTIONS[item]} aria-label={`${GEAR_LABELS[item]}: ${charges[item] > 0 ? `equip, ${charges[item]} charges` : "earn at shrines"}. ${GEAR_DESCRIPTIONS[item]}`}>
        <span className="gear-catalog-icon" aria-hidden="true">{renderIcon(item)}</span><span><b><kbd>{index + 1}</kbd> {GEAR_LABELS[item]}</b><small>{GEAR_DESCRIPTIONS[item]}</small></span><em>{charges[item] > 0 ? `×${charges[item]}` : "At shrines"}</em>
      </button>)}</div>
    </details>
  </section>;
}

export function RewardHandoff({ item, icon, description = GEAR_DESCRIPTIONS[item] }: { item: ItemKind; station: string; role: Role; icon: ReactNode; description?: string }) {
  return <aside className="reward-handoff" role="status" aria-live="polite" aria-atomic="true" aria-label={`${GEAR_LABELS[item]}: one charge earned`} title={description}>
    <span className="reward-handoff-icon" aria-hidden="true">{icon}</span><strong>{GEAR_LABELS[item]}</strong><b>+1</b>
  </aside>;
}
