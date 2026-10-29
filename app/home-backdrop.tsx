import type { CSSProperties } from "react";

/** Static painted scenery; only a small number of compositor-friendly spores move. */
export function MenuGroveBackdrop() {
  return <div className="menu-grove-backdrop" aria-hidden="true">
    <picture className="menu-grove-painting"><img src="/art/forest/menu-grove-v1.webp" width={1672} height={941} alt="" fetchPriority="high" decoding="async" /></picture>
    <div className="menu-grove-shade" />
    <div className="menu-grove-mist"><i /><i /></div>
    <div className="menu-grove-spores">{Array.from({ length: 14 }, (_, index) => <i key={index} style={{
      "--spore-x": `${8 + (index * 29) % 87}%`,
      "--spore-y": `${18 + (index * 17) % 75}%`,
      "--spore-delay": `${index * -1.7}s`,
      "--spore-duration": `${12 + index % 5 * 2}s`,
    } as CSSProperties} />)}</div>
  </div>;
}
