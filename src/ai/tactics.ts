import { vecLength } from '../engine/math';
import { GameState, Player, Team } from '../engine/types';

export type TacticalRole =
  | 'duelist'
  | 'presser_2v2'
  | 'cover_2v2'
  | 'sweeper_keeper'
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
  isThroughBall: boolean;
  isBackPass: boolean;
  receiverSeparation: number; // Distance from receiver to nearest opponent
}

export interface ShotOption {
  targetX: number;
  targetY: number;
  score: number;
  isClear: boolean;
  isOpenNet: boolean;
}

export class TacticsManager {
  /**
   * Assigns tactical roles to all active players of a team based on format and game state.
   */
  public static assignTeamRoles(state: GameState, side: Team): Map<number, TacticalRole> {
    const roleMap = new Map<number, TacticalRole>();
    const teammates = state.players.filter(
      (p) => p.side === side && state.active[p.id]
    );

    if (teammates.length === 0) return roleMap;

    // 1v1: Pure duel
    if (teammates.length === 1) {
      roleMap.set(teammates[0].id, 'duelist');
      return roleMap;
    }

    const ball = state.ball;
    const dir = side === 0 ? 1 : -1;
    const ownGoalX = -dir * (state.field.width / 2);

    // 2v2: Dynamic rotation between Presser and Covering Defender (no static keeper)
    if (teammates.length === 2) {
      const p0 = teammates[0];
      const p1 = teammates[1];

      // Measure who is best positioned to press the ball
      const dist0 = vecLength(p0.x - ball.x, p0.y - ball.y);
      const dist1 = vecLength(p1.x - ball.x, p1.y - ball.y);

      // Favor the player who is not caught behind the ball when defending
      const penalty0 = (ball.x - p0.x) * dir < -10 ? 60 : 0;
      const penalty1 = (ball.x - p1.x) * dir < -10 ? 60 : 0;

      if (dist0 + penalty0 <= dist1 + penalty1) {
        roleMap.set(p0.id, 'presser_2v2');
        roleMap.set(p1.id, 'cover_2v2');
      } else {
        roleMap.set(p1.id, 'presser_2v2');
        roleMap.set(p0.id, 'cover_2v2');
      }
      return roleMap;
    }

    // Sort teammates from deepest (closest to own goal) to highest (most advanced)
    // Deepest player is goalkeeper/sweeper
    const sortedByDepth = [...teammates].sort((a, b) => {
      const distA = Math.abs(a.x - ownGoalX);
      const distB = Math.abs(b.x - ownGoalX);
      return distA - distB;
    });

    const primaryPresserId = this.getPrimaryPresser(state, side);

    // 3v3: Sweeper Keeper + Midfielder + Striker
    if (teammates.length === 3) {
      for (const p of teammates) {
        if (p.id === sortedByDepth[0].id) {
          roleMap.set(p.id, 'sweeper_keeper');
        } else if (p.id === primaryPresserId || p.id === sortedByDepth[2].id) {
          roleMap.set(p.id, 'striker');
        } else {
          roleMap.set(p.id, 'midfielder');
        }
      }
      return roleMap;
    }

    // 4v4: Sweeper Keeper + Center Back + Winger + Striker
    if (teammates.length === 4) {
      const keeper = sortedByDepth[0];
      const defender = sortedByDepth[1];
      roleMap.set(keeper.id, 'sweeper_keeper');
      roleMap.set(defender.id, 'center_back');

      const remaining = teammates.filter(
        (p) => p.id !== keeper.id && p.id !== defender.id
      );
      if (remaining.length === 2) {
        // Higher X is striker, other is winger (side depending on Y position)
        const isRem0Higher = (remaining[0].x - remaining[1].x) * dir > 0;
        const striker = isRem0Higher ? remaining[0] : remaining[1];
        const winger = isRem0Higher ? remaining[1] : remaining[0];
        roleMap.set(striker.id, 'striker');
        roleMap.set(winger.id, winger.y < 0 ? 'left_winger' : 'right_winger');
      }
      return roleMap;
    }

    // 5v5: Full Football Formation
    // 1 Sweeper-Keeper, 1 Center Back, 1 Left Winger, 1 Right Winger, 1 Pivot Striker
    const keeper = sortedByDepth[0];
    const defender = sortedByDepth[1];
    roleMap.set(keeper.id, 'sweeper_keeper');
    roleMap.set(defender.id, 'center_back');

    const outfielders = teammates.filter(
      (p) => p.id !== keeper.id && p.id !== defender.id
    );

    // Outfielder furthest forward is the Pivot Striker
    const striker = [...outfielders].sort((a, b) => (b.x - a.x) * dir)[0];
    roleMap.set(striker.id, 'striker');

    const wingers = outfielders.filter((p) => p.id !== striker.id);
    if (wingers.length >= 2) {
      // Top flank (Y < 0) = Left Winger, Bottom flank (Y >= 0) = Right Winger
      const topWinger = wingers[0].y <= wingers[1].y ? wingers[0] : wingers[1];
      const bottomWinger = topWinger === wingers[0] ? wingers[1] : wingers[0];
      roleMap.set(topWinger.id, 'left_winger');
      roleMap.set(bottomWinger.id, 'right_winger');
    } else if (wingers.length === 1) {
      roleMap.set(wingers[0].id, wingers[0].y < 0 ? 'left_winger' : 'right_winger');
    }

    return roleMap;
  }

  /**
   * Identifies the primary presser: the single best-positioned player to challenge the ball.
   */
  public static getPrimaryPresser(state: GameState, side: Team): number {
    const ball = state.ball;
    const dir = side === 0 ? 1 : -1;
    const teammates = state.players.filter(
      (p) => p.side === side && state.active[p.id]
    );

    if (teammates.length === 0) return -1;
    if (teammates.length === 1) return teammates[0].id;

    const halfW = state.field.width / 2;
    const ownGoalX = -dir * halfW;
    const ballDistToOwnGoal = Math.abs(ball.x - ownGoalX);

    let bestId = teammates[0].id;
    let minScore = Infinity;

    for (const p of teammates) {
      const dist = vecLength(p.x - ball.x, p.y - ball.y);
      const isDeepest = Math.abs(p.x - ownGoalX) < 140;

      // In 3v3+, the goalkeeper only steps up to press if the ball is within their defensive danger zone
      if (state.teamSize >= 3 && isDeepest && ballDistToOwnGoal > 280) {
        continue;
      }

      // Penalty if ball is behind player relative to attacking direction
      const isBehind = (ball.x - p.x) * dir < -15;
      const behindPenalty = isBehind ? 110 : 0;

      const score = dist + behindPenalty + (isDeepest && state.teamSize >= 3 ? 150 : 0);
      if (score < minScore) {
        minScore = score;
        bestId = p.id;
      }
    }

    return bestId;
  }

  /**
   * Computes the tactical anchor coordinate on the pitch for a given role and ball state.
   */
  public static getTacticalAnchor(
    state: GameState,
    player: Player,
    role: TacticalRole
  ): { x: number; y: number } {
    const field = state.field;
    const ball = state.ball;
    const side = player.side;
    const dir = side === 0 ? 1 : -1;
    const halfW = field.width / 2;
    const halfH = field.height / 2;
    const halfGoal = field.goal / 2;

    const ownGoalX = -dir * halfW;
    const oppGoalX = dir * halfW;

    // Center-of-gravity shifts as the ball moves
    const ballShiftX = ball.x * 0.45;
    const ballShiftY = ball.y * 0.35;

    switch (role) {
      case 'duelist':
        return { x: ball.x, y: ball.y };

      case 'presser_2v2':
        // Steps up aggressively to duel on the ball
        return { x: ball.x, y: ball.y };

      case 'cover_2v2': {
        // 2v2 Covering player: covers the central channel between ball and own goal
        // Stays 160-240px behind the presser, blocking direct shots while offering back outlet
        const coverX = ownGoalX + dir * Math.max(120, Math.min(halfW * 0.65, (Math.abs(ball.x - ownGoalX) * 0.5)));
        const coverY = ball.y * 0.55;
        return { x: coverX, y: coverY };
      }

      case 'sweeper_keeper': {
        // Sweeper-keeper (Libéro, Neuer style):
        // When ball is in opponent's half, steps out to edge of box (up to 140px from goal line) to support possession
        // When ball enters own half, tracks along the arc to bisect shooting angles
        const isBallInOppHalf = ball.x * dir > 0;
        const keeperBaseX = isBallInOppHalf
          ? ownGoalX + dir * 135
          : ownGoalX + dir * 42;

        const targetY = Math.max(
          -halfGoal + 20,
          Math.min(halfGoal - 20, ball.y * 0.6)
        );
        return { x: keeperBaseX, y: targetY };
      }

      case 'center_back': {
        // Défenseur central récupérateur & relanceur:
        // Position centrally between the ball and own goal, providing an axis outlet ("solution dans l'axe")
        const defX = ownGoalX + dir * Math.max(160, Math.min(halfW * 0.72, halfW * 0.38 + ballShiftX * dir));
        const defY = ballShiftY * 0.45;
        return { x: defX, y: defY };
      }

      case 'left_winger': {
        // Ailier gauche: takes width on the top flank (Y < 0), seeks débordement & cross
        const wingY = -halfH * 0.72;
        const wingX = Math.max(-halfW * 0.4, Math.min(halfW * 0.82, ball.x + dir * 160));
        return { x: wingX, y: wingY };
      }

      case 'right_winger': {
        // Ailier droit: takes width on the bottom flank (Y > 0), seeks débordement & cross
        const wingY = halfH * 0.72;
        const wingX = Math.max(-halfW * 0.4, Math.min(halfW * 0.82, ball.x + dir * 160));
        return { x: wingX, y: wingY };
      }

      case 'midfielder': {
        // Central playmaker / link-up connector
        const midX = ballShiftX * 0.7;
        const midY = ballShiftY * 0.75;
        return { x: midX, y: midY };
      }

      case 'striker': {
        // Buteur en pivot:
        // Always positions in the free pocket of space ahead of defenders ("devant la surface libre des défenseurs")
        return this.findStrikerFreePocket(state, side, oppGoalX, dir, halfGoal);
      }

      default:
        return { x: ball.x, y: ball.y };
    }
  }

  /**
   * Finds the optimal open space pocket for the striker ahead of the opponent's defenders.
   */
  private static findStrikerFreePocket(
    state: GameState,
    side: Team,
    oppGoalX: number,
    dir: number,
    halfGoal: number
  ): { x: number; y: number } {
    const opponents = state.players.filter(
      (p) => p.side !== side && state.active[p.id]
    );

    // Base attack zone in front of opponent box
    const baseTargetX = oppGoalX - dir * 160;

    // 5 candidate pockets across the attacking front
    const candidateYs = [
      -halfGoal * 1.3,
      -halfGoal * 0.65,
      0,
      halfGoal * 0.65,
      halfGoal * 1.3
    ];

    let bestPocket = { x: baseTargetX, y: 0 };
    let maxClearance = -Infinity;

    for (const cy of candidateYs) {
      // Slight staggered X to adapt to offside line and depth
      const cx = baseTargetX + (Math.abs(cy) > halfGoal ? -dir * 30 : 0);

      // Measure distance to closest opponent defender
      let minOppDist = Infinity;
      for (const opp of opponents) {
        const d = vecLength(opp.x - cx, opp.y - cy);
        if (d < minOppDist) minOppDist = d;
      }

      // Bonus if opposite to where ball is (back-post run / second poteau)
      const isSecondPost = (state.ball.y > 0 && cy < 0) || (state.ball.y < 0 && cy > 0);
      const postBonus = isSecondPost ? 80 : 0;

      const score = minOppDist + postBonus;
      if (score > maxClearance) {
        maxClearance = score;
        bestPocket = { x: cx, y: cy };
      }
    }

    return bestPocket;
  }

  /**
   * Evaluates the best available pass to a teammate.
   * Ensures the pass is SAFE: receiver is in clear space away from defenders and passing lane is unblocked.
   */
  public static evaluateBestPass(
    state: GameState,
    passer: Player,
    passClearanceMargin = 35,
    receiverMarkingThreshold = 85,
    leadFactor = 0.25
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
      // 1. Lead pass into open space ahead of teammate run
      const targetX = mate.x + mate.vx * leadFactor;
      const targetY = mate.y + mate.vy * leadFactor;

      const distToMate = vecLength(targetX - ball.x, targetY - ball.y);
      if (distToMate < 65 || distToMate > 720) continue;

      // 2. Check passing lane clearance against all opponents
      let isLaneObstructed = false;
      for (const opp of opponents) {
        const distToLane = pointToSegmentDistance(
          opp.x,
          opp.y,
          ball.x,
          ball.y,
          targetX,
          targetY
        );
        if (distToLane < opp.r + passClearanceMargin) {
          isLaneObstructed = true;
          break;
        }
      }
      if (isLaneObstructed) continue;

      // 3. Check Receiver Separation (Maîtrise du ballon & adversaire non collé)
      let minOppDist = Infinity;
      for (const opp of opponents) {
        const d = vecLength(opp.x - targetX, opp.y - targetY);
        if (d < minOppDist) minOppDist = d;
      }

      // If receiver is tightly marked by an opponent, REJECT the pass (better to hold than give away!)
      if (minOppDist < receiverMarkingThreshold) {
        continue;
      }

      // 4. Tactical valuation of the pass
      let score = 200;

      const passerDistToGoal = Math.abs(oppGoalX - passer.x);
      const mateDistToGoal = Math.abs(oppGoalX - mate.x);

      // Advantage: Through-ball advancing towards goal
      const isForwardAdvance = (targetX - passer.x) * dir > 40;
      let isThroughBall = false;
      if (isForwardAdvance) {
        score += (passerDistToGoal - mateDistToGoal) * 1.6;
        if (mateDistToGoal < passerDistToGoal - 100) {
          isThroughBall = true;
          score += 240;
        }
      }

      // Advantage: Crossing from wing to central box ("Centre")
      const isWingCarrier = Math.abs(ball.y) > 120;
      const isCentralMate = Math.abs(targetY) < 120;
      let isCross = false;
      if (isWingCarrier && isCentralMate && mateDistToGoal < 300) {
        score += 420; // High value for cross to striker
        isCross = true;
      }

      // Advantage: Backward recycling pass ("Relance en retrait") when carrier is pressed
      let isBackPass = false;
      const isPressedByOpponent = opponents.some(
        (opp) => vecLength(opp.x - passer.x, opp.y - passer.y) < 75
      );
      if (!isForwardAdvance && isPressedByOpponent && minOppDist > 140) {
        score += 260; // Rewarding safe reset over turnover
        isBackPass = true;
      }

      // Bonus for wide-open teammate
      score += Math.min(220, (minOppDist - receiverMarkingThreshold) * 1.5);

      if (score > maxScore) {
        maxScore = score;
        bestOption = {
          targetPlayer: mate,
          targetX,
          targetY,
          score,
          isCross,
          isThroughBall,
          isBackPass,
          receiverSeparation: minOppDist
        };
      }
    }

    return bestOption;
  }

  /**
   * Evaluates shooting opportunity on opponent's goal.
   */
  public static evaluateShot(
    state: GameState,
    shooter: Player
  ): ShotOption {
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

    // Candidate shot targets: Top post, Center, Bottom post
    const testTargets = [
      { x: oppGoalX, y: -halfGoal + 26 },
      { x: oppGoalX, y: 0 },
      { x: oppGoalX, y: halfGoal - 26 }
    ];

    let bestTarget = testTargets[1];
    let maxShotScore = -Infinity;
    let isFullyClear = false;

    // Detect if keeper is in goal mouth
    const keeper = opponents.find(
      (opp) => Math.abs(opp.x - oppGoalX) < 120 && Math.abs(opp.y) < halfGoal + 30
    );

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

      let score = 320 - distToGoal * 0.4;
      if (!isBlocked) {
        score += 480;
        isFullyClear = true;
      } else {
        score += minBlockerDist * 2.2;
      }

      // If keeper is diving one way, aim for the opposite post
      if (keeper) {
        const keeperToPostDist = Math.abs(keeper.y - target.y);
        score += keeperToPostDist * 1.8;
      }

      if (score > maxShotScore) {
        maxShotScore = score;
        bestTarget = target;
      }
    }

    // Empty net detection
    const isOpenNet = !keeper && distToGoal < 550;
    if (isOpenNet) {
      maxShotScore += 800;
      isFullyClear = true;
    }

    return {
      targetX: bestTarget.x,
      targetY: bestTarget.y,
      score: maxShotScore,
      isClear: isFullyClear,
      isOpenNet
    };
  }

  /**
   * Spatial boids repulsion to prevent crowding and preserve formation spacing.
   */
  public static computeSeparation(
    state: GameState,
    player: Player
  ): [number, number] {
    let repelX = 0;
    let repelY = 0;
    const minDistance = 135;

    for (const other of state.players) {
      if (other.id === player.id || !state.active[other.id]) continue;

      const dx = player.x - other.x;
      const dy = player.y - other.y;
      const dist = vecLength(dx, dy);

      if (dist < minDistance && dist > 0) {
        const strength =
          ((minDistance - dist) / minDistance) *
          (other.side === player.side ? 1.7 : 0.9);
        repelX += (dx / dist) * strength * 240;
        repelY += (dy / dist) * strength * 240;
      }
    }

    return [repelX, repelY];
  }
}

/**
 * Calculates perpendicular distance from point (px, py) to line segment (x1, y1)-(x2, y2).
 */
export function pointToSegmentDistance(
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
