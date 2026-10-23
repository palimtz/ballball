import { SPIN_CONFIG } from './constants';
import { Ball, Player } from './types';

/**
 * Calculates spin angular velocity imparted to the ball when kicked.
 * Tangential relative velocity between player and ball is converted to spin.
 */
export function calculateKickSpin(
  ball: Ball,
  player: Player,
  shotDirX: number,
  shotDirY: number
): number {
  // Tangential velocity relative to shot normal
  const relVx = player.vx - ball.vx;
  const relVy = player.vy - ball.vy;
  const tangentialSpeed = relVx * -shotDirY + relVy * shotDirX;

  const spinAdded =
    (tangentialSpeed * SPIN_CONFIG.kickTransfer) / (SPIN_CONFIG.inertia * ball.r);
  const newSpin = ball.spin * SPIN_CONFIG.kickRetention - spinAdded;

  return Math.max(-SPIN_CONFIG.max, Math.min(SPIN_CONFIG.max, newSpin));
}

/**
 * Magnus Effect: applies aerodynamic curvature to ball velocity vector based on current spin.
 */
export function applyMagnusCurvature(ball: Ball, dt: number): void {
  // Spin decays exponentially
  ball.spin =
    Math.max(-SPIN_CONFIG.max, Math.min(SPIN_CONFIG.max, ball.spin)) *
    Math.exp(-SPIN_CONFIG.drag * dt);

  if (Math.abs(ball.spin) < 0.025) {
    ball.spin = 0;
  }

  // Deflection angle proportional to spin * dt
  const angle = ball.spin * SPIN_CONFIG.curve * dt;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const vx = ball.vx;

  // Rotate velocity vector
  ball.vx = vx * cos - ball.vy * sin;
  ball.vy = vx * sin + ball.vy * cos;
}

/**
 * Tangential friction impulse transfer on contact with player or wall
 */
export function applyTangentialSpinTransfer(
  ball: Ball,
  normalX: number,
  normalY: number,
  normalImpulse: number,
  frictionCoeff: number
): void {
  const tanX = -normalY;
  const tanY = normalX;

  const invInertia = 1 / (SPIN_CONFIG.inertia * ball.r * ball.r);
  const slipVelocity = ball.vx * tanX + ball.vy * tanY - ball.spin * ball.r;
  const frictionLimit = frictionCoeff * Math.abs(normalImpulse);

  const denom = 1 + ball.r * ball.r * invInertia;
  const frictionImpulse = Math.max(
    -frictionLimit,
    Math.min(frictionLimit, -slipVelocity / denom)
  );

  ball.vx += tanX * frictionImpulse;
  ball.vy += tanY * frictionImpulse;
  ball.spin -= ball.r * frictionImpulse * invInertia;
}
