"use client";
import { useEffect, useState } from "react";
import type { RitualChallenge } from "../server/forest-rituals";
import "./forest-ritual.css";

const SYMBOLS = ["☽", "✦", "◇", "❋"];
const NAMES = ["Moon", "Star", "Diamond", "Flower"];
export function ForestRitual({ challenge, onSubmit }: { challenge: RitualChallenge; onSubmit: (answer: number[]) => void }) {
  const memory = challenge.kind === "FIREFLY";
  const points = [...(challenge.cells ?? []), ...(challenge.entry ? [challenge.entry] : []), ...(challenge.exit ? [challenge.exit] : [])];
  const minX = Math.min(...points.map(point => point.x)), minY = Math.min(...points.map(point => point.y));
  const cellStyle = (point: { x: number; y: number }) => ({ gridColumn: point.x - minX + 1, gridRow: point.y - minY + 1 });
  const [values, setValues] = useState<number[]>(() => memory ? [] : [...challenge.initial]);
  const [showMemory, setShowMemory] = useState(memory);
  const [submitted, setSubmitted] = useState(false);
  const [remainingMs, setRemainingMs] = useState(challenge.minimumMs ?? 0);
  useEffect(() => {
    if (!challenge.minimumMs) return;
    const endsAt = performance.now() + challenge.minimumMs;
    const timer = window.setInterval(() => {
      const left = Math.max(0, endsAt - performance.now());
      setRemainingMs(left);
      if (!left) window.clearInterval(timer);
    }, 100);
    return () => window.clearInterval(timer);
  }, [challenge.id, challenge.minimumMs]);
  useEffect(() => {
    if (!memory || !showMemory) return;
    const timer = window.setTimeout(() => setShowMemory(false), challenge.target.length * 900 + 1200);
    return () => window.clearTimeout(timer);
  }, [memory, showMemory, challenge.target.length]);
  const submit = () => { if (!submitted && remainingMs <= 0) { setSubmitted(true); onSubmit(values); } };
  return <div className="forest-ritual">
    <p>{memory ? "Remember the fireflies from left to right, then repeat their symbols. Replay if needed." : challenge.kind === "ROOT" ? "Turn the roots to connect the spring (≈) to the flower (❋). All roots must join; then Activate." : "Turn each moon ring to match the symbol above it, then Activate."}</p>
    <div className={`ritual-pieces ${challenge.cells ? "root-board" : ""}`} aria-label={memory ? "Firefly sequence" : "Ritual pieces"}>
      {challenge.entry && <span className="root-endpoint" style={cellStyle(challenge.entry)} aria-label="Spring">≈</span>}
      {challenge.exit && <span className="root-endpoint" style={cellStyle(challenge.exit)} aria-label="Flower">❋</span>}
      {challenge.target.map((target, index) => memory ? <span key={index} className="firefly-memory" aria-label={showMemory ? `Step ${index + 1}: ${NAMES[target]}` : `Step ${index + 1}: ${values[index] === undefined ? "empty" : NAMES[values[index]]}`}>
        <small>{index + 1}</small>{showMemory ? SYMBOLS[target] : values[index] === undefined ? "·" : SYMBOLS[values[index]]}
      </span> : <button type="button" key={index} style={challenge.cells ? cellStyle(challenge.cells[index]) : undefined} disabled={submitted} onClick={() => setValues(current => current.map((value, i) => i === index ? (value + 1) % 4 : value))} aria-label={challenge.kind === "ROOT" ? `Root ${index + 1}: ${["left and up", "up and right", "right and down", "down and left"][values[index]]}. Rotate clockwise.` : `Ring ${index + 1}: ${NAMES[values[index]]}; target ${NAMES[target]}`}>
        {challenge.kind === "ROOT" ? <svg viewBox="0 0 64 64" aria-hidden="true">{challenge.difficulty === "STANDARD" && <path className="root-guide" d="M 0 32 H 32 V 0" transform={`rotate(${target * 90} 32 32)`} />}<path d="M 0 32 H 32 V 0" transform={`rotate(${values[index] * 90} 32 32)`} /></svg> : <><small>{SYMBOLS[target]}</small><b>{SYMBOLS[values[index]]}</b></>}
      </button>)}
    </div>
    {memory ? <div className="ritual-memory-input" aria-label="Repeat the fireflies">{SYMBOLS.map((symbol, index) => <button type="button" key={index} aria-label={`Add ${NAMES[index]}`} disabled={showMemory || submitted || values.length >= challenge.target.length} onClick={() => setValues(current => [...current, index])}>{symbol}</button>)}</div> : null}
    <div className="ritual-actions">
      {memory ? <><button type="button" disabled={submitted} onClick={() => { setValues([]); setShowMemory(true); }}>Replay</button><button type="button" disabled={submitted || !values.length} onClick={() => setValues(current => current.slice(0, -1))}>Undo</button></> : null}
      <button type="button" className="ritual-activate" disabled={submitted || remainingMs > 0 || (memory && (showMemory || values.length !== challenge.target.length))} onClick={submit}>{submitted ? "Attuning…" : remainingMs > 0 ? `Bloom in ${(remainingMs / 1000).toFixed(1)}s` : "Activate"}</button>
    </div>
    <small>One submitted answer. A mistake ends this attempt; the next ritual changes.</small>
    {challenge.minimumMs ? <small>Overgrown shrine · stay exposed for 3s · audible nearby · first Warden bloom this cycle earns +1.5%.</small> : null}
  </div>;
}
