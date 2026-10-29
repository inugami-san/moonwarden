"use client";

import { useEffect, useId, useRef, useState } from "react";
import { GameGlyph } from "./gameplay-controls";

/** Locked controls stay explainable on touch; only availability can call report. */
export function ReportAction({ allowed, label, hint, onReport }: {
  allowed: boolean; label: string; hint: string; onReport: () => void;
}) {
  const [explaining, setExplaining] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintId = useId();
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return <div className="report-action-wrap" data-no-joystick>
    <button type="button" className={`action report ${allowed ? "ready" : "is-locked"}`}
      aria-disabled={!allowed} aria-label={hint} title={hint}
      aria-describedby={!allowed && explaining ? hintId : undefined}
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setExplaining(false); } }}
      onClick={() => {
        if (allowed) { setExplaining(false); onReport(); return; }
        setExplaining(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => { setExplaining(false); timerRef.current = null; }, 4500);
      }}><kbd>R</kbd><GameGlyph name="report" /><span>{label}</span></button>
    {!allowed && explaining ? <span id={hintId} className="report-action-hint" role="status">{hint}</span> : null}
  </div>;
}
