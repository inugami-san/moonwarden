"use client";

import { useEffect, useId, useRef, useState } from "react";
import { makeObservation, observationClaim, OBSERVATION_LOCATIONS, OBSERVATION_TIMES, type KnownName, type ObservationNote } from "./field-notes";
import "./field-notebook.css";

type ComposerProps = { roster: readonly KnownName[]; onRecord: (note: ObservationNote) => void; onDraft?: (text: string) => void; disabled?: boolean };
function ObservationComposer({ roster, onRecord, onDraft, disabled }: ComposerProps) {
  const [person, setPerson] = useState("");
  const [location, setLocation] = useState(OBSERVATION_LOCATIONS[0]);
  const [when, setWhen] = useState<string>(OBSERVATION_TIMES[0]);
  const id = useId();
  const selected = roster.some(player => player.id === person) ? person : roster[0]?.id ?? "";
  const note = () => makeObservation(roster, selected, location, when);
  return <form className="observation-composer" onSubmit={event => { event.preventDefault(); const value = note(); if (value) onRecord(value); }}>
    <label htmlFor={`${id}-person`}>I saw<select id={`${id}-person`} value={selected} onChange={event => setPerson(event.target.value)} disabled={disabled}>{roster.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
    <label htmlFor={`${id}-place`}>Near<select id={`${id}-place`} value={location} onChange={event => setLocation(event.target.value)} disabled={disabled}>{OBSERVATION_LOCATIONS.map(value => <option key={value} value={value}>{value.toLowerCase()}</option>)}</select></label>
    <label htmlFor={`${id}-when`}>When<select id={`${id}-when`} value={when} onChange={event => setWhen(event.target.value)} disabled={disabled}>{OBSERVATION_TIMES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    <div className="observation-actions"><button type="submit" disabled={disabled || !selected}>Save privately</button>{onDraft ? <button type="button" disabled={disabled || !selected} onClick={() => { const value = note(); if (value) onDraft(observationClaim(value)); }}>Draft message</button> : null}</div>
  </form>;
}

function NoteList({ notes, onDraft }: { notes: readonly ObservationNote[]; onDraft?: (text: string) => void }) {
  if (!notes.length) return <p className="notebook-empty">No observations yet. Record only what you think you saw.</p>;
  return <ol className="observation-list">{notes.map((note, index) => <li key={index}><p>{observationClaim(note)}</p>{onDraft ? <button type="button" onClick={() => onDraft(observationClaim(note))}>Draft</button> : null}</li>)}</ol>;
}

export function FieldNotebook({ roster, notes, onRecord, enabled, open, onOpenChange }: ComposerProps & {
  notes: readonly ObservationNote[]; enabled: boolean; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const id = useId();
  const isOpen = open && enabled;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen && dialog && !dialog.open) dialog.showModal();
    if (!isOpen && dialog?.open) dialog.close();
    if (!enabled && open) onOpenChange(false);
  }, [isOpen, enabled, open, onOpenChange]);
  useEffect(() => {
    if (!enabled) return;
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.code !== "KeyN") return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (!open && document.querySelector("dialog[open], .modal-backdrop")) return;
      event.preventDefault(); onOpenChange(!open);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [enabled, open, onOpenChange]);
  return <>
    {enabled ? <button type="button" className="notebook-open notebook-icon" onClick={() => onOpenChange(true)} aria-label="Field notes" title="Field notes (N)" aria-keyshortcuts="N" aria-haspopup="dialog" aria-expanded={isOpen}><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h13v18H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm0 0v18M10 7h5M10 11h5M10 15h3" /></svg></button> : null}
    <dialog ref={dialogRef} className="field-notebook-dialog" aria-labelledby={`${id}-title`} onCancel={event => { event.preventDefault(); onOpenChange(false); }} onClose={() => onOpenChange(false)}>
      <header><div><small>PRIVATE · THIS MATCH ONLY</small><h2 id={`${id}-title`}>What did you see?</h2></div><button type="button" autoFocus onClick={() => onOpenChange(false)} aria-label="Close field notebook">×</button></header>
      <p>These are your own notes, not verified evidence. Nothing is tracked automatically or sent to other players. The forest keeps moving while you write.</p>
      <ObservationComposer roster={roster} onRecord={onRecord} />
      <NoteList notes={notes} />
    </dialog>
  </>;
}

export function MeetingObservations({ roster, notes, onRecord, onDraft, disabled, panel = false }: ComposerProps & { notes: readonly ObservationNote[]; panel?: boolean }) {
  const content = <><p>Private notes, not verified evidence. Draft a message, then send it in Chat.</p><ObservationComposer roster={roster} onRecord={onRecord} onDraft={onDraft} disabled={disabled} /><NoteList notes={notes} onDraft={disabled ? undefined : onDraft} /></>;
  return panel ? <section className="meeting-observations notes-panel" aria-label="Private observations">{content}</section> : <details className="meeting-observations"><summary>Share an observation · private notes ({notes.length})</summary>{content}</details>;
}
