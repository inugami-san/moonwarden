"use client";

import { useEffect, useRef, type RefObject } from "react";
import { JOYSTICK_RADIUS, JoystickInput, type MoveVector } from "./joystick-input";
import "./floating-joystick.css";

export function FloatingJoystick({ surfaceRef, enabled, onVector }: {
  surfaceRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  onVector: (vector: MoveVector) => void;
}) {
  const visualRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const surface = surfaceRef.current, visual = visualRef.current;
    if (!surface || !visual || !enabled) { onVector({ vx: 0, vy: 0 }); return; }
    const input = new JoystickInput();
    const reset = () => {
      const id = input.pointerId;
      input.end();
      visual.dataset.active = "false";
      onVector(input.vector);
      if (id !== null && surface.hasPointerCapture(id)) surface.releasePointerCapture(id);
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
      const target = event.target;
      if (target instanceof Element && target.closest("button, a, input, select, textarea, dialog, [role='dialog'], [data-no-joystick]")) return;
      const rect = surface.getBoundingClientRect();
      if (!input.begin(event.pointerId, event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height)) return;
      try { surface.setPointerCapture(event.pointerId); } catch { reset(); return; }
      event.preventDefault();
      visual.style.setProperty("--stick-x", `${input.origin.x}px`);
      visual.style.setProperty("--stick-y", `${input.origin.y}px`);
      visual.style.setProperty("--thumb-x", "0px"); visual.style.setProperty("--thumb-y", "0px");
      visual.dataset.active = "true";
      onVector(input.vector);
    };
    const move = (event: PointerEvent) => {
      const rect = surface.getBoundingClientRect();
      if (!input.move(event.pointerId, event.clientX - rect.left, event.clientY - rect.top)) return;
      event.preventDefault();
      const dx = event.clientX - rect.left - input.origin.x, dy = event.clientY - rect.top - input.origin.y;
      const scale = Math.min(1, JOYSTICK_RADIUS / (Math.hypot(dx, dy) || 1));
      visual.style.setProperty("--thumb-x", `${dx * scale}px`);
      visual.style.setProperty("--thumb-y", `${dy * scale}px`);
      onVector(input.vector);
    };
    const up = (event: PointerEvent) => { if (event.pointerId === input.pointerId) reset(); };
    const hidden = () => { if (document.hidden) reset(); };
    surface.addEventListener("pointerdown", down, { passive: false });
    surface.addEventListener("pointermove", move, { passive: false });
    surface.addEventListener("pointerup", up);
    surface.addEventListener("pointercancel", up);
    surface.addEventListener("lostpointercapture", up);
    window.addEventListener("blur", reset);
    window.addEventListener("resize", reset);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      reset();
      surface.removeEventListener("pointerdown", down); surface.removeEventListener("pointermove", move);
      surface.removeEventListener("pointerup", up); surface.removeEventListener("pointercancel", up);
      surface.removeEventListener("lostpointercapture", up);
      window.removeEventListener("blur", reset); window.removeEventListener("resize", reset);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [surfaceRef, enabled, onVector]);

  return <>
    <div ref={visualRef} className="floating-joystick" data-active="false" aria-hidden="true"><i className="joystick-orbit" /><span className="joystick-thumb"><i /></span></div>
    {enabled ? <span className="joystick-hint" aria-hidden="true">Touch & drag the left side to move</span> : null}
  </>;
}
