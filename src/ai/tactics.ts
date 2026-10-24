import { vecLength } from '../engine/math';
import { GameState, Player, Team } from '../engine/types';

export type TacticalRole =
  | 'duelist'
  | 'goalkeeper'
  | 'center_back'
  | 'left_winger'
  | 'right_winger'
  | 'midfielder'
  | 'striker';

export interface PassOption {
  targetPlayer: Player;
  targetX: number;
  targetY: number;
  score: number;
  isCross: boolean;
}

export class TacticsManager {
  /**
   * Assigns tactical roles to each player in a team based on team size and current ball state.
   */
  public static assignRole(
    player: Player,
    teamSize: number,
    isPrimaryPresser: boolean
  ): TacticalRole {
    if (teamSize <= 1) return 'duelist';

    // Primary presser leads the active attack on the ball
    if (isPrimaryPresser) {
      return 'striker';
    }

    const slot = Math.floor(player.id / 2);

    if (teamSize === 2) {
      return slot === 0 ? 'striker' : 'center_back';
    }

    if (teamSize === 3) {
      if (slot === 0) return 'striker';
      if (slot === 1) return 'midfielder';
      return 'goalkeeper';
    }

    if (teamSize === 4) {
      if (slot === 0) return 'striker';
      if (slot === 1) return 'left_winger';
      if (slot === 2) return 'right_winger';
      return 'goalkeeper';
    }

    // 5v5: Striker, Left Winger (top), Right Winger (bottom), Center Back, Goalkeeper
    if (slot === 0) return 'striker';
    if (slot === 1) return 'left_winger';
    if (slot === 2) return 'right_winger';
    if (slot === 3) return 'center_back';
    return 'goalkeeper';
  }

  /**
   * Identifies the primary presser for a given team: the single player best positioned to reach the ball.
   */
  public static getPrimaryPresser(state: GameState, side: Team): number {
    const ball = state.ball;
    const teammates = state.players.filter(
      (p) => p.side === side && state.active[p.id]
    );

    if (teammates.length === 0) return -1;
    if (teammates.length === 1) return teammates[0].id;

    let bestId = teammates[0].id;
    let minScore = Infinity;

    for (const p of teammates) {
      const dist = vecLength(p.x - ball.x, p.y - ball.y);
      const isGoalkeeper =
        state.teamSize >= 3 &&
        Math.floor(p.id / 2) === state.teamSize - 1;

      // Goalkeeper only presses if ball is inside own box
      const halfW = state.field.width / 2;
      const ownGoalX = side === 0 ? -halfW : halfW;
      const distToOwnGoal = Math.abs(ball.x - ownGoalX);

      if (isGoalkeeper && distToOwnGoal > 220) {
        continue;
      }

      // Angle penalty if ball is behind player
      const dirToGoal = side === 0 ? 1 : -1;
      const behindPenalty = (ball.x - p.x) * dirToGoal < -20 ? 80 : 0;

      const score = dist + behindPenalty + (isGoalkeeper ? 160 : 0);
      if (score < minScore) {
        minScore = score;
        bestId = p.id;
      }
    }

    return bestId;
  }

  /**
   * Computes the base tactical anchor on the pitch for a player based on role, formation, and ball position.
   */
  public static getTacticalAnchor(
    state: GameState,
    player: Player,
    role: TacticalRole
  ): { x: number; y: number } {
    const field = state.field;
    const ball = state.ball;
    const side = player.side;
    const dir = side === 0 ? 1 : -1; // 1 = attacking right, -1 = attacking left
    const halfW = field.width / 2;
    const halfH = field.height / 2;
    const halfGoal = field.goal / 2;

    const ownGoalX = -dir * halfW;
    const oppGoalX = dir * halfW;

    // Shift of team center-of-gravity with ball movement
    const ballShiftX = ball.x * 0.45;
    const ballShiftY = ball.y * 0.35;

    switch (role) {
      case 'goalkeeper': {
        // Protect goal line, bisect the angle from ball to goal center
        const keeperX = ownGoalX + dir * 36;
        const targetY = Math.max(
          -halfGoal + 24,
          Math.min(halfGoal - 24, ball.y * 0.55)
        );
        return { x: keeperX, y: targetY };
      }

      case 'center_back': {
        // Position centrally between the ball and own goal
        const defX = ownGoalX + dir * Math.max(160, Math.min(halfW * 0.7, halfW * 0.35 + ballShiftX * dir));
        const defY = ballShiftY * 0.5;
        return { x: defX, y: defY };
      }

      case 'left_winger': {
        // Dedicated top flank width (Y < 0)
        const wingY = -halfH * 0.62;
        const wingX = Math.max(-halfW * 0.45, Math.min(halfW * 0.75, ball.x + dir * 140));
        return { x: wingX, y: wingY };
      }

      case 'right_winger': {
        // Dedicated bottom flank width (Y > 0)
        const wingY = halfH * 0.62;
        const wingX = Math.max(-halfW * 0.45, Math.min(halfW * 0.75, ball.x + dir * 140));
        return { x: wingX, y: wingY };
      }

      case 'midfielder': {
        // Central playmaker and connector
        const midX = ballShiftX * 0.7;
        const midY = ballShiftY * 0.8;
        return { x: midX, y: midY };
      }

      case 'striker': {
        // Push towards opponent box, seek open pocket on the opposite post
        const boxX = oppGoalX - dir * 150;
        const oppositePostY = ball.y > 0 ? -halfGoal * 0.6 : halfGoal * 0.6;
        return { x: boxX, y: oppositePostY };
      }

      case 'duelist':
      default: {
        // 1v1 duel
        return { x: ball.x, y: ball.y };
      }
    }
  }

  /**
   * Evaluates the best available pass to a teammate (including crosses / "centres" and through-balls).
   */
  public static evaluateBestPass(
    state: GameState,
    passer: Player
  ): PassOption | null {
    const ball = state.ball;
    const side = passer.side;
    const dir = side === 0 ? 1 : -1;
    const oppGoalX = dir * (state.field.width / 2);

    const teammates = state.players.filter(
      (p) => p.side === side && p.id !== passer.id && state.active[p.id]
    );
    const opponents = state.players.filter(
      (p) => p.side !== side && state.active[p.id]
    );

    if (teammates.length === 0) return null;

    let bestOption: PassOption | null = null;
    let maxScore = -Infinity;

    for (const mate of teammates) {
      // Predict lead target where teammate is running
      const leadTime = 0.35;
      const targetX = mate.x + mate.vx * leadTime;
      const targetY = mate.y + mate.vy * leadTime;

      const distToMate = vecLength(targetX - ball.x, targetY - ball.y);
      if (distToMate < 70 || distToMate > 600) continue;

      // 1. Check if passing lane is obstructed by opponents
      let isObstructed = false;
      for (const opp of opponents) {
        const distToLane = pointToSegmentDistance(
          opp.x,
          opp.y,
          ball.x,
          ball.y,
          targetX,
          targetY
        );
        if (distToLane < opp.r + 26) {
          isObstructed = true;
          break;
        }
      }
      if (isObstructed) continue;

      // 2. Score the pass option
      let score = 200;

      // Advantage: Teammate is closer to opponent's goal
      const passerDistToGoal = Math.abs(oppGoalX - passer.x);
      const mateDistToGoal = Math.abs(oppGoalX - mate.x);
      score += (passerDistToGoal - mateDistToGoal) * 1.5;

      // Advantage: Cross from wing into center ("Centre")
      const isWingCarrier = Math.abs(ball.y) > 130;
      const isCentralMate = Math.abs(targetY) < 110;
      let isCross = false;
      if (isWingCarrier && isCentralMate && mateDistToGoal < 280) {
        score += 380; // High value for cross to striker
        isCross = true;
      }

      // Advantage: Unmarked teammate
      let nearestOppDist = Infinity;
      for (const opp of opponents) {
        const d = vecLength(opp.x - targetX, opp.y - targetY);
        if (d < nearestOppDist) nearestOppDist = d;
      }
      if (nearestOppDist > 140) {
        score += 150; // Wide open teammate
      }

      if (score > maxScore) {
        maxScore = score;
        bestOption = {
          targetPlayer: mate,
          targetX,
          targetY,
          score,
          isCross
        };
      }
    }

    return bestOption;
  }

  /**
   * Evaluates shooting quality on the opponent's goal (detecting open net, corners, or blocker obstruction).
   */
  public static evaluateShot(
    state: GameState,
    shooter: Player
  ): { targetX: number; targetY: number; score: number; isClear: boolean } {
    const ball = state.ball;
    const side = shooter.side;
    const dir = side === 0 ? 1 : -1;
    const field = state.field;
    const oppGoalX = dir * (field.width / 2);
    const halfGoal = field.goal / 2;

    const opponents = state.players.filter(
      (p) => p.side !== side && state.active[p.id]
    );

    const distToGoal = Math.abs(oppGoalX - ball.x);

    // Test three target points on opponent goal mouth: Top corner, Center, Bottom corner
    const testTargets = [
      { x: oppGoalX, y: -halfGoal + 30 },
      { x: oppGoalX, y: 0 },
      { x: oppGoalX, y: halfGoal - 30 }
    ];

    let bestTarget = testTargets[1];
    let maxShotScore = -Infinity;
    let isFullyClear = false;

    for (const target of testTargets) {
      let isBlocked = false;
      let minBlockerDist = Infinity;

      for (const opp of opponents) {
        const dist = pointToSegmentDistance(
          opp.x,
          opp.y,
          ball.x,
          ball.y,
          target.x,
          target.y
        );
        if (dist < opp.r + 20) {
          isBlocked = true;
          if (dist < minBlockerDist) minBlockerDist = dist;
        }
      }

      let score = 300 - distToGoal * 0.5;
      if (!isBlocked) {
        score += 450; // Clear open trajectory!
        isFullyClear = true;
      } else {
        score += minBlockerDist * 2;
      }

      if (score > maxShotScore) {
        maxShotScore = score;
        bestTarget = target;
      }
    }

    // Huge reward if goal is completely undefended (empty net)
    const keeperInGoal = opponents.some(
      (opp) => Math.abs(opp.x - oppGoalX) < 120 && Math.abs(opp.y) < halfGoal
    );
    if (!keeperInGoal && distToGoal < 500) {
      maxShotScore += 700;
      isFullyClear = true;
    }

    return {
      targetX: bestTarget.x,
      targetY: bestTarget.y,
      score: maxShotScore,
      isClear: isFullyClear
    };
  }

  /**
   * Computes mutual repulsion force to maintain spatial discipline and prevent crowding.
   */
  public static computeSeparation(
    state: GameState,
    player: Player
  ): [number, number] {
    let repelX = 0;
    let repelY = 0;
    const minDistance = 125; // Separation comfort zone

    for (const other of state.players) {
      if (other.id === player.id || !state.active[other.id]) continue;

      const dx = player.x - other.x;
      const dy = player.y - other.y;
      const dist = vecLength(dx, dy);

      if (dist < minDistance && dist > 0) {
        const strength = ((minDistance - dist) / minDistance) * (other.side === player.side ? 1.6 : 0.8);
        repelX += (dx / dist) * strength * 220;
        repelY += (dy / dist) * strength * 220;
      }
    }

    return [repelX, repelY];
  }
}

/**
 * Calculates perpendicular distance from a point (px, py) to a segment (x1, y1)-(x2, y2).
 */
function pointToSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return vecLength(px - x1, py - y1);

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;

  return vecLength(px - projX, py - projY);
}
