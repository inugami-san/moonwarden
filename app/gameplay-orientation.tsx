"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";

// Phone-sized portrait windows and portrait touch tablets both need the wide HUD.
export const PORTRAIT_GAME_QUERY = "(orientation: portrait) and (max-width: 900px), (orientation: portrait) and (any-pointer: coarse)";
function subscribeOrientation(notify: () => void) {
  const media = window.matchMedia(PORTRAIT_GAME_QUERY);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}
function readOrientation() { return window.matchMedia(PORTRAIT_GAME_QUERY).matches; }
function serverOrientation() { return false; }

export function useLandscapeRequired() {
  return useSyncExternalStore(subscribeOrientation, readOrientation, serverOrientation);
}

export function LandscapeGuard({ active, multiplayer, onExit }: { active: boolean; multiplayer: boolean; onExit: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (active && dialog && !dialog.open) dialog.showModal();
    if (!active && dialog?.open) dialog.close();
  }, [active]);

  return <dialog ref={dialogRef} className="landscape-guard" aria-labelledby={`${id}-title`} aria-describedby={`${id}-help`}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); } }}
    onCancel={event => event.preventDefault()}
    onClose={() => { const dialog = dialogRef.current; if (active && dialog?.isConnected && !dialog.open) dialog.showModal(); }}>
    <div className="landscape-guard-content">
      <div className="rotate-device" aria-hidden="true"><svg viewBox="0 0 144 112" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="19" y="34" width="106" height="57" rx="11" /><path d="M30 51v22m83-12v3M33 22c14-14 41-15 58-5m-1-10 2 12-12 1" /><path d="m72 48 4 10 10 4-10 4-4 10-4-10-10-4 10-4Z" /></svg></div>
      <small>THE FOREST NEEDS A LITTLE MORE ROOM</small>
      <h2 id={`${id}-title`}>Rotate to play.</h2>
      <p id={`${id}-help`}>Turn your phone sideways for landscape gameplay.<br />On a computer? Widen this window.</p>
      <span>{multiplayer ? "The live match keeps moving while you rotate." : "Solo practice is paused while you rotate."}</span>
      <button type="button" autoFocus onClick={onExit}>Return to the lobby <span aria-hidden="true">↗</span></button>
    </div>
  </dialog>;
}
