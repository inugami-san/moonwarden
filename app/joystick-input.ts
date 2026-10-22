export type MoveVector = { vx: number; vy: number };
export const JOYSTICK_RADIUS = 54;
export const JOYSTICK_DEAD_ZONE = 6;
export const ZERO_MOVE: MoveVector = Object.freeze({ vx: 0, vy: 0 });

/** Radial dead zone, proportional speed, circular clamp (no faster diagonals). */
export function joystickVector(dx: number, dy: number, radius = JOYSTICK_RADIUS, deadZone = JOYSTICK_DEAD_ZONE): MoveVector {
  if (![dx, dy, radius, deadZone].every(Number.isFinite) || radius <= deadZone || deadZone < 0) return { ...ZERO_MOVE };
  const distance = Math.hypot(dx, dy);
  if (distance <= deadZone) return { ...ZERO_MOVE };
  const strength = (Math.min(distance, radius) - deadZone) / (radius - deadZone);
  return { vx: dx / distance * strength, vy: dy / distance * strength };
}

export function movementVector(keyX: number, keyY: number, analog: MoveVector = ZERO_MOVE, invert = false): MoveVector {
  const keyboard = keyX !== 0 || keyY !== 0;
  const vx = keyboard ? keyX : analog.vx, vy = keyboard ? keyY : analog.vy;
  if (![vx, vy].every(Number.isFinite)) return { ...ZERO_MOVE };
  const scale = (invert ? -1 : 1) / Math.max(1, Math.hypot(vx, vy));
  return { vx: vx * scale, vy: vy * scale };
}

/** One owned pointer; other fingers remain available for action buttons. */
export class JoystickInput {
  pointerId: number | null = null;
  origin = { x: 0, y: 0 };
  vector: MoveVector = { ...ZERO_MOVE };
  begin(pointerId: number, x: number, y: number, width: number, height: number) {
    if (this.pointerId !== null || ![pointerId, x, y, width, height].every(Number.isFinite)
      || x < 0 || x >= width / 2 || y < 0 || y > height || width <= 0 || height <= 0) return false;
    this.pointerId = pointerId;
    this.origin = { x, y };
    this.vector = { ...ZERO_MOVE };
    return true;
  }
  move(pointerId: number, x: number, y: number) {
    if (pointerId !== this.pointerId) return false;
    this.vector = joystickVector(x - this.origin.x, y - this.origin.y);
    return true;
  }
  end(pointerId?: number) {
    if (pointerId !== undefined && pointerId !== this.pointerId) return false;
    this.pointerId = null;
    this.vector = { ...ZERO_MOVE };
    return true;
  }
}
