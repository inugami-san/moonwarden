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
      const blend = 1 - Math.exp(-dt * 12);
      if (reset) { motion.vx = 0; motion.vy = 0; }
      motion.vx += ((distance ? dx / distance * targetSpeed : 0) - motion.vx) * blend;
      motion.vy += ((distance ? dy / distance * targetSpeed : 0) - motion.vy) * blend;
      const speed = Math.hypot(motion.vx, motion.vy);
      const pace = Math.min(1, speed / 200);
      // A rounded lift has zero velocity at contact and at the top of a hop.
      // Unlike a clipped sine, it never changes direction abruptly at the feet.
      motion.phase = (motion.phase + dt * (2.5 + pace * 9)) % (Math.PI * 2);
      const contact = Math.cos(motion.phase);
      const rise = Math.pow((1 - contact) * .5, 2);
      const width = 1 + contact * (.018 + pace * .095) - rise * pace * .025;
      const bodyBlend = 1 - Math.exp(-dt * 24);
      const gazeBlend = 1 - Math.exp(-dt * 14);
      const approach = (current: number, target: number, blend: number) => current + (target - current) * blend;
      const travelX = Math.max(-1, Math.min(1, motion.vx / 200));
      const travelY = Math.max(-1, Math.min(1, motion.vy / 200));
      if (reset) motion.pose = restingPose();
      const scaleX = approach(motion.pose.scaleX, width, bodyBlend);
      Object.assign(motion.pose, {
        offsetY: approach(motion.pose.offsetY, -rise * (1.8 + pace * 5.8), bodyBlend),
        scaleX,
        scaleY: 1 / scaleX,
        shear: reset ? 0 : approach(motion.pose.shear, -travelX * .10, gazeBlend),
        gazeX: reset ? 0 : approach(motion.pose.gazeX, travelX * 1.5, gazeBlend),
        gazeY: reset ? 0 : approach(motion.pose.gazeY, travelY * 1.2, gazeBlend),
        hatTilt: approach(motion.pose.hatTilt, Math.sin(motion.phase - .5) * pace * .04 - travelX * .022, bodyBlend),
        shadowScale: approach(motion.pose.shadowScale, 1 - rise * (.025 + pace * .11), bodyBlend),
        shadowAlpha: approach(motion.pose.shadowAlpha, 1 - rise * (.035 + pace * .14), bodyBlend),
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
