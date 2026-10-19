type Point = { id: string; x: number; y: number };
export type SlimePose = {
  offsetY: number; scaleX: number; scaleY: number; shear: number;
  gazeX: number; gazeY: number; hatTilt: number; shadowScale: number; shadowAlpha: number;
};
const restingPose = (): SlimePose => ({ offsetY: 0, scaleX: 1, scaleY: 1, shear: 0, gazeX: 0, gazeY: 0, hatTilt: 0, shadowScale: 1, shadowAlpha: 1 });
type Motion = { x: number; y: number; at: number; phase: number; vx: number; vy: number; pose: SlimePose };

/** Visual-only motion, measured from rendered positions, never from role or input.
 * This makes remote interpolation, AI, blocked movement and touch input agree.
 * No world coordinates, collision bounds or network packets are changed. */
export class SlimeAnimator {
  private motions = new Map<string, Motion>();

  sample(player: Point, time: number, reducedMotion = false): SlimePose {
    let motion = this.motions.get(player.id);
    if (!motion) {
      motion = { x: player.x, y: player.y, at: time, phase: 0, vx: 0, vy: 0, pose: restingPose() };
      this.motions.set(player.id, motion);
    }
    const elapsed = time - motion.at;
    if (elapsed > 0) {
      const dx = player.x - motion.x;
      const dy = player.y - motion.y;
      const distance = Math.hypot(dx, dy);
      const reset = elapsed > .25 || distance > 80;
      const dt = Math.min(elapsed, .05);
      const targetSpeed = reset ? 0 : Math.min(300, distance / elapsed);
      const blend = 1 - Math.exp(-dt * 14);
      if (reset) { motion.vx = 0; motion.vy = 0; }
      motion.vx += ((distance ? dx / distance * targetSpeed : 0) - motion.vx) * blend;
      motion.vy += ((distance ? dy / distance * targetSpeed : 0) - motion.vy) * blend;
      const speed = Math.hypot(motion.vx, motion.vy);
      const pace = Math.min(1, speed / 200);
      const directionX = speed > .1 ? motion.vx / speed : 0;
      const directionY = speed > .1 ? motion.vy / speed : 0;
      motion.phase = (motion.phase + dt * (4.2 + speed * .052)) % (Math.PI * 2);
      const wave = Math.sin(motion.phase);
      const rise = Math.max(0, wave);
      const land = Math.max(0, -wave);
      const width = 1 + land * (.035 + pace * .095) - rise * (.025 + pace * .045);
      Object.assign(motion.pose, {
        offsetY: -rise * (2.3 + pace * 6.2),
        scaleX: width,
        scaleY: 1 / width,
        shear: directionX ? -directionX * pace * .14 : 0,
        gazeX: directionX * pace * 1.5,
        gazeY: directionY * pace * 1.2,
        hatTilt: Math.sin(motion.phase - .45) * pace * .055 - directionX * pace * .025,
        shadowScale: 1 - rise * (.035 + pace * .13),
        shadowAlpha: 1 - rise * (.04 + pace * .18),
      });
      motion.x = player.x;
      motion.y = player.y;
      motion.at = time;
    }
    if (reducedMotion) Object.assign(motion.pose, restingPose());
    return motion.pose;
  }

  clear() { this.motions.clear(); }
}
