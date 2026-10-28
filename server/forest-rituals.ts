export type RitualKind = "ROOT" | "MOON" | "FIREFLY";
export type RitualDifficulty = "STANDARD" | "CHALLENGING";
export type RitualChallenge = {
  id: string; kind: RitualKind; difficulty: RitualDifficulty;
  initial: number[]; target: number[];
  minimumMs?: number;
  cells?: { x: number; y: number }[];
  entry?: { x: number; y: number };
  exit?: { x: number; y: number };
};
export const RITUAL_LABELS: Record<RitualKind, string> = { ROOT: "Root weaving", MOON: "Moon alignment", FIREFLY: "Firefly memory" };
export function normalizeDifficulty(value: unknown): RitualDifficulty { return value === "CHALLENGING" ? value : "STANDARD"; }
export function createRitual(kind: RitualKind, difficulty: RitualDifficulty, seed: number, attempt: number): RitualChallenge {
  let state = (seed + attempt * 7919) >>> 0;
  const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state >>> 16; };
  const count = kind === "MOON" ? (difficulty === "STANDARD" ? 2 : 3) : (difficulty === "STANDARD" ? 3 : 5);
  const target = Array.from({ length: count }, () => next() % 4);
  // Guarantee a different first symbol/connection on the next attempt, even if
  // random seeds repeat. Each station has its own monotonically increasing attempt.
  target[0] = attempt % 4;
  let cells: RitualChallenge["cells"], entry: RitualChallenge["entry"], exit: RitualChallenge["exit"];
  if (kind === "ROOT") {
    // A connected staircase, rotated as a whole each attempt. Every tile is
    // an elbow: its two open ends must meet its neighbours, spring and flower.
    const turn = attempt % 4;
    const rotate = (point: { x: number; y: number }) => {
      let { x, y } = point;
      for (let n = 0; n < turn; n++) [x, y] = [2 - y, x];
      return { x, y };
    };
    cells = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }].slice(0, count).map(rotate);
    entry = rotate({ x: 0, y: -1 });
    exit = rotate(difficulty === "STANDARD" ? { x: 2, y: 1 } : { x: 3, y: 2 });
    for (let i = 0; i < count; i++) target[i] = ((i % 2 ? 3 : 1) + turn) % 4;
  }
  const initial = target.map(value => (value + 1 + next() % 3) % 4);
  return { id: `${seed >>> 0}-${attempt}`, kind, difficulty, initial, target, ...(cells ? { cells, entry, exit } : {}) };
}
export function ritualAnswerIsCorrect(challenge: RitualChallenge, answer: unknown): boolean {
  return Array.isArray(answer) && answer.length === challenge.target.length
    && answer.every((value, index) => Number.isInteger(value) && value === challenge.target[index]);
}
