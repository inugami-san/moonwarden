import test from "node:test";
import assert from "node:assert/strict";
import { slimeSkin } from "../app/slime-art.ts";

test("moonlit slime material is brighter without changing concealed skins or cache isolation", () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const canvases = [];
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement(tag) {
        assert.equal(tag, "canvas");
        const gradients = [];
        const gradient = () => {
          const stops = new Map();
          gradients.push(stops);
          return { addColorStop: (position, color) => stops.set(position, color) };
        };
        const ctx = new Proxy({ createLinearGradient: gradient, createRadialGradient: gradient }, {
          get: (target, key) => target[key] ?? (() => {}),
        });
        const canvas = { gradients, getContext: () => ctx };
        canvases.push(canvas);
        return canvas;
      },
    },
  });
  try {
    const moonlit = slimeSkin("#54dbef");
    const concealed = slimeSkin("#54dbef", false);
    assert.notEqual(moonlit, concealed);
    assert.equal(slimeSkin("#54dbef", true), moonlit);
    assert.equal(slimeSkin("#54dbef", false), concealed);
    assert.equal(canvases.length, 2, "both materials are baked just once");

    // These are the pre-existing Fog/Blackout material values.
    assert.equal(concealed.gradients[0].get(0), "rgba(164,186,195,.76)");
    assert.equal(concealed.gradients[0].get(1), "rgba(12,29,39,.96)");
    assert.equal(concealed.gradients[1].get(1), "rgba(3,17,28,.57)");

    const channels = (color) => color.match(/[\d.]+/g).map(Number);
    const normalMidtone = channels(moonlit.gradients[0].get(0.46));
    const hiddenMidtone = channels(concealed.gradients[0].get(0.46));
    for (let channel = 0; channel < 3; channel++) {
      assert.ok(normalMidtone[channel] > hiddenMidtone[channel]);
    }
    assert.ok(normalMidtone[3] > hiddenMidtone[3]);
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else delete globalThis.document;
  }
});
