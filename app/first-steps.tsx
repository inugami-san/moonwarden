"use client";

import { useCallback, useEffect, useId, useReducer, useRef, type CSSProperties, type PointerEvent } from "react";
import { SlimePortrait } from "./cat-portrait";
import { FloatingJoystick } from "./floating-joystick";
import { movementVector, type MoveVector } from "./joystick-input";
import { holdTaskProgress } from "./task-hold";
import { TaskHoldGauge } from "./task-hold-gauge";
import {
  createFirstStepsProgress, FIRST_STEPS_RUNES, FIRST_STEPS_SHRINE, firstStepsReducer,
  isNearFirstStepsShrine, markFirstStepsComplete, markFirstStepsSkipped,
  type FirstStepsRune, type FirstStepsStage,
} from "./intro-state";

const TREES = [
  [4, 13, 1.4], [17, 9, 1.1], [35, 7, 1.6], [54, 8, 1.1], [91, 9, 1.6],
  [5, 40, 1.2], [96, 39, 1.5], [8, 68, 1.5], [94, 71, 1.1],
  [43, 94, 1.6], [65, 96, 1.3], [85, 94, 1.8],
] as const;
const RUNE_SYMBOLS: Record<FirstStepsRune, string> = { Crescent: "☽", Half: "◐", Full: "●" };
const KEY_DIRECTIONS: Record<string, { x: number; y: number }> = {
  arrowup: { x: 0, y: -1 }, w: { x: 0, y: -1 },
  arrowleft: { x: -1, y: 0 }, a: { x: -1, y: 0 },
  arrowdown: { x: 0, y: 1 }, s: { x: 0, y: 1 },
  arrowright: { x: 1, y: 0 }, d: { x: 1, y: 0 },
};
const LESSON_COPY: Record<FirstStepsStage, { title: string; text: string; number: number }> = {
  MOVE: { title: "A small step into the forest.", text: "Move your warden with WASD or arrow keys. On touch, drag the left side of the clearing—the same joystick used in a match.", number: 1 },
  SHRINE: { title: "Follow the shrine’s light.", text: "Walk to the moon shrine. Stay close and hold E, or hold the Restore button, for 1.8 seconds to begin its ritual.", number: 1 },
  PUZZLE: { title: "Help the moon grow.", text: "Tap the moon runes in this order: Crescent, Half, then Full. A mistake just lets you try again.", number: 2 },
  BLACKOUT: { title: "You earned a little light.", text: "Glowing Mushroom earned! The clearing is in a safe practice blackout. Use your mushroom to see again.", number: 3 },
  DONE: { title: "Now you know the way.", text: "Wardens restore the forest to 100% or vote out every Hollow. Hidden Hollows hunt during Ordeals to equal the Wardens. Share sightings before voting—anyone can claim innocence.", number: 3 },
};

function MushroomIcon() {
  return <svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path d="M15 21h10l2 13c-4 3-10 3-14 0Z" fill="#e6f6c5" /><path d="M4 22C4 2 36 2 36 22c-8 4-24 4-32 0Z" fill="#c5ef8a" stroke="#eafacb" strokeWidth="1.5" /><circle cx="13" cy="15" r="2.5" fill="#fcffdf" /><circle cx="25" cy="13" r="3" fill="#fcffdf" /></svg>;
}

function ShrineArt({ restored }: { restored: boolean }) {
  return <svg viewBox="0 0 120 130" aria-hidden="true" focusable="false"><ellipse cx="60" cy="115" rx="54" ry="12" fill="#090f22" opacity=".5" /><path d="m12 106 12-13h72l12 13v9H12Z" fill="#526482" stroke="#9aacc0" strokeWidth="2" /><path d="M31 96V45l13-13h32l13 13v51Z" fill="#37455f" stroke="#a4b6c4" strokeWidth="2" /><path d="M42 93V48h36v45" fill="#17283c" /><path d="M21 43 60 14l39 29-8 8H29Z" fill="#697b94" stroke="#a4b6c4" strokeWidth="2" /><circle cx="60" cy="62" r="17" fill={restored ? "#cce9ad" : "#7cafc4"} opacity=".18" /><path d="M66 48a15 15 0 1 0 5 25c-15 3-22-15-5-25Z" fill={restored ? "#e7fac1" : "#b6edf1"} /><path d="M47 88h26M35 101h50" stroke="#a5c9c8" strokeWidth="2" opacity=".7" /><path d="m21 104 9-12m60 0 9 12" stroke="#c6e4ca" strokeWidth="2" /></svg>;
}

export type FirstStepsProps = {
  onComplete: () => void;
  onSkip: () => void;
  color?: string;
  name?: string;
};

/** A separate, replayable practice clearing. Mounting it never enters a match. */
export function FirstSteps({ onComplete, onSkip, color = "#94c9d7", name = "Your warden" }: FirstStepsProps) {
  const [progress, dispatch] = useReducer(firstStepsReducer, undefined, createFirstStepsProgress);
  const rootRef = useRef<HTMLElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const keysRef = useRef(new Set<string>());
  const joystickRef = useRef<MoveVector>({ vx: 0, vy: 0 });
  const buttonHeldRef = useRef(false);
  const holdPointerRef = useRef<number | null>(null);
  const finishedRef = useRef(false);
  const id = useId();
  const canMove = progress.stage === "MOVE" || progress.stage === "SHRINE";
  const nearShrine = isNearFirstStepsShrine(progress);
  const copy = LESSON_COPY[progress.stage];
  const restored = progress.lightEarned;
  const dark = progress.stage === "BLACKOUT" || progress.stage === "DONE";

  const onJoystickVector = useCallback((vector: MoveVector) => { joystickRef.current = vector; }, []);
  const releaseButtonHold = useCallback(() => {
    buttonHeldRef.current = false;
    holdPointerRef.current = null;
    if (!keysRef.current.has("e")) dispatch({ type: "HOLD_SHRINE", held: false, seconds: 0 });
  }, []);
  const cancelHold = useCallback(() => {
    keysRef.current.delete("e");
    buttonHeldRef.current = false;
    holdPointerRef.current = null;
    dispatch({ type: "HOLD_SHRINE", held: false, seconds: 0 });
  }, []);

  useEffect(() => {
    const previous = document.activeElement;
    rootRef.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);

  useEffect(() => {
    if (progress.stage !== "MOVE" && progress.stage !== "SHRINE") {
      // Replacing a clicked ritual button must not strand keyboard focus on body.
      rootRef.current?.querySelector<HTMLButtonElement>(".first-steps-lesson button:not(:disabled)")?.focus();
    }
  }, [progress.stage]);

  useEffect(() => {
    if (!canMove) return;
    let frame = 0;
    let last = 0;
    const resetInputs = () => { keysRef.current.clear(); joystickRef.current = { vx: 0, vy: 0 }; buttonHeldRef.current = false; holdPointerRef.current = null; last = 0; };
    const reset = () => { resetInputs(); dispatch({ type: "HOLD_SHRINE", held: false, seconds: 0 }); };
    const hidden = () => { if (document.hidden) reset(); };
    const move = (now: number) => {
      const seconds = last ? Math.min(.04, (now - last) / 1000) : 0;
      last = now;
      let x = 0, y = 0;
      for (const key of keysRef.current) { x += KEY_DIRECTIONS[key]?.x ?? 0; y += KEY_DIRECTIONS[key]?.y ?? 0; }
      const vector = movementVector(x, y, joystickRef.current);
      if (seconds && !document.hidden && !finishedRef.current) {
        if (vector.vx || vector.vy) dispatch({ type: "MOVE", dx: vector.vx * seconds * 31, dy: vector.vy * seconds * 31 });
        if (keysRef.current.has("e") || buttonHeldRef.current) dispatch({ type: "HOLD_SHRINE", held: true, seconds });
      }
      frame = requestAnimationFrame(move);
    };
    frame = requestAnimationFrame(move);
    window.addEventListener("blur", reset);
    window.addEventListener("resize", reset);
    document.addEventListener("visibilitychange", hidden);
    return () => { cancelAnimationFrame(frame); resetInputs(); window.removeEventListener("blur", reset); window.removeEventListener("resize", reset); document.removeEventListener("visibilitychange", hidden); };
  }, [canMove]);

  const leave = (complete: boolean) => {
    if (finishedRef.current || (complete && progress.stage !== "DONE")) return;
    finishedRef.current = true;
    cancelHold();
    if (complete) { markFirstStepsComplete(); onComplete(); }
    else { markFirstStepsSkipped(); onSkip(); }
  };

  const startButtonHold = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || holdPointerRef.current !== null || progress.stage !== "SHRINE" || !nearShrine) return;
    try { event.currentTarget.setPointerCapture(event.pointerId); }
    catch { cancelHold(); return; }
    holdPointerRef.current = event.pointerId;
    buttonHeldRef.current = true;
    dispatch({ type: "HOLD_SHRINE", held: true, seconds: 0 });
  };

  return <main
    ref={rootRef}
    className="first-steps-shell"
    aria-labelledby={`${id}-title`}
    aria-describedby={`${id}-description`}
    tabIndex={-1}
    data-first-steps-stage={progress.stage}
    onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); leave(false); return; }
      if (event.key === "Tab") {
        const buttons = rootRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        if (!buttons?.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === rootRef.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === rootRef.current)) { event.preventDefault(); first.focus(); }
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const key = event.key.toLowerCase();
      if (KEY_DIRECTIONS[key] && canMove) { event.preventDefault(); keysRef.current.add(key); }
      if (key === "e" && canMove) { event.preventDefault(); keysRef.current.add("e"); }
      if (key === "f" && progress.stage === "BLACKOUT") { event.preventDefault(); dispatch({ type: "USE_LIGHT" }); }
    }}
    onKeyUp={(event) => {
      event.stopPropagation();
      const key = event.key.toLowerCase();
      keysRef.current.delete(key);
      if (key === "e" && !buttonHeldRef.current) dispatch({ type: "HOLD_SHRINE", held: false, seconds: 0 });
    }}
  >
    <header className="first-steps-header"><div><span className="first-steps-wordmark">MOONWARDEN</span><small>First steps · a private practice clearing</small></div><button type="button" className="first-steps-skip" onClick={() => leave(false)}>Skip intro <span aria-hidden="true">↗</span></button></header>
    <div className="first-steps-main">
      <div ref={worldRef} className="first-steps-world" data-dark={dark} data-light={progress.lightUsed} role="group" aria-label="Practice clearing. Move with WASD or arrow keys; on touch, drag the left side to use the joystick.">
        <div className="first-steps-moon" aria-hidden="true">☽</div>
        <div className="first-steps-path" aria-hidden="true" />
        <div className="first-steps-trees" aria-hidden="true">{TREES.map(([x, y, scale], index) => <i key={index} style={{ left: `${x}%`, top: `${y}%`, "--tree-scale": scale } as CSSProperties} />)}</div>
        <div className="first-steps-shrine" style={{ left: `${FIRST_STEPS_SHRINE.x}%`, top: `${FIRST_STEPS_SHRINE.y}%` }} data-restored={restored} aria-hidden="true"><span /><ShrineArt restored={restored} /><small>{restored ? "RESTORED" : "MOON SHRINE"}</small></div>
        <div className="first-steps-darkness" style={{ "--light-x": `${progress.x}%`, "--light-y": `${progress.y}%` } as CSSProperties} aria-hidden="true" />
        <div className="first-steps-cat" style={{ left: `${progress.x}%`, top: `${progress.y}%` }} data-lit={progress.lightUsed} aria-hidden="true"><SlimePortrait color={color} animated={false} /><small>{name.slice(0, 20)}</small></div>
        <span className="first-steps-world-label">{dark ? progress.lightUsed ? "Your light cuts through the dark" : "Practice blackout · you are safe" : "THE WHISPERING CLEARING"}</span>
        {canMove ? <div className="first-steps-touch-zone" aria-hidden="true" /> : null}
        <FloatingJoystick surfaceRef={worldRef} enabled={canMove} onVector={onJoystickVector} />
        {canMove ? <small className="first-steps-walk-hint">WASD / arrow keys</small> : null}
      </div>
      <section className="first-steps-lesson" aria-label="Current lesson">
        <div className="first-steps-objective" aria-live="polite" aria-atomic="true"><small>LESSON {copy.number} OF 3</small><h1 id={`${id}-title`}>{copy.title}</h1><p id={`${id}-description`}>{copy.text}</p></div>
        {canMove ? <div className="first-steps-action-area"><span className="first-steps-proximity" role="status">{progress.stage === "MOVE" ? "Try moving a few steps." : nearShrine ? "Ready—hold to restore." : "The shrine is ahead and to your right."}</span><button
          type="button"
          className="first-steps-primary first-steps-restore"
          aria-keyshortcuts="E"
          aria-describedby={`${id}-hold-hint`}
          disabled={progress.stage !== "SHRINE" || !nearShrine}
          onPointerDown={startButtonHold}
          onPointerUp={(event) => { if (event.pointerId === holdPointerRef.current) releaseButtonHold(); }}
          onPointerCancel={cancelHold}
          onLostPointerCapture={releaseButtonHold}
          onPointerLeave={() => { if (holdPointerRef.current !== null) cancelHold(); }}
          onPointerMove={(event) => {
            if (event.pointerId !== holdPointerRef.current) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) cancelHold();
          }}
          onBlur={cancelHold}
          onKeyDown={(event) => {
            if (event.code === "Space" || event.code === "Enter") { event.preventDefault(); buttonHeldRef.current = true; dispatch({ type: "HOLD_SHRINE", held: true, seconds: 0 }); }
          }}
          onKeyUp={(event) => { if (event.code === "Space" || event.code === "Enter") { event.preventDefault(); releaseButtonHold(); } }}
          onClick={(event) => event.preventDefault()}
        ><span aria-hidden="true">☽</span> Hold to restore <kbd>E</kbd></button><span id={`${id}-hold-hint`} className="first-steps-hold-hint">Releasing resets the ritual.</span><TaskHoldGauge progress={holdTaskProgress(progress.holdSeconds)} holding={progress.holding} /></div> : null}
        {progress.stage === "PUZZLE" ? <div className="first-steps-puzzle"><div className="first-steps-recipe" aria-label="Rune order: Crescent, Half, Full">{FIRST_STEPS_RUNES.map((rune, index) => <span key={rune} data-ready={index < progress.puzzleIndex}><i aria-hidden="true">{RUNE_SYMBOLS[rune]}</i><small>{rune}</small></span>)}</div><div className="first-steps-runes" role="group" aria-label="Choose moon runes">{(["Full", "Crescent", "Half"] as const).map((rune) => <button type="button" key={rune} aria-label={`${rune} moon rune`} onClick={() => dispatch({ type: "RUNE", rune })}><span aria-hidden="true">{RUNE_SYMBOLS[rune]}</span><small>{rune}</small></button>)}</div><p className="first-steps-puzzle-status" role="status">{progress.puzzleMistakes > 0 && progress.puzzleIndex === 0 ? "A gentle reset. Start with Crescent." : `${progress.puzzleIndex} of 3 runes lit`}</p></div> : null}
        {progress.lightEarned ? <div className="first-steps-inventory" data-used={progress.lightUsed}><MushroomIcon /><span><strong>Glowing Mushroom</strong><small>{progress.lightUsed ? "Used · light restored" : "1 in your satchel · ready to use"}</small></span><i aria-hidden="true">{progress.lightUsed ? "✓" : "+1"}</i></div> : null}
        {progress.stage === "BLACKOUT" ? <button type="button" className="first-steps-primary" onClick={() => dispatch({ type: "USE_LIGHT" })}>Use Glowing Mushroom <kbd>F</kbd></button> : null}
        {progress.stage === "DONE" ? <div className="first-steps-action-area"><span className="first-steps-complete-note">Practice complete. Your next adventure is your choice.</span><button type="button" className="first-steps-primary" onClick={() => leave(true)}>Enter the glade <span aria-hidden="true">→</span></button></div> : null}
      </section>
    </div>
    <footer className="first-steps-footer"><ol aria-label="Intro progress">{["Move", "Restore", "Find your light"].map((lesson, index) => <li key={lesson} aria-current={copy.number === index + 1 ? "step" : undefined} data-complete={copy.number > index + 1 || progress.stage === "DONE"}><span aria-hidden="true">{copy.number > index + 1 || progress.stage === "DONE" ? "✓" : `0${index + 1}`}</span>{lesson}</li>)}</ol><small>About a minute · no opponents · replay any time</small></footer>
  </main>;
}
