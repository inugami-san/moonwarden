"use client";

import { useState } from "react";
import { ORDEALS } from "./home-field-guide";
import { GameGlyph } from "./gameplay-controls";

export type MenuScreen = "HOME" | "MULTI" | "SOLO" | "LOOK" | "GUIDE" | "ROOMS";
export const MENU_TITLES: Record<MenuScreen, string> = {
  HOME: "Trust the light.", MULTI: "Play with friends", SOLO: "Practice with AI",
  LOOK: "Your warden", GUIDE: "Field guide", ROOMS: "Find a circle",
};

export function GameMenu({ onNavigate }: { onNavigate: (screen: MenuScreen) => void }) {
  return <nav className="game-menu" aria-label="Main menu">
    <span className="menu-eyebrow">SILVERPINE SUMMIT · 4–8 PLAYERS</span>
    <h1>Trust the light.<br /><em>Not everyone.</em></h1>
    <p>Moonlit cats. Forest mysteries. One dangerous circle.</p>
    <button className="menu-play" onClick={() => onNavigate("MULTI")}><span className="menu-action-icon"><GameGlyph name="paw" /></span><span>Play with friends<small>Create or join a room</small></span><span aria-hidden="true">↗</span></button>
    <button onClick={() => onNavigate("SOLO")}><span aria-hidden="true">☽</span><span>Practice with AI<small>Learn the forest, try a role</small></span><span aria-hidden="true">→</span></button>
    <div className="menu-secondary"><button onClick={() => onNavigate("LOOK")}><GameGlyph name="collar" /> Customize</button><button onClick={() => onNavigate("GUIDE")}><span aria-hidden="true">▤</span> How to play</button></div>
    <small className="menu-beta-note">Free beta · Bring your friends. Question their alibis.</small>
  </nav>;
}

const LESSONS = [
  ["01", "Protect the sanctuary", "Hold E at a shrine, then solve its puzzle. Earn magical gear and restore the forest. Harmonize with a partner for faster—but louder—progress."],
  ["02", "Survive the Ordeal", "Stay close to light, remember who passed you, and use your items. The Hollow can hunt once each Ordeal; danger hides beyond your sight."],
  ["03", "Question the circle", "Report a fallen cat or call a meeting after the first Ordeal. Discuss, compare stories, then vote. Wardens win by restoring the wards or banishing every Hollow."],
] as const;

export function CompactFieldGuide() {
  const [page, setPage] = useState(0);
  const count = LESSONS.length + ORDEALS.length;
  const lesson = page < LESSONS.length ? LESSONS[page] : null;
  const ordeal = lesson ? null : ORDEALS[page - LESSONS.length];
  return <section className="compact-guide" aria-label="How to play">
    <article aria-live="polite" aria-atomic="true">
      <span className="guide-rune" aria-hidden="true">{lesson?.[0] ?? ordeal?.icon}</span>
      <small>{lesson ? "THE BASICS" : "KNOW YOUR ORDEALS"}</small>
      <h2>{lesson?.[1] ?? ordeal?.name}</h2>
      <p>{lesson?.[2] ?? ordeal?.text}</p>
      {ordeal ? <p className="guide-tip">Tip: {ordeal.tip}</p> : null}
    </article>
    <nav className="menu-pagination" aria-label="Guide pages"><button onClick={() => setPage(page - 1)} disabled={page === 0} aria-label="Previous guide page">←</button><span>{page + 1} / {count}</span><button onClick={() => setPage(page + 1)} disabled={page === count - 1} aria-label="Next guide page">→</button></nav>
  </section>;
}

export function pageWindow(total: number, requested: number, size = 3) {
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.max(0, Math.min(requested, pages - 1));
  return { page, pages, start: page * size, end: (page + 1) * size };
}
