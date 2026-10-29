import { PAIR_RITUAL_SECONDS } from "../server/pair-ritual";

export type HarmonizeInvitationState = {
  /** Only the local player's own duet intent, never inferred from nearby actors. */
  participating: boolean;
  /** Private, server-confirmed count for the local participant's duet only. */
  participants?: number;
  /** Already resolved locally; do not pass a participant ID into the renderer. */
  yourTurn?: boolean;
  rune?: number;
  beats?: number;
};

const TAU = Math.PI * 2;
const READY_LABELS = ["0/2 READY · H TO LEAVE", "1/2 READY · H TO LEAVE", "2/2 READY · H TO LEAVE"] as const;
const RISK_LABEL = `${PAIR_RITUAL_SECONDS}s MIN · AUDIBLE NEARBY`;
const TURN_LABELS = ["YOUR TURN · SUN J", "YOUR TURN · MOON K"] as const;

/** Presentation extents relative to the shrine; not interaction or collision bounds. */
export const HARMONIZE_INVITATION_BOUNDS = Object.freeze({ left: -76, top: 22, right: 76, bottom: 74 });

function drawPad(ctx: CanvasRenderingContext2D, x: number, moon: boolean, occupied: boolean, current: boolean, pulse: number) {
  ctx.save();
  // The pads are schematic places for two voices, not moving actor markers or
  // mandatory standing positions. Both use the same role-neutral moonstone.
  ctx.fillStyle = "#15242c";
  ctx.strokeStyle = occupied ? "#e5dcc0" : "#a5b6b3";
  ctx.lineWidth = occupied ? 1.8 : 1.2;
  ctx.beginPath(); ctx.ellipse(x, 37, 16, 8.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = occupied ? "#344d53" : "#263a41";
  ctx.beginPath(); ctx.ellipse(x, 34, 15, 7.2, 0, 0, TAU); ctx.fill();

  if (!occupied || current) {
    ctx.save();
    ctx.globalAlpha *= current ? .9 : .24 + pulse * .22;
    ctx.strokeStyle = "#f2e7c9"; ctx.lineWidth = current ? 2 : 1;
    ctx.beginPath(); ctx.ellipse(x, 35, 19, 10, 0, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  ctx.strokeStyle = "#e5dcc0"; ctx.fillStyle = "#e5dcc0"; ctx.lineWidth = 1.3;
  if (moon) {
    // A carved crescent rather than a font glyph, consistent across devices.
    ctx.beginPath(); ctx.moveTo(x + 3, 29);
    ctx.bezierCurveTo(x - 6, 27, x - 8, 37, x + 2, 38);
    ctx.bezierCurveTo(x - 2, 35, x - 2, 31, x + 3, 29); ctx.fill();
  } else {
    ctx.beginPath(); ctx.ellipse(x, 33, 3.4, 2.4, 0, 0, TAU); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 7, 33); ctx.lineTo(x - 5, 33);
    ctx.moveTo(x + 5, 33); ctx.lineTo(x + 7, 33);
    ctx.moveTo(x, 28); ctx.lineTo(x, 29);
    ctx.moveTo(x, 37); ctx.lineTo(x, 38);
    ctx.moveTo(x - 5, 29); ctx.lineTo(x - 4, 30);
    ctx.moveTo(x + 4, 36); ctx.lineTo(x + 5, 37);
    ctx.moveTo(x + 5, 29); ctx.lineTo(x + 4, 30);
    ctx.moveTo(x - 4, 36); ctx.lineTo(x - 5, 37); ctx.stroke();
  }

  // Filled pips distinguish occupied places without relying on color alone.
  ctx.beginPath(); ctx.arc(x, 44, 2, 0, TAU);
  if (occupied) ctx.fill(); else ctx.stroke();
  ctx.restore();
}

/**
 * A small, ground-level invitation for a visible, reachable local shrine.
 * The caller must gate it on the ordinary task prompt and physical sight
 * (without private Moon Sight), and paint before lighting/Rootwake masks.
 * No roster, identity, role, remote intent, interaction, or audio is inspected.
 * Uses fixed paths and colors: no gradients, canvas creation, or frame caches.
 */
export function drawHarmonizeInvitation(
  ctx: CanvasRenderingContext2D,
  station: Readonly<{ x: number; y: number }>,
  state: Readonly<HarmonizeInvitationState>,
  elapsed: number,
  reducedMotion = false,
) {
  if (!Number.isFinite(station.x) || !Number.isFinite(station.y)) return;
  const count = state.participating && Number.isFinite(state.participants)
    ? Math.max(0, Math.min(2, Math.floor(state.participants!))) : 0;
  const notesComplete = Number.isFinite(state.beats) && state.beats! >= 4;
  const activeRune = state.participating && count === 2 && !notesComplete && (state.rune === 0 || state.rune === 1) ? state.rune : -1;
  const pulse = reducedMotion || !Number.isFinite(elapsed) ? .5 : .5 + Math.sin(elapsed * 2) * .5;
  const title = state.participating ? READY_LABELS[count] : "H · JOIN DUET";
  const detail = !state.participating ? RISK_LABEL
    : count < 2 ? "COMPANION WELCOME · AUDIBLE"
    : notesComplete ? "HOLD STILL · AUDIBLE NEARBY"
    : activeRune >= 0 && state.yourTurn === true ? TURN_LABELS[activeRune === 0 ? 0 : 1]
    : activeRune >= 0 && state.yourTurn === false ? "COMPANION'S TURN · LISTEN"
    : "TAKE TURNS · AUDIBLE NEARBY";

  ctx.save(); ctx.translate(station.x, station.y);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = "#a5b6b366"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-18, 36); ctx.quadraticCurveTo(0, 43, 18, 36); ctx.stroke();
  drawPad(ctx, -39, false, count > 0, activeRune === 0, pulse);
  drawPad(ctx, 39, true, count > 1, activeRune === 1, pulse);

  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.font = "800 9px ui-monospace, monospace";
  ctx.strokeStyle = "#101d27"; ctx.lineWidth = 3.5; ctx.fillStyle = "#f0e5c9";
  ctx.strokeText(title, 0, 59); ctx.fillText(title, 0, 59);
  ctx.font = "600 8px ui-monospace, monospace"; ctx.fillStyle = "#d4ded3";
  ctx.strokeText(detail, 0, 71); ctx.fillText(detail, 0, 71);
  ctx.restore();
}
