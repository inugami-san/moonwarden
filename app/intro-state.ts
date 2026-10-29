import { TASK_HOLD_SECONDS } from "./task-hold";

/** A browser-local preference, not an account or a live-match checkpoint. */
export const INTRO_STORAGE_KEY = "moonwarden.first-steps.v1";
export const INTRO_VERSION = 1;
export type FirstStepsDisposition = "complete" | "skipped";
export type FirstStepsSavedState = { version: 1; status: FirstStepsDisposition };
export type IntroStorage = Pick<Storage, "getItem" | "setItem">;

// A denied/full preference store must not reopen the intro during this visit.
// Browser objects are weak keys; SSR never writes shared request state here.
const visitChoices = new WeakMap<object, FirstStepsSavedState>();

function storageContext(storage?: IntroStorage | null) {
  if (storage !== undefined) return { storage, owner: storage };
  if (typeof window === "undefined") return { storage: null, owner: null };
  try { return { storage: window.localStorage, owner: window }; }
  catch { return { storage: null, owner: window }; }
}

function readChoice(context: ReturnType<typeof storageContext>): FirstStepsSavedState | null {
  const remembered = context.owner ? visitChoices.get(context.owner) : undefined;
  if (remembered) return remembered;
  try {
    const saved: unknown = JSON.parse(context.storage?.getItem(INTRO_STORAGE_KEY) ?? "null");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null;
    const state = saved as Record<string, unknown>;
    return state.version === INTRO_VERSION && (state.status === "complete" || state.status === "skipped")
      ? { version: INTRO_VERSION, status: state.status } : null;
  } catch { return null; }
}

export function readFirstStepsState(storage?: IntroStorage | null) {
  return readChoice(storageContext(storage));
}

/** Call after hydration. No browser/storage context means no automatic overlay. */
export function shouldShowFirstSteps(storage?: IntroStorage | null) {
  const context = storageContext(storage);
  return context.owner !== null && readChoice(context) === null;
}

/** React external-store subscription; storage changes never pause a live match. */
export function subscribeFirstSteps(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  const changed = (event: StorageEvent) => { if (event.key === INTRO_STORAGE_KEY || event.key === null) listener(); };
  window.addEventListener("storage", changed);
  return () => window.removeEventListener("storage", changed);
}

function markFirstSteps(status: FirstStepsDisposition, storage?: IntroStorage | null) {
  const context = storageContext(storage);
  if (!context.owner) return false;
  const state: FirstStepsSavedState = { version: INTRO_VERSION, status };
  visitChoices.set(context.owner, state);
  try {
    if (!context.storage) return false;
    context.storage.setItem(INTRO_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch { return false; }
}

/** Returns whether the choice was persisted; dismissal still works on failure. */
export function markFirstStepsComplete(storage?: IntroStorage | null) {
  return markFirstSteps("complete", storage);
}

export function markFirstStepsSkipped(storage?: IntroStorage | null) {
  return markFirstSteps("skipped", storage);
}

export const FIRST_STEPS_START = { x: 23, y: 72 } as const;
export const FIRST_STEPS_SHRINE = { x: 72, y: 33 } as const;
export const FIRST_STEPS_RUNES = ["Crescent", "Half", "Full"] as const;
export type FirstStepsRune = typeof FIRST_STEPS_RUNES[number];
export type FirstStepsStage = "MOVE" | "SHRINE" | "PUZZLE" | "BLACKOUT" | "DONE";
export type FirstStepsProgress = {
  stage: FirstStepsStage;
  x: number;
  y: number;
  distance: number;
  holdSeconds: number;
  holding: boolean;
  puzzleIndex: number;
  puzzleMistakes: number;
  lightEarned: boolean;
  lightUsed: boolean;
};
export type FirstStepsAction =
  | { type: "MOVE"; dx: number; dy: number }
  | { type: "HOLD_SHRINE"; held: boolean; seconds: number }
  | { type: "RUNE"; rune: FirstStepsRune }
  | { type: "USE_LIGHT" };

export function createFirstStepsProgress(): FirstStepsProgress {
  return { stage: "MOVE", ...FIRST_STEPS_START, distance: 0, holdSeconds: 0, holding: false, puzzleIndex: 0, puzzleMistakes: 0, lightEarned: false, lightUsed: false };
}

export function isNearFirstStepsShrine(position: { x: number; y: number }) {
  return Math.hypot(position.x - FIRST_STEPS_SHRINE.x, position.y - FIRST_STEPS_SHRINE.y) <= 15;
}

/** Local-only lesson rules. Nothing here starts, joins, or mutates a match. */
export function firstStepsReducer(state: FirstStepsProgress, action: FirstStepsAction): FirstStepsProgress {
  switch (action.type) {
    case "MOVE": {
      if ((state.stage !== "MOVE" && state.stage !== "SHRINE") || !Number.isFinite(action.dx) || !Number.isFinite(action.dy)) return state;
      const x = Math.min(92, Math.max(8, state.x + action.dx));
      const y = Math.min(83, Math.max(17, state.y + action.dy));
      const travelled = Math.hypot(x - state.x, y - state.y);
      if (!travelled) return state;
      const distance = state.distance + travelled;
      const near = isNearFirstStepsShrine({ x, y });
      return { ...state, x, y, distance, stage: distance >= 12 ? "SHRINE" : "MOVE", holdSeconds: near ? state.holdSeconds : 0, holding: near && state.holding };
    }
    case "HOLD_SHRINE": {
      if (state.stage !== "SHRINE") return state;
      if (!action.held || !isNearFirstStepsShrine(state)) return state.holdSeconds || state.holding ? { ...state, holdSeconds: 0, holding: false } : state;
      if (!Number.isFinite(action.seconds) || action.seconds < 0) return state;
      const holdSeconds = Math.min(TASK_HOLD_SECONDS, state.holdSeconds + action.seconds);
      return holdSeconds >= TASK_HOLD_SECONDS
        ? { ...state, stage: "PUZZLE", holdSeconds: 0, holding: false }
        : { ...state, holdSeconds, holding: true };
    }
    case "RUNE": {
      if (state.stage !== "PUZZLE") return state;
      if (action.rune !== FIRST_STEPS_RUNES[state.puzzleIndex]) return { ...state, puzzleIndex: 0, puzzleMistakes: state.puzzleMistakes + 1 };
      const puzzleIndex = state.puzzleIndex + 1;
      return { ...state, puzzleIndex, stage: puzzleIndex === FIRST_STEPS_RUNES.length ? "BLACKOUT" : "PUZZLE", lightEarned: puzzleIndex === FIRST_STEPS_RUNES.length };
    }
    case "USE_LIGHT":
      return state.stage === "BLACKOUT" && state.lightEarned ? { ...state, stage: "DONE", lightUsed: true } : state;
    default:
      return state;
  }
}
