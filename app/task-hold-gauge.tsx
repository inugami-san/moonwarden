import { TASK_HOLD_SECONDS } from "./task-hold";

export function TaskHoldGauge({ progress, holding }: { progress: number; holding: boolean }) {
  const value = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const remaining = Math.max(0, Math.ceil((TASK_HOLD_SECONDS * (1 - value) - 1e-9) * 10) / 10);
  return (
    <div className="ritual-hold-gauge">
      <div><span>{holding ? `Attuning · ${Math.round(value * 100)}%` : "Hold E or hold the button"}</span><b>{remaining.toFixed(1)}s</b></div>
      <progress max={1} value={value} aria-label="Shrine ritual progress" aria-valuetext={`${Math.round(value * 100)} percent, ${remaining.toFixed(1)} seconds remaining`} />
    </div>
  );
}
