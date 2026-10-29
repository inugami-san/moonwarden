"use client";

import { useEffect, useRef, useState } from "react";
import { VICTORY_SECONDS, VICTORY_SOUND_AT, type MatchVictory } from "./match-victory";
import { SlimePortrait } from "./cat-portrait";
import { ForestCinematicBackdrop } from "./role-reveal";
import "./role-reveal.css";
import "./victory.css";

/** One mounted instance per final result. Animation clocks never rerender React. */
export function VictoryOverlay({ victory, reducedMotion = false, onCelebrate, onExit }: {
  victory: MatchVictory;
  reducedMotion?: boolean;
  onCelebrate?: (kind: "WARDEN" | "HOLLOW") => void;
  onExit: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const [finished, setFinished] = useState(false);
  const callbacks = useRef({ onCelebrate });
  const settled = finished || reducedMotion || victory.kind === "NEUTRAL";

  useEffect(() => { callbacks.current = { onCelebrate }; }, [onCelebrate]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    actionRef.current?.focus();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  useEffect(() => {
    if (settled) return;
    const timer = window.setTimeout(() => setFinished(true), VICTORY_SECONDS[victory.kind] * 1000);
    const soundTimer = window.setTimeout(() => {
      if (victory.kind !== "NEUTRAL") callbacks.current.onCelebrate?.(victory.kind);
    }, VICTORY_SOUND_AT * 1000);
    return () => { window.clearTimeout(timer); window.clearTimeout(soundTimer); };
  }, [settled, victory.kind]);

  return (
    <dialog ref={dialogRef} className={`victory-overlay victory-${victory.kind.toLowerCase()} ${settled ? "is-settled" : "is-playing"} ${reducedMotion ? "is-reduced-motion" : ""}`}
      role="dialog" aria-modal="true" aria-labelledby="victory-title" aria-describedby="victory-detail"
      onCancel={event => { event.preventDefault(); setFinished(true); }}
      onKeyDownCapture={event => {
        event.stopPropagation();
        if (event.code === "Escape" && !settled) { event.preventDefault(); setFinished(true); }
      }}>
      <ForestCinematicBackdrop tone={victory.kind} />
      <div className="victory-grove" aria-hidden="true">
        <span className="victory-ground" />
        {/* Decorative companions, not an inferred roster of other players' teams. */}
        {victory.kind === "WARDEN" ? <><span className="victory-companion companion-left"><SlimePortrait color="#c4a9be" eyeStyle="JOYFUL" accessory="leafband" pose="SEATED" animated={!reducedMotion} /></span><span className="victory-companion companion-right"><SlimePortrait color="#b6cba6" eyeStyle="JOYFUL" accessory="mothbow" pose="SEATED" animated={!reducedMotion} /></span></> : null}
        <div className="victory-hero"><SlimePortrait color={victory.hero.color} eyeStyle={victory.hero.eyeStyle} accessory={victory.hero.hat} pose="SEATED" animated={!reducedMotion} /></div>
        <div className="victory-blooms">{[0, 1, 2, 3, 4, 5, 6].map(index => <i key={index} />)}</div>
        <div className="victory-brambles"><i /><i /><i /><i /></div>
      </div>
      <header className="victory-heading">
        <span>{victory.team}</span>
        <h2 id="victory-title">{victory.headline}</h2>
        <p id="victory-detail">{victory.detail}</p>
      </header>
      <footer className="victory-footer">
        <p className={victory.won ? "victory-personal is-win" : "victory-personal"}>{victory.personal}</p>
        <button ref={actionRef} type="button" onClick={() => settled ? onExit() : setFinished(true)}>
          {settled ? "Return to lobby" : "Skip to results"}<span aria-hidden="true">↗</span>
        </button>
        <small>{settled ? "Return to the lobby for another story." : "The moon remembers this night."}</small>
      </footer>
      <p className="sr-only" role="status">{victory.team}. {victory.personal}</p>
    </dialog>
  );
}
