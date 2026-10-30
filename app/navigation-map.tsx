"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ROOM, SANCTUARY_TRAILS, WORLD_HEIGHT, WORLD_WIDTH } from "../server/sanctuary-map";
import { mapTitle, navigationStationState, navigationView, type NavigationStation, type NavigationView } from "./navigation-data";
import "./navigation-map.css";

export type NavigationMapProps = {
  layoutSeed?: number;
  position: { x: number; y: number };
  phase: string;
  hazard: string;
  stations: readonly NavigationStation[];
  destinationId: string | null;
  onDestinationChange: (id: string) => void;
  enabled: boolean;
  onExpandedChange?: (open: boolean) => void;
};

function MapIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Z M9 3v16 M15 5v16" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>;
}

function ForestDiagram({ view, id, expanded = false }: { view: NavigationView; id: string; expanded?: boolean }) {
  const { cell, rootLocked } = view;
  return (
    <svg className={`forest-map-diagram${expanded ? " is-expanded" : ""}`} viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}-floor`}><stop offset="0" stopColor="#4c647c" /><stop offset="1" stopColor="#263c54" /></radialGradient>
        <clipPath id={`${id}-visible`}><rect x={cell?.x ?? ROOM.left} y={cell?.y ?? ROOM.top} width={cell?.w ?? ROOM.right - ROOM.left} height={cell?.h ?? ROOM.bottom - ROOM.top} rx={cell ? 8 : 90} /></clipPath>
      </defs>
      <rect x="45" y="45" width={WORLD_WIDTH - 90} height={WORLD_HEIGHT - 90} rx="130" fill="#14263c" stroke="#839bb8" strokeWidth="8" />
      {rootLocked ? <text x="960" y="1080" textAnchor="middle" className="forest-map-veiled-label">BEYOND YOUR CHAMBER · VEILED BY ROOTS</text> : null}
      <g clipPath={`url(#${id}-visible)`}>
        <rect x={ROOM.left} y={ROOM.top} width={ROOM.right - ROOM.left} height={ROOM.bottom - ROOM.top} fill={`url(#${id}-floor)`} />
        {view.clearings.map(clearing => <ellipse key={clearing.label} cx={clearing.x} cy={clearing.y} rx={clearing.rx} ry={clearing.ry} fill={clearing.color} opacity=".09" />)}
        {view.clearings.map(clearing => <g key={`landmark-${clearing.label}`} transform={`translate(${clearing.x} ${clearing.y - 42})`} stroke={clearing.color} fill="none" strokeWidth="7" opacity=".85">
          {clearing.label === "MOONWELL" ? <><ellipse rx="32" ry="16" /><path d="M-20-14Q0-40 20-14" /></> : clearing.label === "WILLOW GROVE" ? <><path d="M0 22V-22M-34 12Q-36-42 0-34Q36-42 34 12M-18 12Q-22-30 0-34Q22-30 18 12" /></> : clearing.label === "FALLEN SHRINE" ? <><path d="M-30 20V-10Q-30-34-8-34M8-34Q30-34 30-10V6M14 20h24" /></> : <path d="m0-27 8 18 20 9-20 8-8 19-8-19-20-8 20-9Z" />}
        </g>)}
        {SANCTUARY_TRAILS.map((trail, index) => <path key={index} d={`M${trail.points[0]} ${trail.points[1]} C${trail.points.slice(2).join(" ")}`} fill="none" stroke="#a9bca1" strokeWidth={trail.width * .5} opacity=".22" strokeLinecap="round" />)}
        <circle cx="960" cy="573" r="127" fill="#9ebdb1" opacity=".13" stroke="#d3d4b0" strokeWidth="5" />
        {view.shadePockets.map(pocket => <g key={pocket.x}><circle cx={pocket.x} cy={pocket.y} r="96" fill="#718cc0" stroke="#c8e7ff" strokeWidth="5" opacity=".7" /><text x={pocket.x} y={pocket.y + 7} textAnchor="middle" className="forest-map-zone">SHADE</text></g>)}
        {!rootLocked ? <text x="960" y="627" textAnchor="middle" className="forest-map-zone">WARDEN COURTYARD</text> : null}
        {view.clearings.map(clearing => <text key={clearing.label} x={clearing.x} y={clearing.y + (clearing.y < 540 ? 48 : 20)} textAnchor="middle" className="forest-map-zone">{clearing.label}</text>)}
        {view.destination ? <line x1={view.position.x} y1={view.position.y} x2={view.destination.x} y2={view.destination.y} stroke="#f3dba1" strokeWidth="6" strokeDasharray="12 15" opacity=".75" /> : null}
        {view.stations.map(station => <g key={station.id} transform={`translate(${station.x} ${station.y})`}>
          {station.overgrown ? <circle r="70" fill="none" stroke="#f7d995" strokeWidth="6" strokeDasharray="10 7" /> : null}
          {view.destination?.id === station.id ? <circle r="57" fill="none" stroke="#f7d995" strokeWidth="6" /> : null}
          <path d="M0-28 25-6 18 24-18 24-25-6Z" fill={station.personalCompleted ? "#8baba5" : "#e8d39e"} stroke="#153139" strokeWidth="8" />
          {station.teamRestored ? <path d="m-10 0 7 8 15-16" fill="none" stroke="#163e41" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" /> : <circle cy="-1" r="5" fill="#23494b" />}
          {station.personalCompleted ? <path d="M-10 12h20" stroke="#163e41" strokeWidth="5" /> : null}
        </g>)}
      </g>
      {cell ? <rect x={cell.x} y={cell.y} width={cell.w} height={cell.h} rx="8" fill="none" stroke="#ceb987" strokeWidth="12" /> : null}
      <g transform={`translate(${view.position.x} ${view.position.y})`}>
        <circle r="39" fill="#c9f0e9" opacity=".18" />
        <circle r="18" fill="#c8fbef" stroke="#09272d" strokeWidth="7" />
        <circle r="5" fill="#2a5d58" />
      </g>
      <text x="1770" y="106" textAnchor="middle" className="forest-map-north">N ↑</text>
    </svg>
  );
}

export function NavigationMap({ position, phase, hazard, stations, destinationId, layoutSeed, onDestinationChange, enabled, onExpandedChange }: NavigationMapProps) {
  // Keep the forest unobstructed on every screen; the minimap is opt-in.
  const [compactOpen, setCompactOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [previousEnabled, setPreviousEnabled] = useState(enabled);
  // A new gameplay context must not reopen a map left open before a meeting.
  if (previousEnabled !== enabled) {
    setPreviousEnabled(enabled);
    if (!enabled && expanded) setExpanded(false);
  }
  const dialogRef = useRef<HTMLDialogElement>(null);
  const expandedCallback = useRef(onExpandedChange);
  const id = useId().replace(/:/g, "");
  const view = navigationView({ position, phase, hazard, stations, destinationId, layoutSeed });
  const isOpen = enabled && expanded;

  useEffect(() => {
    expandedCallback.current = onExpandedChange;
  }, [onExpandedChange]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  useEffect(() => {
    expandedCallback.current?.(isOpen);
    return () => expandedCallback.current?.(false);
  }, [isOpen]);

  useEffect(() => {
    if (!enabled) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"))) return;
      const mapKey = event.key.toLowerCase() === "m";
      const closeKey = event.key === "Escape" && isOpen;
      if (!mapKey && !closeKey) return;
      const modal = document.querySelector("dialog[open], [role='dialog'][aria-modal='true'], .modal-backdrop");
      if (!isOpen && modal) return;
      event.preventDefault();
      event.stopPropagation();
      setExpanded(open => closeKey ? false : !open);
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [enabled, isOpen]);

  if (!enabled) return null;
  const destinationCopy = view.destination ? mapTitle(view.destination.label) : view.destinationHidden ? "Destination veiled by roots" : "Choose a shrine to follow";

  return <>
    <aside className={`forest-map-dock forest-map-tools${compactOpen ? " is-open" : ""}`} aria-label="Forest navigation" onPointerDown={event => event.stopPropagation()}>
      <div className="forest-map-dock-header">
        <button type="button" className="forest-map-open forest-map-icon" onClick={() => setExpanded(true)} aria-label="Open forest map" title="Forest map (M)" aria-keyshortcuts="M" aria-haspopup="dialog" aria-expanded={isOpen}><MapIcon /></button>
        {compactOpen ? <button type="button" className="forest-map-collapse" onClick={() => setCompactOpen(false)} aria-expanded={compactOpen} aria-controls={`${id}-compact`} aria-label="Hide minimap" title="Hide minimap"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m7 7 10 10M7 17 17 7" /></svg></button> : null}
      </div>
      <div id={`${id}-compact`} className="forest-map-compact" hidden={!compactOpen}>
        <button type="button" className="forest-map-preview" onClick={() => setExpanded(true)} aria-label="Expand forest map to choose a shrine"><ForestDiagram view={view} id={`${id}-small`} /></button>
        <span className="forest-map-destination"><i aria-hidden="true" />{destinationCopy}</span>
        {view.rootLocked ? <span className="forest-map-root-note">Only your chamber is visible</span> : null}
      </div>
    </aside>

    <dialog ref={dialogRef} className="forest-map-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={event => { event.preventDefault(); setExpanded(false); }} onClose={() => setExpanded(false)} onPointerDown={event => event.stopPropagation()} onClick={event => { if (event.target === event.currentTarget) setExpanded(false); }}>
      <section className="forest-map-sheet">
        <header className="forest-map-heading"><div><span className="forest-map-eyebrow">SILVERPINE SUMMIT · FIELD MAP</span><h2 id={`${id}-title`}>Find your next little adventure.</h2><p id={`${id}-description`}>Your position and the forest’s shrines. No player tracking, no secret shortcuts.</p></div><button autoFocus type="button" className="forest-map-close" onClick={() => setExpanded(false)} aria-label="Close forest map">×</button></header>
        <div className="forest-map-layout">
          <div className="forest-map-main"><ForestDiagram view={view} id={`${id}-large`} expanded /><div className="forest-map-legend"><span><i className="is-you" />You</span><span><i className="is-shrine" />Shrine</span><span><i className="is-destination" />Destination</span></div><p>{view.rootLocked ? "Rootwake has sealed the forest. Other chambers stay hidden until the roots recede." : "Select a shrine to mark your destination. The dashed line is a bearing, not a guaranteed clear path."}</p></div>
          <div className="forest-map-shrines"><h3>{view.rootLocked ? "In your chamber" : "Choose your destination"}</h3><p className="forest-map-shrine-intro">{phase === "ORDEAL" ? "Rituals remain available—if you dare. Team restoration and your personal gear reward are separate." : "Team restoration and your personal gear reward are separate."}</p><div className="forest-map-shrine-list">{view.stations.map(station => {
            const state = navigationStationState(station, phase);
            const selected = destinationId === station.id;
            return <button key={station.id} type="button" className={`forest-map-shrine is-${state.kind}${selected ? " is-selected" : ""}`} aria-pressed={selected} disabled={station.personalCompleted} onClick={() => onDestinationChange(station.id)}><span className="forest-map-shrine-icon" aria-hidden="true">{station.personalCompleted ? "✓" : station.overgrown ? "✦" : station.teamRestored ? "✧" : "◇"}</span><span><b>{mapTitle(station.label)}</b><small>{station.overgrown && !station.personalCompleted ? "Overgrown · first Ordeal bloom +1.5%" : state.label}</small></span><span className="forest-map-shrine-select" aria-hidden="true">{station.personalCompleted ? "" : selected ? "◎" : "↗"}</span></button>;
          })}</div>{view.stations.length === 0 ? <p className="forest-map-empty">No shrine in this chamber. Stay alert until the roots recede.</p> : null}<div className="forest-map-selected"><span>YOUR BEARING</span><b>{destinationCopy}</b><small>{view.destination?.personalCompleted ? "You have already claimed this shrine’s reward this round." : view.destination ? "Close the map to continue toward your marked shrine." : "Choose any visible shrine above. Press M or Escape to return."}</small></div></div>
        </div>
        <details className="forest-map-options"><summary>Map options</summary><label><input type="checkbox" checked={compactOpen} onChange={event => setCompactOpen(event.target.checked)} />Keep minimap open while exploring</label></details>
        <footer className="forest-map-footer"><span>The forest keeps its secrets. This map never reveals other wardens.</span><button type="button" onClick={() => setExpanded(false)}>Back to the forest <kbd>Esc</kbd></button></footer>
      </section>
    </dialog>
  </>;
}
