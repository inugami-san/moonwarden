/** Stable public IDs shared by the wardrobe, client transport and room server. */
export const HAT_IDS = [
  "moonbell", "leafband", "starlock", "mothbow",
  "antlers", "hood", "moth", "mooncap",
  "dewdrop", "fernwrap", "mushroom",
] as const;

export type Hat = typeof HAT_IDS[number];
export type AccessoryKind = "COLLAR" | "HEADWEAR";
export type HatMetadata = Readonly<{ label: string; title: string; kind: AccessoryKind }>;

export const HAT_METADATA: Readonly<Record<Hat, HatMetadata>> = Object.freeze({
  moonbell: { label: "MOONBELL", title: "Moonbell Collar", kind: "COLLAR" },
  leafband: { label: "LEAF BAND", title: "Woodland Bandana", kind: "COLLAR" },
  starlock: { label: "STARLOCK", title: "Starlight Collar", kind: "COLLAR" },
  mothbow: { label: "MOTH BOW", title: "Moonmoth Bow", kind: "COLLAR" },
  antlers: { label: "ANTLERS", title: "Elder Bough", kind: "HEADWEAR" },
  hood: { label: "HOOD", title: "Nightveil", kind: "HEADWEAR" },
  moth: { label: "MOTH", title: "Lunar Crest", kind: "HEADWEAR" },
  mooncap: { label: "MOONCAP", title: "Star Point", kind: "HEADWEAR" },
  dewdrop: { label: "DEWDROP", title: "Dewdrop Pendant", kind: "COLLAR" },
  fernwrap: { label: "FERN SCARF", title: "Fern Scarf", kind: "COLLAR" },
  mushroom: { label: "MUSHROOM", title: "Mushroom Cap", kind: "HEADWEAR" },
});

/** Short alias for UI selectors; both exports refer to the same catalog. */
export const HAT_META = HAT_METADATA;
export const DEFAULT_HAT: Hat = "moonbell";

export function isHat(value: unknown): value is Hat {
  return typeof value === "string" && HAT_IDS.some(hat => hat === value);
}

export function normalizeHat(value: unknown, fallback: Hat = DEFAULT_HAT): Hat {
  return isHat(value) ? value : isHat(fallback) ? fallback : DEFAULT_HAT;
}
