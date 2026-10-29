"use client";

import { useEffect, useId, useReducer, useRef } from "react";
import { SlimePortrait } from "./cat-portrait";
import { GameGlyph } from "./gameplay-controls";

export type HollowLessonStage = "RITUAL" | "ABILITY" | "HUNT" | "DONE";
export type HollowLessonAbility = "SIGHT" | "ECHO";
export type HollowLessonState = { stage: HollowLessonStage; gearEarned: boolean; ability: HollowLessonAbility | null; strikeSpent: boolean };
export type HollowLessonAction = { type: "FAKE_RITUAL" } | { type: "ABILITY"; ability: HollowLessonAbility } | { type: "BITE" };

export function createHollowLesson(): HollowLessonState {
  return { stage: "RITUAL", gearEarned: false, ability: null, strikeSpent: false };
}

/** A harmless demonstration, completely separate from room state and role assignment. */
export function hollowLessonReducer(state: HollowLessonState, action: HollowLessonAction): HollowLessonState {
  if (action.type === "FAKE_RITUAL" && state.stage === "RITUAL") return { ...state, stage: "ABILITY", gearEarned: true };
  if (action.type === "ABILITY" && state.stage === "ABILITY" && !state.ability && (action.ability === "SIGHT" || action.ability === "ECHO")) return { ...state, stage: "HUNT", ability: action.ability };
  if (action.type === "BITE" && state.stage === "HUNT" && !state.strikeSpent) return { ...state, stage: "DONE", strikeSpent: true };
  return state;
}

const COPY: Record<HollowLessonStage, { number: number; title: string; text: string }> = {
  RITUAL: { number: 1, title: "Look like you belong.", text: "Hollows can complete fake shrine rituals to earn gear and siphon restoration. Try one here—this demonstration skips the puzzle." },
  ABILITY: { number: 2, title: "Choose your advantage.", text: "An Ordeal begins. Sight briefly reveals living cats. Echo creates a false rustle. Choose one: they share one special action per Ordeal." },
  HUNT: { number: 3, title: "One moment. One bite.", text: "The practice dummy is already in reach. In a real match, get close to a cat during an Ordeal, then use Bite. Normal and Veiled Bite share your single strike." },
  DONE: { number: 3, title: "Keep your secret.", text: "Your strike is spent until the next Ordeal. Hollows win when surviving Hollows match or outnumber the Wardens. Join the discussion without giving yourself away." },
};

export function HollowLesson({ onExit }: { onExit: () => void }) {
  const [state, dispatch] = useReducer(hollowLessonReducer, undefined, createHollowLesson);
  const root = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const copy = COPY[state.stage];
  const inOrdeal = state.stage !== "RITUAL";

  useEffect(() => {
    const previous = document.activeElement;
    root.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);

  useEffect(() => { if (state.stage !== "RITUAL") title.current?.focus(); }, [state.stage]);

  return <div ref={root} className="hollow-lesson" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} data-stage={state.stage}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); onExit(); return; }
      if (event.key === "Tab") {
        const buttons = root.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        if (!buttons?.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current || document.activeElement === title.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root.current || document.activeElement === title.current)) { event.preventDefault(); first.focus(); }
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === "e" && state.stage === "RITUAL") { event.preventDefault(); dispatch({ type: "FAKE_RITUAL" }); }
      if (key === "v" && state.stage === "ABILITY") { event.preventDefault(); dispatch({ type: "ABILITY", ability: "SIGHT" }); }
      if (key === "c" && state.stage === "ABILITY") { event.preventDefault(); dispatch({ type: "ABILITY", ability: "ECHO" }); }
      if (key === "q" && state.stage === "HUNT") { event.preventDefault(); dispatch({ type: "BITE" }); }
    }}>
    <header className="hollow-lesson-header"><div><strong>THE HOLLOW</strong><small>Optional practice · no real players</small></div><button type="button" onClick={onExit}>Back to guide <span aria-hidden="true">↗</span></button></header>
    <div className="hollow-lesson-main">
      <section className="hollow-lesson-scene" aria-label="Private practice scene" data-revealed={state.ability === "SIGHT"}>
        <span className="hollow-lesson-phase"><GameGlyph name="moon" />{inOrdeal ? "Practice Ordeal" : "Practice Calm"}</span>
        <div className="hollow-lesson-shrine" data-complete={state.gearEarned} aria-hidden="true"><GameGlyph name="moon" /><i /><span /></div>
        <div className="hollow-lesson-you" aria-hidden="true"><SlimePortrait color="#a38bd1" accessory="moonbell" animated={false} /><small>You · Hollow</small></div>
        <div className="hollow-lesson-dummy" data-fallen={state.strikeSpent} aria-hidden="true"><SlimePortrait color="#b6cf99" animated={false} /><small>{state.strikeSpent ? "Dummy captured" : "Practice dummy"}</small></div>
        {state.ability === "ECHO" ? <div className="hollow-lesson-rustle" aria-hidden="true"><i /><i /><i /><small>False rustle →</small></div> : null}
        {state.strikeSpent ? <div className="hollow-lesson-capture" aria-hidden="true"><i /><i /><i /></div> : null}
        <div className="hollow-lesson-scene-status" role="status">{state.strikeSpent ? "Strike spent · wait for the next Ordeal" : state.ability === "SIGHT" ? "Sight used · dummy revealed · Echo unavailable" : state.ability === "ECHO" ? "Echo used · false rustle · Sight unavailable" : state.gearEarned ? "Gear earned · shared special action ready" : "Public gauge updates are delayed and anonymous—not proof of a role."}</div>
      </section>
      <section className="hollow-lesson-copy" aria-label="Hollow lesson">
        <div aria-live="polite" aria-atomic="true"><small className="hollow-lesson-step">LESSON {copy.number} OF 3</small><h1 ref={title} id={`${id}-title`} tabIndex={-1}>{copy.title}</h1><p id={`${id}-description`}>{copy.text}</p></div>
        {state.stage === "RITUAL" ? <button type="button" className="hollow-lesson-primary" onClick={() => dispatch({ type: "FAKE_RITUAL" })}><GameGlyph name="moon" /> Try a fake ritual <kbd>E</kbd></button> : null}
        {state.stage === "ABILITY" ? <div className="hollow-lesson-choices" role="group" aria-label="Choose one special action"><button type="button" onClick={() => dispatch({ type: "ABILITY", ability: "SIGHT" })}><GameGlyph name="sight" /><strong>Use Sight</strong><kbd>V</kbd></button><button type="button" onClick={() => dispatch({ type: "ABILITY", ability: "ECHO" })}><GameGlyph name="echo" /><strong>Use Echo</strong><kbd>C</kbd></button></div> : null}
        {state.stage === "HUNT" ? <button type="button" className="hollow-lesson-primary" onClick={() => dispatch({ type: "BITE" })}><GameGlyph name="bite" /> Bite practice dummy <kbd>Q</kbd></button> : null}
        {state.stage === "DONE" ? <div className="hollow-lesson-finish"><span><GameGlyph name="bite" /> Bite spent · refreshes next Ordeal</span><button type="button" className="hollow-lesson-primary" onClick={onExit}>Back to the field guide <span aria-hidden="true">→</span></button></div> : null}
        <p className="hollow-lesson-transfer">Real matches: E shrine · F gear · Q bite · V Sight / C Echo. Aim before using Echo.</p>
      </section>
    </div>
    <footer className="hollow-lesson-footer"><ol aria-label="Hollow lesson progress">{["Blend in", "Choose a trick", "Hunt"].map((label, index) => <li key={label} aria-current={copy.number === index + 1 ? "step" : undefined} data-done={copy.number > index + 1 || state.stage === "DONE"}><span>{copy.number > index + 1 || state.stage === "DONE" ? "✓" : index + 1}</span>{label}</li>)}</ol><small>Demonstration only · nothing changes in your matches</small></footer>
  </div>;
}
