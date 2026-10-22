import { WORLD_WIDTH, WORLD_HEIGHT, VIEW_WIDTH, VIEW_HEIGHT } from "../server/sanctuary-map";

export type CameraPoint = { x: number; y: number };
export type CameraViewport = { width: number; height: number };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const GAMEPLAY_ZOOM = 1.4;

/** Fill the arena's real aspect ratio without shrinking the whole forest to fit. */
export function cameraViewport(width: number, height: number): CameraViewport {
  const aspect = Math.max(0.2, Math.min(5, width / Math.max(1, height)));
  return aspect > VIEW_WIDTH / VIEW_HEIGHT
    ? { width: VIEW_WIDTH / GAMEPLAY_ZOOM, height: VIEW_WIDTH / aspect / GAMEPLAY_ZOOM }
    : { width: VIEW_HEIGHT * aspect / GAMEPLAY_ZOOM, height: VIEW_HEIGHT / GAMEPLAY_ZOOM };
}

export function cameraTarget(position: CameraPoint, viewport: CameraViewport): CameraPoint {
  return {
    x: clamp(position.x - viewport.width / 2, 0, Math.max(0, WORLD_WIDTH - viewport.width)),
    y: clamp(position.y - viewport.height / 2, 0, Math.max(0, WORLD_HEIGHT - viewport.height)),
  };
}

export function followCamera(current: CameraPoint, position: CameraPoint, viewport: CameraViewport, dt: number, reducedMotion = false): CameraPoint {
  const target = cameraTarget(position, viewport);
  const alpha = reducedMotion ? 1 : 1 - Math.exp(-12 * Math.max(0, Math.min(0.1, dt)));
  return { x: current.x + (target.x - current.x) * alpha, y: current.y + (target.y - current.y) * alpha };
}

export function viewportToWorld(point: CameraPoint, camera: CameraPoint, viewport: CameraViewport): CameraPoint {
  return { x: clamp(camera.x + clamp(point.x, 0, viewport.width), 0, WORLD_WIDTH), y: clamp(camera.y + clamp(point.y, 0, viewport.height), 0, WORLD_HEIGHT) };
}
