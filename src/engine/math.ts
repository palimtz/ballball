import { Quaternion, Vector2D } from './types';

export function vecLength(x: number, y: number): number {
  return Math.hypot(x, y);
}

export function normalizeVec(x: number, y: number): [number, number] {
  const len = Math.hypot(x, y);
  if (len < 1e-6) return [0, 0];
  return [x / len, y / len];
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function clampLength(vec: Vector2D, maxLen: number): void {
  const len = Math.hypot(vec.x, vec.y);
  if (len > maxLen && len > 1e-6) {
    const scale = maxLen / len;
    vec.x *= scale;
    vec.y *= scale;
  }
}

/**
 * 3D Quaternion rotation integration for realistic ball roll & spin
 */
export function integrateBallQuaternion(
  orientation: Quaternion,
  vx: number,
  vy: number,
  spin: number,
  radius: number,
  dt: number
): Quaternion {
  // Angular velocity vector: rotation from rolling on ground + angular spin around Z
  const omegaX = -vy / radius;
  const omegaY = vx / radius;
  const omegaZ = spin;

  const omegaMag = Math.hypot(omegaX, omegaY, omegaZ);
  if (omegaMag < 1e-9) return orientation;

  const halfAngle = (omegaMag * dt) / 2;
  const sinFactor = Math.sin(halfAngle) / omegaMag;
  const dqX = omegaX * sinFactor;
  const dqY = omegaY * sinFactor;
  const dqZ = omegaZ * sinFactor;
  const dqW = Math.cos(halfAngle);

  // Quaternion multiplication: dq * orientation
  const [x, y, z, w] = orientation;
  const resX = dqW * x + dqX * w + dqY * z - dqZ * y;
  const resY = dqW * y - dqX * z + dqY * w + dqZ * x;
  const resZ = dqW * z + dqX * y - dqY * x + dqZ * w;
  const resW = dqW * w - dqX * x - dqY * y - dqZ * z;

  const norm = Math.hypot(resX, resY, resZ, resW);
  return [resX / norm, resY / norm, resZ / norm, resW / norm];
}
