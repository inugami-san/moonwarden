import { useEffect, useState, type CSSProperties } from "react";
import { MEETING_DISCUSSION_MS } from "../server/match-rules";
import type { EyeStyle } from "../server/appearance";
import { CatHead } from "./cat-head";

export type MeetingCandidate = { id: string; name: string; color: string; eyeStyle?: EyeStyle; alive: boolean };
export type TallyEntry = { targetId: string | null; targetName: string; targetColor?: string | null; targetEyeStyle?: EyeStyle; votes: number; isTop: boolean };

/** A wall-clock deadline keeps the countdown accurate after backgrounding a WebView. */
export function useDiscussionCountdown(opensAt: number | undefined, maximumSeconds = MEETING_DISCUSSION_MS / 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!opensAt) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(previous => Math.ceil((opensAt - previous) / 1000) === Math.ceil((opensAt - current) / 1000) ? previous : current);
      if (current >= opensAt) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [opensAt]);
  return opensAt ? Math.max(0, Math.min(maximumSeconds, Math.ceil((opensAt - now) / 1000))) : 0;
}

export function VoteRoster({ candidates, localPlayerId, alive, locked, discussing = false, onVote }: {
  candidates: readonly MeetingCandidate[]; localPlayerId: string; alive: boolean; locked: boolean; discussing?: boolean; onVote: (id: string) => void;
}) {
  return <div className="vote-grid" aria-label="All players">
    {candidates.map((player, index) => {
      const isYou = player.id === localPlayerId;
      return <button key={player.id} title={player.name} data-alive={player.alive} style={{ "--card-idx": index } as CSSProperties}
        disabled={!player.alive || isYou || !alive || locked || discussing} onClick={() => onVote(player.id)}>
        <span className="vote-slime"><CatHead color={player.alive ? player.color : "#53616b"} eyeStyle={player.eyeStyle} /></span>
        <b>{player.name}</b><small>{player.alive ? isYou ? "YOU" : discussing ? "DISCUSS" : "VOTE" : "ELIMINATED"}</small>
      </button>;
    })}
  </div>;
}

export function TallyRoster({ tally, ejectedId, tied }: { tally: readonly TallyEntry[]; ejectedId?: string | null; tied?: boolean }) {
  return <div className="tally-grid" aria-label="Vote totals by player">
    {tally.map((entry, index) => <div key={entry.targetId || "SKIP"} title={entry.targetName}
      className={`tally-card ${entry.isTop ? "top-tally" : ""} ${entry.targetId === ejectedId && entry.targetId ? "ejected" : ""} ${entry.targetId ? "" : "skip-tally"}`}
      style={{ "--card-idx": index } as CSSProperties}>
      <b className="tally-name">{entry.targetName}</b>
      {entry.targetColor ? <span className="tally-slime"><CatHead color={entry.targetColor} eyeStyle={entry.targetEyeStyle} /></span> : <span className="tally-skip-mark">—</span>}
      <strong>{entry.votes}</strong><small>{entry.votes === 1 ? "VOTE" : "VOTES"}</small>
      {entry.targetId && entry.targetId === ejectedId ? <span className="tally-status">BANISHED</span> : !ejectedId && tied && entry.isTop && entry.votes > 0 ? <span className="tally-status">TIED</span> : null}
    </div>)}
  </div>;
}
