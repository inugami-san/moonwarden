"use client";

import { useEffect, useRef, useState } from "react";
import { banishmentDuration, banishmentRevealAt, displayName, type BanishmentOutcome } from "./banishment";
import { SlimePortrait } from "./cat-portrait";
import { ForestCinematicBackdrop } from "./role-reveal";
import "./role-reveal.css";
import "./banishment.css";

type BanishmentProps = {
  outcome: BanishmentOutcome;
  reducedMotion?: boolean;
  onPlayAudio?: (kind: "OPENING" | "WARDEN" | "HOLLOW") => void;
  onComplete: () => void;
};

export function BanishmentOverlay(props: BanishmentProps) {
  return <BanishmentPresentation key={props.outcome.key} {...props} />;
}

/** The concluded server verdict and existing timeline are the only role-reveal authority. */
function BanishmentPresentation({ outcome, reducedMotion = false, onPlayAudio, onComplete }: BanishmentProps) {
  const [revealed, setRevealed] = useState(false);
  const [settling, setSettling] = useState(false);
  const completeRef = useRef(onComplete);
  const playAudioRef = useRef(onPlayAudio);
  const finishedRef = useRef(false);
  const actionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { completeRef.current = onComplete; playAudioRef.current = onPlayAudio; });
  useEffect(() => {
    const previous = document.activeElement;
    actionRef.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    completeRef.current();
  };

  useEffect(() => {
    const revealTime = banishmentRevealAt(outcome.kind, reducedMotion);
    const totalDuration = banishmentDuration(outcome.kind, reducedMotion);
    const opening = window.setTimeout(() => { if (!finishedRef.current) playAudioRef.current?.("OPENING"); }, 220);
    const reveal = window.setTimeout(() => {
      if (finishedRef.current) return;
      setRevealed(true);
      if (outcome.kind === "WARDEN" || outcome.kind === "HOLLOW") playAudioRef.current?.(outcome.kind);
    }, revealTime * 1000);
    const settle = window.setTimeout(() => { if (!finishedRef.current) setSettling(true); }, (totalDuration - .42) * 1000);
    const complete = window.setTimeout(() => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      completeRef.current();
    }, totalDuration * 1000);
    return () => { window.clearTimeout(opening); window.clearTimeout(reveal); window.clearTimeout(settle); window.clearTimeout(complete); };
  }, [outcome.kind, reducedMotion]);

  // Before the authoritative reveal, scenery and motion remain role-neutral.
  const sceneKind = revealed ? outcome.kind.toLowerCase() : "opening";
  const tone = revealed && (outcome.kind === "WARDEN" || outcome.kind === "HOLLOW") ? outcome.kind : "NEUTRAL";
  return <div className={`banishment-overlay banishment-${sceneKind} ${settling ? "is-settling" : ""} ${reducedMotion ? "reduced-motion" : ""}`} role="dialog" aria-modal="true" aria-label="The Moon's Judgment"
    onKeyDown={event => {
      event.stopPropagation();
      if (["Space", "Enter", "Escape"].includes(event.code)) { event.preventDefault(); finish(); }
      if (event.key === "Tab") { event.preventDefault(); actionRef.current?.focus(); }
    }}>
    <ForestCinematicBackdrop tone={tone} />
    <div className="banishment-scene" aria-hidden="true">
      <span className="banishment-path" />
      {outcome.kind !== "NONE" ? <div className="banishment-portrait"><SlimePortrait color={outcome.color ?? "#96c1cf"} accessory={outcome.hat ?? undefined} eyeStyle={outcome.eyeStyle} pose="SEATED" animated={false} /></div> : <div className="banishment-unbroken-moon">☽</div>}
      <div className="banishment-petals"><i /><i /><i /><i /><i /><i /></div>
      <div className="banishment-shadow"><i /><i /><i /></div>
      <span className="banishment-scene-caption">{revealed ? outcome.kind === "WARDEN" ? "A gentle light returns to the moon" : outcome.kind === "HOLLOW" ? "A shadow unravels beneath the roots" : outcome.kind === "NONE" ? "The circle remains unbroken" : "The forest keeps this secret" : "The forest listens to the circle"}</span>
    </div>
    <div className="banishment-content"><header className="banishment-header"><small className="banishment-eyebrow">{outcome.eyebrow}</small>{!revealed ? <h2 className="banishment-target-name">{outcome.kind === "NONE" ? "The circle" : displayName(outcome.name)}</h2> : <div className="banishment-verdict-block"><h2 className="banishment-headline">{outcome.headline}</h2><p className="banishment-detail">{outcome.detail}</p></div>}</header><button ref={actionRef} type="button" className="banishment-skip" onClick={finish} aria-label="Skip cinematic and view tally">View tally <span aria-hidden="true">→</span></button></div>
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{revealed ? outcome.announcement : `${outcome.eyebrow}: ${outcome.kind === "NONE" ? "The circle" : displayName(outcome.name)}`}</div>
  </div>;
}
