"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ForestAudio } from "../../forest-audio";
import { matchVictory, type MatchVictory } from "../../match-victory";
import { VictoryOverlay } from "../../victory-overlay";

export function VictoryPreview() {
  const [victory, setVictory] = useState<MatchVictory | null>(null);
  const [still, setStill] = useState(false);
  const [sound, setSound] = useState(true);
  const audio = useRef<ForestAudio | null>(null);
  useEffect(() => () => { audio.current?.destroy(); }, []);
  const play = (hollow: boolean) => {
    audio.current ??= new ForestAudio();
    audio.current.enabled = sound;
    void audio.current.unlock();
    setVictory(matchVictory(hollow ? "IMPOSTOR VICTORY — CREW AT PARITY" : "CREW VICTORY — ALL MOON WARDS RESTORED",
      { role: hollow ? "IMPOSTOR" : "CREWMATE", color: hollow ? "#a78ad9" : "#83d7d3", hat: hollow ? "mooncap" : "antlers", eyeStyle: hollow ? "FIERCE" : "JOYFUL" }));
  };
  return (
    <main className="victory-preview">
      <div>
        <small>LOCAL ART REVIEW · NO MATCH IS STARTED</small>
        <h1>The forest remembers.</h1>
        <p>Preview both final-match celebrations. Skip settles the scene; Return brings you here.</p>
        <label><input type="checkbox" checked={still} onChange={event => setStill(event.target.checked)} /> Still / reduced-motion ending</label>
        <label><input type="checkbox" checked={sound} onChange={event => setSound(event.target.checked)} /> Sound effects</label>
        <button type="button" onClick={() => play(false)}>Preview Warden victory</button>
        <button type="button" onClick={() => play(true)}>Preview Hollow victory</button>
        <Link href="/">Back to Moonwarden</Link>
      </div>
      {victory && <VictoryOverlay victory={victory} reducedMotion={still}
        onCelebrate={kind => { audio.current?.celebration(kind); }} onExit={() => setVictory(null)} />}
    </main>
  );
}
