import { PHYSICS_CONFIG } from '../engine/constants';
import { normalizeVec, vecLength } from '../engine/math';
import { GameState, Player, PlayerInput } from '../engine/types';

export class BotAI {
  /**
   * Generates input for an AI player based on current state and role.
   */
  public static computeInput(state: GameState, player: Player): PlayerInput {
    if (state.phase !== 'playing') {
      return { x: 0, y: 0, boost: false, kick: false };
    }

    const ball = state.ball;
    const field = state.field;
    const side = player.side;
    const ownGoalX = side === 0 ? -field.width / 2 : field.width / 2;

    // Estimate ball future position (simple lead prediction)
    const predTime = 0.25; // 250ms lead
    const predBallX = ball.x + ball.vx * predTime;
    const predBallY = ball.y + ball.vy * predTime;

    const dxToBall = ball.x - player.x;
    const dyToBall = ball.y - player.y;
    const distToBall = vecLength(dxToBall, dyToBall);

    // Desired movement direction
    let targetX = predBallX;
    let targetY = predBallY;

    // If ball is behind player towards own goal, retreat and position between ball and goal
    const isBallDangerous =
      side === 0 ? ball.x < player.x : ball.x > player.x;

    if (isBallDangerous) {
      targetX = (ball.x + ownGoalX) / 2;
      targetY = ball.y * 0.75;
    }

    // Determine kick condition: within striking distance and facing opponent's goal
    const kickRange = player.r + ball.r + PHYSICS_CONFIG.kickGap + 4;
    let shouldKick = false;

    if (distToBall <= kickRange) {
      const facingCorrectWay =
        side === 0 ? dxToBall > -5 : dxToBall < 5;

      if (facingCorrectWay) {
        shouldKick = true;
      }
    }

    // Determine boost condition: sprinting to open ball or urgent defense
    let shouldBoost = false;
    if (player.charges > 0 && player.boostCd === 0) {
      // Rush to kickoff or loose breakaway ball
      if (distToBall > 180 && distToBall < 450) {
        const dot =
          (dxToBall / distToBall) * (dirToTarget(player.x, targetX));
        if (dot > 0.8) {
          shouldBoost = true;
        }
      }
    }

    const [moveX, moveY] = normalizeVec(targetX - player.x, targetY - player.y);

    return {
      x: moveX,
      y: moveY,
      boost: shouldBoost,
      kick: shouldKick
    };
  }
}

function dirToTarget(from: number, to: number): number {
  const diff = to - from;
  return diff > 0 ? 1 : diff < 0 ? -1 : 0;
}
