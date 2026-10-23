"use client";

import { useEffect, useRef, useState } from "react";
import { VICTORY_SECONDS, VICTORY_SOUND_AT, type MatchVictory } from "./match-victory";
import { VictoryScene } from "./victory-art";
import "./victory.css";

/** One mounted instance per final result. Animation clocks never rerender React. */
export function VictoryOverlay({ victory, reducedMotion = false, onCelebrate, onExit }: {
  victory: MatchVictory;
  reducedMotion?: boolean;
  onCelebrate?: (kind: "WARDEN" | "HOLLOW") => void;
  onExit: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return; // Text, skip and return remain usable without Canvas.
    const scene = new VictoryScene(victory);
    const started = performance.now();
    let frame = 0;
    const paint = (now: number) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const time = (now - started) / 1000;
      scene.draw(ctx, rect.width, rect.height, time, settled);
      if (!settled && time < VICTORY_SECONDS[victory.kind]) frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    const resize = new ResizeObserver(() => { if (settled) paint(performance.now()); });
    resize.observe(canvas);
    return () => { cancelAnimationFrame(frame); resize.disconnect(); };
  }, [victory, settled]);

  return (
    <dialog ref={dialogRef} className={`victory-overlay victory-${victory.kind.toLowerCase()} ${settled ? "is-settled" : "is-playing"} ${reducedMotion ? "is-reduced-motion" : ""}`}
      role="dialog" aria-modal="true" aria-labelledby="victory-title" aria-describedby="victory-detail"
      onCancel={event => { event.preventDefault(); setFinished(true); }}
      onKeyDownCapture={event => {
        event.stopPropagation();
        if (event.code === "Escape" && !settled) { event.preventDefault(); setFinished(true); }
      }}>
      <canvas ref={canvasRef} className="victory-canvas" aria-hidden="true" />
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
        <small>{settled ? "A little charm. Another story." : "The moon remembers this night."}</small>
      </footer>
      <p className="sr-only" role="status">{victory.team}. {victory.personal}</p>
    </dialog>
  );
}
