import { SlimePortrait } from "./slime-portrait";

/** Victim-only replay; plays once, then rests on the killer's portrait. */
export function ConsumptionPortrait({ killerColor, victimColor }: { killerColor: string; victimColor: string }) {
  return <div className="consumption-portrait" aria-hidden="true" style={{ "--killer-color": killerColor, "--victim-color": victimColor } as React.CSSProperties}>
    <div className="consumption-ring" />
    <div className="consumption-prey"><SlimePortrait color={victimColor} eyeStyle="ROUND" /></div>
    <div className="consumption-predator"><SlimePortrait color={killerColor} eyeStyle="FIERCE" /><span className="consumption-core" /></div>
    <div className="consumption-veil" />
    <div className="consumption-motes"><i /><i /><i /></div>
  </div>;
}
