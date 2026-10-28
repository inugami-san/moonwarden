"use client";

import type { EyeStyle } from "../server/appearance";
import type { Hat } from "../server/game-types";
import { SlimePortrait } from "./cat-portrait";

/** A wardrobe owns its preview; it must not depend on the home stage's visibility. */
export function WardrobePreview({ color, eyeStyle, accessory, name, animated, greeting, onGreet, onRandomize }: {
  color: string; eyeStyle: EyeStyle; accessory: Hat; name: string;
  animated: boolean; greeting: boolean; onGreet: () => void; onRandomize: () => void;
}) {
  return <aside className="wardrobe-preview" aria-label="Live character preview">
    <div className="wardrobe-preview-heading"><small><i /> Live preview</small><button type="button" className="wardrobe-shuffle" onClick={onRandomize} title="Randomize Warden Identity">🎲 Random</button></div>
    <div className="wardrobe-preview-moon" aria-hidden="true" />
    <div className="wardrobe-preview-ground" aria-hidden="true" />
    <button type="button" className="wardrobe-cat-button" aria-label={`Say hello to ${name}`} onClick={onGreet}>
      <span className="wardrobe-portrait-frame"><SlimePortrait color={color} eyeStyle={eyeStyle} accessory={accessory} pose="SEATED" animated={animated} greeting={greeting} /></span>
    </button>
    <p className="wardrobe-preview-hint">Made for moonlit mischief.<span>Tap your cat to say hello</span></p>
  </aside>;
}
