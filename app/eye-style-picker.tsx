import { EYE_STYLES, type EyeStyle } from "../server/appearance";
import { EYE_LABELS, eyePath } from "./cat-eyes";

export function EyeStylePicker({ value, onChange }: { value: EyeStyle; onChange: (style: EyeStyle) => void }) {
  return (
    <fieldset className="eye-customizer">
      <legend>EYE SHAPE <span>{EYE_LABELS[value]}</span></legend>
      <div className="eye-style-options" role="group" aria-label="Eye shape">
        {EYE_STYLES.map(style => (
          <button type="button" key={style} aria-label={`${EYE_LABELS[style]} eyes`} aria-pressed={style === value} onClick={() => onChange(style)}>
            <svg viewBox="-24 -7 48 29" aria-hidden="true" focusable="false"><path d={eyePath(style)} fill="currentColor" /></svg>
            <span>{EYE_LABELS[style]}</span>
          </button>
        ))}
      </div>
      <p>Cosmetic only. Hidden when an Ordeal conceals your identity.</p>
    </fieldset>
  );
}
