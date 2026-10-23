import type { Phase } from "./game-types";

export const EMERGENCY_COOLDOWN_SECONDS = 60;
export type EmergencyMeetingState = { firstOrdealComplete: boolean; cooldownRemaining: number };
export const initialEmergencyState = (): EmergencyMeetingState => ({ firstOrdealComplete: false, cooldownRemaining: 0 });

/** Shared match-wide bell state. Only active gameplay consumes cooldown time. */
export function advanceEmergency(state: EmergencyMeetingState = initialEmergencyState(), seconds: number, phase: Phase): EmergencyMeetingState {
  if (phase === "DISCUSSION" || !Number.isFinite(seconds) || seconds <= 0) return state;
  return { ...state, cooldownRemaining: Math.max(0, state.cooldownRemaining - seconds) };
}

export function finishFirstOrdeal(state: EmergencyMeetingState = initialEmergencyState()): EmergencyMeetingState {
  return { ...state, firstOrdealComplete: true };
}

export function afterMeeting(state: EmergencyMeetingState = initialEmergencyState()): EmergencyMeetingState {
  return { ...state, cooldownRemaining: EMERGENCY_COOLDOWN_SECONDS };
}

export function reportAvailability({ emergency = initialEmergencyState(), phase, alive, nearbyBody, nearBell, blocked = false }: {
  emergency?: EmergencyMeetingState;
  phase: Phase;
  alive: boolean;
  nearbyBody: boolean;
  nearBell: boolean;
  blocked?: boolean;
}) {
  const cooldown = Math.ceil(Math.max(0, emergency.cooldownRemaining));
  const bodyException = " Nearby puddles can always be reported.";
  if (!alive) return { allowed: false, label: "Report", hint: "Spectators cannot report puddles or call meetings." };
  if (blocked || phase === "DISCUSSION") return { allowed: false, label: "Report", hint: "Finish the current meeting or interaction first." };
  // Finding a body takes priority over every emergency-bell restriction.
  if (nearbyBody) return { allowed: true, label: "Report", hint: "Report the nearby jelly puddle. Bell cooldown does not apply." };
  if (!emergency.firstOrdealComplete) return { allowed: false, label: "Locked", hint: `The emergency bell unlocks after the first Ordeal ends.${bodyException}` };
  if (cooldown > 0) return { allowed: false, label: `${cooldown}s`, hint: `Emergency bell recharging: ${cooldown}s remaining.${bodyException}` };
  if (phase !== "CALM") return { allowed: false, label: "Calm only", hint: `The emergency bell can only be rung during Calm.${bodyException}` };
  if (!nearBell) return { allowed: false, label: "Meeting", hint: `Approach the bell in Warden Courtyard to call a meeting.${bodyException}` };
  return { allowed: true, label: "Meeting", hint: "Ring the emergency bell. A shared 60-second cooldown begins when the meeting ends." };
}
