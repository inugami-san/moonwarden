"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ForestAudio } from "../../forest-audio";
import { matchVictory, type MatchVictory } from "../../match-victory";
import { VictoryOverlay } from "../../victory-overlay";
import { RoleReveal } from "../../role-reveal";
import { BanishmentOverlay } from "../../banishment-overlay";
import { banishmentOutcome, type BanishmentOutcome } from "../../banishment";
import { ejectionVerdict } from "../../../server/role-presentation";
import type { Role } from "../../../server/game-types";
import "../../role-reveal.css";

export function VictoryPreview() {
  const [victory, setVictory] = useState<MatchVictory | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [banishment, setBanishment] = useState<BanishmentOutcome | null>(null);
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
  const previewVote = (hollow: boolean) => {
    const candidate = { id: "preview-cat", name: "Mochi", color: hollow ? "#a78ad9" : "#83d7d3", hat: "moonbell" as const, eyeStyle: "JOYFUL" as const };
    setBanishment(banishmentOutcome({ key: `preview-${Date.now()}`, ejectedId: candidate.id,
      verdict: ejectionVerdict(candidate.name, hollow ? "IMPOSTOR" : "CREWMATE"), candidates: [candidate],
      tally: [{ targetId: candidate.id, targetName: candidate.name, targetColor: candidate.color }] }));
  };
  return (
    <main className="victory-preview">
      <div className="victory-preview-controls">
        <small>LOCAL ART REVIEW · NO MATCH IS STARTED</small>
        <h1>The forest remembers.</h1>
        <p>Review role reveals, vote-outs and endings without starting a match.</p>
        <label><input type="checkbox" checked={still} onChange={event => setStill(event.target.checked)} /> Still / reduced-motion ending</label>
        <label><input type="checkbox" checked={sound} onChange={event => setSound(event.target.checked)} /> Sound effects</label>
        <button type="button" onClick={() => play(false)}>Preview Warden victory</button>
        <button type="button" onClick={() => play(true)}>Preview Hollow victory</button>
        <button type="button" onClick={() => setRole("CREWMATE")}>Preview Warden reveal</button>
        <button type="button" onClick={() => setRole("IMPOSTOR")}>Preview Hollow reveal</button>
        <button type="button" onClick={() => previewVote(false)}>Preview Warden farewell</button>
        <button type="button" onClick={() => previewVote(true)}>Preview Hollow banishment</button>
        <Link href="/">Back to Moonwarden</Link>
      </div>
      {victory && <VictoryOverlay victory={victory} reducedMotion={still}
        onCelebrate={kind => { audio.current?.celebration(kind); }} onExit={() => setVictory(null)} />}
      {role && <RoleReveal role={role} color="#83d7d3" onContinue={() => setRole(null)} />}
      {banishment && <BanishmentOverlay outcome={banishment} reducedMotion={still} onComplete={() => setBanishment(null)} />}
    </main>
  );
}
