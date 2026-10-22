"use client";

import { useEffect, useId, useRef } from "react";

type Glyph = "moon" | "settings" | "exit" | "report" | "sight" | "echo" | "bite" | "veil" | "spark" | "people";

/** Shared, code-native icons keep the HUD light and visually consistent. */
export function GameGlyph({ name }: { name: Glyph }) {
  return <svg className="game-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "moon" ? <path d="M20 15.4A8.7 8.7 0 0 1 8.6 4 8.7 8.7 0 1 0 20 15.4Z" /> : null}
    {name === "settings" ? <><path d="m9 4 1-2h4l1 2 2 1 2-.2 2 3.4-1.2 1.7v2.2l1.2 1.7-2 3.4-2-.2-2 1-1 2h-4l-1-2-2-1-2 .2L3 13.8l1.2-1.7V9.9L3 8.2l2-3.4L7 5Z" transform="translate(0 1)" /><circle cx="12" cy="12" r="3" /></> : null}
    {name === "exit" ? <path d="M10 4H5v16h5m4-12 4 4-4 4m-5-4h12" /> : null}
    {name === "report" ? <path d="M7 21V4m0 0c4-4 7 4 13 0v10c-6 4-9-4-13 0" /> : null}
    {name === "sight" ? <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></> : null}
    {name === "echo" ? <path d="M5 9v6m4-9v12m4-14v16m4-13v10m4-7v4" /> : null}
    {name === "bite" ? <><path d="M4 8c1-4 15-4 16 0v7c-1 6-15 6-16 0Z" /><path d="m7 7 2 5 2-5m2 0 2 5 2-5M8 17h8" /></> : null}
    {name === "veil" ? <><path d="M5 18c-3-9 1-15 7-15s10 6 7 15l-4-2-3 4-3-4Z" /><path d="m8 10 2 1m4 0 2-1" /></> : null}
    {name === "spark" ? <path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6Z" /> : null}
    {name === "people" ? <><path d="M3 19v-2a5 5 0 0 1 10 0v2Zm13-8a4 4 0 0 1 5 4v4h-5" /><circle cx="8" cy="6" r="3" /><path d="M16 3a3 3 0 0 1 0 6" /></> : null}
  </svg>;
}

type SettingsProps = {
  open: boolean; enabled: boolean; onOpenChange: (open: boolean) => void;
  musicEnabled: boolean; soundEnabled: boolean; lowGlare: boolean;
  onMusicToggle: () => void; onSoundToggle: () => void; onGlareToggle: () => void; onExit: () => void;
};

export function GameplaySettings(props: SettingsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const id = useId();
  const { open, enabled, onOpenChange } = props;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && enabled && dialog && !dialog.open) dialog.showModal();
    if ((!open || !enabled) && dialog?.open) dialog.close();
    if (open && !enabled) onOpenChange(false);
  }, [open, enabled, onOpenChange]);

  return <dialog ref={dialogRef} className="play-settings-dialog" aria-labelledby={`${id}-title`}
    onCancel={event => { event.preventDefault(); onOpenChange(false); }} onClose={() => onOpenChange(false)}
    onClick={event => { if (event.target === event.currentTarget) onOpenChange(false); }}>
    <header><div><small>A LITTLE TUNE-UP</small><h2 id={`${id}-title`}>Your forest, your way.</h2></div><button type="button" className="play-close" autoFocus aria-label="Close game settings" onClick={() => onOpenChange(false)}>×</button></header>
    <p>The forest keeps moving while you’re here.</p>
    <div className="play-setting-list">
      {[
        { title: "Forest sounds", description: "Footsteps, little pops & helpful cues", value: props.soundEnabled, toggle: props.onSoundToggle },
        { title: "Moonlit music", description: "A soundtrack for your suspicious stroll", value: props.musicEnabled, toggle: props.onMusicToggle },
        { title: "Gentle moon glare", description: "Soften the brightest Ordeal effect", value: props.lowGlare, toggle: props.onGlareToggle },
      ].map(setting => <button key={setting.title} type="button" className="play-setting" role="switch" aria-checked={setting.value} aria-label={setting.title} onClick={setting.toggle}>
        <span><b>{setting.title}</b><small>{setting.description}</small></span><i aria-hidden="true"><span /></i>
      </button>)}
    </div>
    <details className="play-control-guide"><summary>Controls & little tips <span aria-hidden="true">＋</span></summary>
      <p>Touch: drag anywhere on the left to move. Tap gear to select it, then tap Use. Open the map to pick your next shrine.</p>
      <dl><div><dt>Move</dt><dd>WASD / arrows</dd></div><div><dt>Shrine / gear</dt><dd>E / F</dd></div><div><dt>Report / map / notes</dt><dd>R / M / N</dd></div><div><dt>Hollow only</dt><dd>Q bite · X veiled bite · V sight / C echo</dd></div></dl>
      <p>Complete shrine tasks for gear. Stay close enough to witness—but remember, the forest has plenty of cover.</p>
    </details>
    <footer><button type="button" className="play-exit" onClick={props.onExit}><GameGlyph name="exit" /> Leave match</button><button type="button" className="play-resume" onClick={() => onOpenChange(false)}>Back to the forest <span aria-hidden="true">↗</span></button></footer>
  </dialog>;
}
