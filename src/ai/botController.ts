import { PHYSICS_CONFIG } from '../engine/constants';
import { normalizeVec, vecLength } from '../engine/math';
import { GameState, Player, PlayerInput } from '../engine/types';
import { TacticsManager } from './tactics';

export class BotAI {
  /**
   * Generates input for an AI player based on modern football tactics,
   * spatial discipline, passing lanes, and role assignment.
   */
  public static computeInput(state: GameState, player: Player): PlayerInput {
    if (state.phase !== 'playing') {
      return { x: 0, y: 0, boost: false, kick: false };
    }

    const ball = state.ball;
    const side = player.side;
    const dir = side === 0 ? 1 : -1; // 1 = attacking right, -1 = attacking left
    const field = state.field;
    const halfW = field.width / 2;
    const halfGoal = field.goal / 2;

    const ownGoalX = -dir * halfW;
    const oppGoalX = dir * halfW;

    // 1. Determine tactical role and primary presser status
    const primaryPresserId = TacticsManager.getPrimaryPresser(state, side);
    const isPrimaryPresser = player.id === primaryPresserId;
    const role = TacticsManager.assignRole(player, state.teamSize, isPrimaryPresser);

    // Distance to ball
    const dxToBall = ball.x - player.x;
    const dyToBall = ball.y - player.y;
    const distToBall = vecLength(dxToBall, dyToBall);

    // 2. Decision making: evaluate passing vs shooting
    const shotOption = TacticsManager.evaluateShot(state, player);
    const passOption = TacticsManager.evaluateBestPass(state, player);

    // Prioritize high-value passes and crosses over heavily contested shots
    const shouldPass =
      passOption !== null &&
      (passOption.score > shotOption.score || !shotOption.isClear);

    const actionTargetX = shouldPass ? passOption.targetX : shotOption.targetX;
    const actionTargetY = shouldPass ? passOption.targetY : shotOption.targetY;

    // 3. Movement Target Computation
    let targetX = 0;
    let targetY = 0;

    if (isPrimaryPresser || role === 'duelist') {
      // Primary presser leads to the ball, positioning behind it relative to the action target
      const [aimDx, aimDy] = normalizeVec(
        actionTargetX - ball.x,
        actionTargetY - ball.y
      );

      // Desired approach pocket (behind ball to strike forward)
      const approachDistance = 24;
      targetX = ball.x - aimDx * approachDistance + ball.vx * 0.18;
      targetY = ball.y - aimDy * approachDistance + ball.vy * 0.18;

      // Avoid own-goal trap: if ball is between player and own goal, retreat around it
      const isTrappedBehindBall = dir === 1 ? ball.x < player.x - 10 : ball.x > player.x + 10;
      if (isTrappedBehindBall && Math.abs(dyToBall) < 40) {
        // Step sideways to circle around ball safely
        targetY += ball.y > 0 ? -70 : 70;
      }
    } else {
      // Supporting / Defending / Spacing teammates
      const anchor = TacticsManager.getTacticalAnchor(state, player, role);
      targetX = anchor.x;
      targetY = anchor.y;

      // Goalkeeper special behavior: block incoming shots
      if (role === 'goalkeeper') {
        const isShotHeadingToGoal = dir === 1 ? ball.vx < -150 : ball.vx > 150;
        if (isShotHeadingToGoal) {
          // Intercept line
          const timeToLine = Math.abs((ownGoalX - ball.x) / ball.vx);
          const interceptY = ball.y + ball.vy * timeToLine;
          targetY = Math.max(-halfGoal + 20, Math.min(halfGoal - 20, interceptY));
        }
      }
    }

    // 4. Anti-clumping spatial separation (boids repulsion)
    const [repelX, repelY] = TacticsManager.computeSeparation(state, player);
    targetX += repelX;
    targetY += repelY;

    // 5. Kicking Decision & Timing
    const kickRange = player.r + ball.r + PHYSICS_CONFIG.kickGap + 6;
    let shouldKick = false;

    if (distToBall <= kickRange) {
      // Must be roughly facing away from own goal
      const facingOpponentGoal = dir === 1 ? dxToBall > -15 : dxToBall < 15;

      // Defensive emergency clearance in own box
      const isInOwnBox = Math.abs(player.x - ownGoalX) < 180 && Math.abs(player.y) < halfGoal + 60;
      if (isInOwnBox) {
        shouldKick = true; // Clear immediately!
      } else if (facingOpponentGoal) {
        shouldKick = true;
      }
    }

    // 6. Boost / Sprint Execution
    let shouldBoost = false;
    if (player.charges > 0 && player.boostCd === 0) {
      if (role === 'goalkeeper') {
        // Goalkeeper dive to stop a shot heading into the net
        const isShotDangerous = dir === 1 ? ball.vx < -280 : ball.vx > 280;
        if (isShotDangerous && Math.abs(ball.y - player.y) > 40 && distToBall < 300) {
          shouldBoost = true;
        }
      } else if (isPrimaryPresser) {
        // Sprint on open breakaway or contested loose ball
        if (shotOption.isClear && distToBall < 120 && Math.abs(oppGoalX - player.x) < 380) {
          shouldBoost = true; // Burst into open goal!
        } else if (distToBall > 180 && distToBall < 450) {
          const dot = (dxToBall / distToBall) * dir;
          if (dot > 0.85) {
            shouldBoost = true; // Sprint to win loose ball
          }
        }
      } else if (role === 'center_back') {
        // Defender sprinting back to stop an opponent counter-attack
        const opponentBreakaway = dir === 1 ? ball.x < player.x : ball.x > player.x;
        if (opponentBreakaway && Math.abs(player.x - ownGoalX) > 150) {
          shouldBoost = true;
        }
      }
    }

    // 7. Calculate movement direction vector
    const [moveX, moveY] = normalizeVec(targetX - player.x, targetY - player.y);

    return {
      x: moveX,
      y: moveY,
      boost: shouldBoost,
      kick: shouldKick
    };
  }
}
