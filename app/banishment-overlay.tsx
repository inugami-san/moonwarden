"use client";

import { useEffect, useRef, useState } from "react";
import {
  banishmentDuration,
  banishmentRevealAt,
  displayName,
  type BanishmentOutcome,
} from "./banishment";
import { BanishmentScene } from "./banishment-art";
import "./banishment.css";

export function BanishmentOverlay({
  outcome,
  reducedMotion = false,
  onPlayAudio,
  onComplete,
}: {
  outcome: BanishmentOutcome;
  reducedMotion?: boolean;
  onPlayAudio?: (kind: "OPENING" | "WARDEN" | "HOLLOW") => void;
  onComplete: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [settling, setSettling] = useState(false);
  const completeRef = useRef(onComplete);
  const playAudioRef = useRef(onPlayAudio);

  useEffect(() => {
    completeRef.current = onComplete;
    playAudioRef.current = onPlayAudio;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scene = new BanishmentScene(outcome);
    const revealTime = banishmentRevealAt(outcome.kind, reducedMotion);
    const totalDuration = banishmentDuration(outcome.kind, reducedMotion);
    const settleTime = totalDuration - 0.42;

    let animFrame: number;
    let openingPlayed = false;
    let revealPlayed = false;
    let localRevealed = false;
    let localSettling = false;
    let finished = false;
    const startTime = performance.now();

    const finish = () => {
      if (finished) return;
      finished = true;
      completeRef.current();
    };

    const render = (now: number) => {
      const elapsed = (now - startTime) / 1000;

      // Audio triggers
      if (!openingPlayed && elapsed >= 0.22) {
        openingPlayed = true;
        playAudioRef.current?.("OPENING");
      }
      if (!revealPlayed && elapsed >= revealTime) {
        revealPlayed = true;
        if (outcome.kind === "WARDEN") playAudioRef.current?.("WARDEN");
        else if (outcome.kind === "HOLLOW") playAudioRef.current?.("HOLLOW");
      }

      // State triggers
      if (elapsed >= revealTime && !localRevealed) {
        localRevealed = true;
        setRevealed(true);
      }
      if (elapsed >= settleTime && !localSettling) {
        localSettling = true;
        setSettling(true);
      }
      if (elapsed >= totalDuration) {
        finish();
        return;
      }

      // Canvas sizing and drawing
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pw = Math.max(1, Math.round(rect.width * dpr));
      const ph = Math.max(1, Math.round(rect.height * dpr));

      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      scene.draw(ctx, rect.width, rect.height, elapsed, reducedMotion, dpr);
      ctx.restore();

      animFrame = requestAnimationFrame(render);
    };

    animFrame = requestAnimationFrame(render);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" || event.code === "Enter" || event.code === "Escape") {
        event.preventDefault();
        finish();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [outcome, reducedMotion]);

  const kindClass = outcome.kind.toLowerCase();

  return (
    <div
      className={`banishment-overlay banishment-${kindClass} ${settling ? "is-settling" : ""} ${reducedMotion ? "reduced-motion" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="The Moon's Judgment"
    >
      <canvas ref={canvasRef} className="banishment-canvas" aria-hidden="true" />

      <div className="banishment-content">
        <header className="banishment-header">
          <small className="banishment-eyebrow">{outcome.eyebrow}</small>
          {!revealed ? (
            <h2 className="banishment-target-name">{outcome.kind === "NONE" ? "The circle" : displayName(outcome.name)}</h2>
          ) : (
            <div className="banishment-verdict-block">
              <h2 className="banishment-headline">{outcome.headline}</h2>
              <p className="banishment-detail">{outcome.detail}</p>
            </div>
          )}
        </header>

        <button
          type="button"
          className="banishment-skip"
          onClick={() => completeRef.current()}
          aria-label="Skip cinematic and view tally"
        >
          View Tally
        </button>
      </div>

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {revealed ? outcome.announcement : `${outcome.eyebrow}: ${outcome.name}`}
      </div>
    </div>
  );
}
