import { MATCH_RULES, PHYSICS_CONFIG, SPIN_CONFIG } from './constants';
import { applyTangentialSpinTransfer } from './spin';
import { Ball, GameState, Player, StadiumField } from './types';

export interface CollidableCircle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

/**
 * Circle vs Circle collision resolution with inverse masses and restitution.
 * Exact implementation of function `Vo` from ballball decompiled codebase.
 */
export function resolveCircleCollision(
  state: GameState,
  a: CollidableCircle,
  b: CollidableCircle,
  invMassA: number,
  invMassB: number,
  restitution: number,
  isBallInvolved: boolean
): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const minDist = a.r + b.r;

  const distSq = dx * dx + dy * dy;
  if (distSq > minDist * minDist * (1 + 1e-9)) return;

  let dist = Math.hypot(dx, dy);
  if (dist >= minDist) return;

  let normX = dx;
  let normY = dy;
  if (dist < 1e-5) {
    normX = 1;
    normY = 0;
    dist = 1;
  } else {
    normX /= dist;
    normY /= dist;
  }

  // Positional separation based on inverse masses
  const overlap = minDist - dist;
  const totalInvMass = invMassA + invMassB;
  if (totalInvMass > 0) {
    a.x -= (normX * overlap * invMassA) / totalInvMass;
    a.y -= (normY * overlap * invMassA) / totalInvMass;
    b.x += (normX * overlap * invMassB) / totalInvMass;
    b.y += (normY * overlap * invMassB) / totalInvMass;
  }

  // Relative velocity along collision normal
  const relVelNormal = (b.vx - a.vx) * normX + (b.vy - a.vy) * normY;
  if (relVelNormal >= 0) return; // Moving apart

  // Normal impulse
  const impulse = (-(1 + restitution) * relVelNormal) / totalInvMass;
  a.vx -= impulse * normX * invMassA;
  a.vy -= impulse * normY * invMassA;
  b.vx += impulse * normX * invMassB;
  b.vy += impulse * normY * invMassB;

  // Tangential friction and spin transfer if ball is involved
  if (isBallInvolved) {
    const ball = (b === state.ball ? b : a) as Ball;
    const player = (b === state.ball ? a : b) as Player;
    if ('id' in player) {
      state.lastTouch = player.id;
    }
    applyTangentialSpinTransfer(
      ball,
      normX,
      normY,
      impulse,
      SPIN_CONFIG.contactFriction
    );

    // Audio / hit event trigger
    if (-relVelNormal > 85) {
      state.events.push({
        type: 'hit',
        x: ball.x,
        y: ball.y,
        power: Math.min(1.6, -relVelNormal / 600),
        side: 'side' in player ? player.side : 0
      });
    }
  }
}

/**
 * Wall collisions with rounded corners and goal openings.
 * Exact implementation of function `D2` from ballball decompiled codebase.
 */
export function resolveWallCollisions(
  state: GameState,
  entity: CollidableCircle,
  isBall: boolean
): void {
  const field = state.field;
  const halfW = field.width / 2;
  const halfH = field.height / 2;
  const halfGoal = field.goal / 2;
  const restitution = isBall
    ? PHYSICS_CONFIG.ballWallBounce
    : PHYSICS_CONFIG.playerWallBounce;

  // Top and bottom horizontal walls
  if (Math.abs(entity.y) > halfH - entity.r) {
    const sign = Math.sign(entity.y);
    entity.y = sign * (halfH - entity.r);
    applyWallBounce(state, entity, isBall, restitution, 0, sign);
  }

  // Left and right vertical walls (except inside goal mouth for the ball)
  const insideGoalMouth = isBall && Math.abs(entity.y) < halfGoal;
  if (!insideGoalMouth && Math.abs(entity.x) > halfW - entity.r) {
    const sign = Math.sign(entity.x);
    entity.x = sign * (halfW - entity.r);
    applyWallBounce(state, entity, isBall, restitution, sign, 0);
  }

  // Goal net cavity containment for the ball
  if (isBall && Math.abs(entity.x) > halfW) {
    const signX = Math.sign(entity.x);
    const maxNetX = halfW + field.depth + 14 - entity.r;
    if (Math.abs(entity.x) > maxNetX) {
      entity.x = signX * maxNetX;
      entity.vx *= -0.15; // heavily absorbed by net fabric
      entity.vy *= 0.7;
    }
    if (Math.abs(entity.y) > halfGoal - entity.r) {
      const signY = Math.sign(entity.y);
      entity.y = signY * (halfGoal - entity.r);
      entity.vy *= -0.25;
    }
  }

  // 4 Rounded corners of the court (radius = field.corner = 60)
  const cornerX = halfW - field.corner;
  const cornerY = halfH - field.corner;
  if (Math.abs(entity.x) > cornerX && Math.abs(entity.y) > cornerY) {
    const dx = Math.abs(entity.x) - cornerX;
    const dy = Math.abs(entity.y) - cornerY;
    const dist = Math.hypot(dx, dy);
    const maxDist = field.corner - entity.r;
    if (dist > maxDist) {
      const signX = Math.sign(entity.x);
      const signY = Math.sign(entity.y);
      const normX = (dx / dist) * signX;
      const normY = (dy / dist) * signY;
      entity.x = signX * cornerX + normX * maxDist;
      entity.y = signY * cornerY + normY * maxDist;
      applyWallBounce(state, entity, isBall, restitution, normX, normY);
    }
  }

  // 4 Goal posts (left-top, left-bottom, right-top, right-bottom)
  if (isBall) {
    const posts = [
      { x: -halfW, y: -halfGoal },
      { x: -halfW, y: halfGoal },
      { x: halfW, y: -halfGoal },
      { x: halfW, y: halfGoal }
    ];

    for (const post of posts) {
      resolveCircleCollision(
        state,
        { x: post.x, y: post.y, vx: 0, vy: 0, r: PHYSICS_CONFIG.goalPostRadius },
        entity,
        0, // infinite mass post
        PHYSICS_CONFIG.ballInverseMass,
        PHYSICS_CONFIG.ballWallBounce,
        true
      );
    }

    // Check goal score
    checkGoalScore(state, field);
  }
}

function applyWallBounce(
  state: GameState,
  entity: CollidableCircle,
  isBall: boolean,
  restitution: number,
  normX: number,
  normY: number
): void {
  const velNormal = entity.vx * normX + entity.vy * normY;
  if (velNormal > 0) {
    entity.vx -= (1 + restitution) * velNormal * normX;
    entity.vy -= (1 + restitution) * velNormal * normY;

    if (isBall) {
      applyTangentialSpinTransfer(
        entity as Ball,
        normX,
        normY,
        ((1 + restitution) * velNormal) / PHYSICS_CONFIG.ballInverseMass,
        SPIN_CONFIG.wallFriction
      );
    }

    if (velNormal > 130) {
      state.events.push({
        type: 'wall',
        x: entity.x,
        y: entity.y,
        power: Math.min(1.5, velNormal / 900),
        side: 0
      });
    }
  }
}

/**
 * Checks if the ball has crossed the goal threshold into the back net.
 */
function checkGoalScore(state: GameState, field: StadiumField): void {
  if (state.phase !== 'playing') return;

  const halfW = field.width / 2;
  const halfGoal = field.goal / 2;

  // Left goal scored by Team 1 (Coral)
  if (state.ball.x < -halfW - state.ball.r && Math.abs(state.ball.y) < halfGoal) {
    triggerGoal(state, 1);
  }
  // Right goal scored by Team 0 (Lilac)
  else if (state.ball.x > halfW + state.ball.r && Math.abs(state.ball.y) < halfGoal) {
    triggerGoal(state, 0);
  }
}

function triggerGoal(state: GameState, scoringTeam: 0 | 1): void {
  state.score[scoringTeam]++;
  state.scorer = scoringTeam;
  state.goalTick = state.tick;
  state.phase = 'goal';
  state.phaseTicks = MATCH_RULES.celebration; // 2.5s active celebration
  state.events.push({
    type: 'goal',
    x: state.ball.x,
    y: state.ball.y,
    power: 2.0,
    side: scoringTeam
  });
}
