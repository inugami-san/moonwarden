"use client";

import { GameGlyph } from "./gameplay-controls";

/** Cooldowns are visible on the button; tapping never opens another help layer. */
export function ReportAction({ allowed, label, hint, onReport }: {
  allowed: boolean; label: string; hint: string; onReport: () => void;
}) {
  return <div className="report-action-wrap" data-no-joystick>
    <button type="button" className={`action report ${allowed ? "ready" : "is-locked"}`}
      disabled={!allowed} aria-label={hint}
      onClick={() => { if (allowed) onReport(); }}><kbd>R</kbd><GameGlyph name="report" /><span>{label}</span></button>
  </div>;
}
