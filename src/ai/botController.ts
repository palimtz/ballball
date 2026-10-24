import { PHYSICS_CONFIG } from '../engine/constants';
import { normalizeVec, vecLength } from '../engine/math';
import { GameState, Player, PlayerInput, Team } from '../engine/types';
import { PassOption, ShotOption, TacticalRole, TacticsManager } from './tactics';

export type BotDifficulty = 'easy' | 'medium' | 'hard';

interface DifficultyConfig {
  name: string;
  reactionDelayTicks: number;
  passClearanceMargin: number;
  receiverMarkingThreshold: number;
  shotAccuracyNoise: number;
  boostAggressiveness: number;
  sweeperRushAggressiveness: number;
  oneTouchPivotProbability: number;
}

export const DIFFICULTY_CONFIGS: Record<BotDifficulty, DifficultyConfig> = {
  easy: {
    name: 'Facile',
    reactionDelayTicks: 14, // ~116ms perception delay
    passClearanceMargin: 22,
    receiverMarkingThreshold: 60,
    shotAccuracyNoise: 0.2,
    boostAggressiveness: 0.3,
    sweeperRushAggressiveness: 0.35,
    oneTouchPivotProbability: 0.35
  },
  medium: {
    name: 'Moyen',
    reactionDelayTicks: 4, // ~33ms perception delay
    passClearanceMargin: 36,
    receiverMarkingThreshold: 90,
    shotAccuracyNoise: 0.07,
    boostAggressiveness: 0.75,
    sweeperRushAggressiveness: 0.75,
    oneTouchPivotProbability: 0.7
  },
  hard: {
    name: 'Difficile',
    reactionDelayTicks: 0, // instantaneous 120Hz reaction
    passClearanceMargin: 55,
    receiverMarkingThreshold: 130, // only passes when teammate is totally clear
    shotAccuracyNoise: 0.0,
    boostAggressiveness: 1.0,
    sweeperRushAggressiveness: 1.0, // Neuer-style sweeper rushes
    oneTouchPivotProbability: 0.95
  }
};

interface BotMemory {
  ballHistory: Array<{ tick: number; x: number; y: number; vx: number; vy: number }>;
  pivotHoldTicks: number;
  isSweeperRushing: boolean;
  assignedRole: TacticalRole;
}

export class BotAI {
  private difficulty: BotDifficulty = 'medium';
  private botMemories = new Map<number, BotMemory>();
  private lastRolesTick = -1;
  private teamRoles = new Map<Team, Map<number, TacticalRole>>();

  constructor(initialDifficulty: BotDifficulty = 'medium') {
    this.difficulty = initialDifficulty;
  }

  public setDifficulty(diff: BotDifficulty): void {
    this.difficulty = diff;
  }

  public getDifficulty(): BotDifficulty {
    return this.difficulty;
  }

  public reset(): void {
    this.botMemories.clear();
    this.teamRoles.clear();
    this.lastRolesTick = -1;
  }

  private getMemory(playerId: number): BotMemory {
    let mem = this.botMemories.get(playerId);
    if (!mem) {
      mem = {
        ballHistory: [],
        pivotHoldTicks: 0,
        isSweeperRushing: false,
        assignedRole: 'duelist'
      };
      this.botMemories.set(playerId, mem);
    }
    return mem;
  }

  /**
   * Main input computation for an AI bot player.
   */
  public computeInput(state: GameState, player: Player): PlayerInput {
    if (state.phase !== 'playing') {
      return { x: 0, y: 0, boost: false, kick: false };
    }

    const config = DIFFICULTY_CONFIGS[this.difficulty];
    const mem = this.getMemory(player.id);

    // 1. Update ball perception history for reaction delay in Easy/Medium
    mem.ballHistory.push({
      tick: state.tick,
      x: state.ball.x,
      y: state.ball.y,
      vx: state.ball.vx,
      vy: state.ball.vy
    });
    if (mem.ballHistory.length > 25) {
      mem.ballHistory.shift();
    }

    // Perceived ball position based on difficulty delay
    const targetHistoryTick = Math.max(0, state.tick - config.reactionDelayTicks);
    const perceivedBall =
      mem.ballHistory.find((entry) => entry.tick >= targetHistoryTick) || state.ball;

    const side = player.side;
    const dir = side === 0 ? 1 : -1; // 1 = attacking right, -1 = attacking left
    const field = state.field;
    const halfW = field.width / 2;
    const halfGoal = field.goal / 2;

    const ownGoalX = -dir * halfW;
    const oppGoalX = dir * halfW;

    // 2. Synchronized Team Role Assignment (updated once per tick per side)
    if (this.lastRolesTick !== state.tick) {
      this.teamRoles.set(0, TacticsManager.assignTeamRoles(state, 0));
      this.teamRoles.set(1, TacticsManager.assignTeamRoles(state, 1));
      this.lastRolesTick = state.tick;
    }

    const role = this.teamRoles.get(side)?.get(player.id) ?? 'duelist';
    mem.assignedRole = role;

    const primaryPresserId = TacticsManager.getPrimaryPresser(state, side);
    const isPrimaryPresser = player.id === primaryPresserId;

    // Distance to perceived ball
    const dxToBall = perceivedBall.x - player.x;
    const dyToBall = perceivedBall.y - player.y;
    const distToBall = vecLength(dxToBall, dyToBall);

    // 3. Tactical Action Evaluation: Passing vs Shooting
    const shotOption: ShotOption = TacticsManager.evaluateShot(state, player);
    const passOption: PassOption | null = TacticsManager.evaluateBestPass(
      state,
      player,
      config.passClearanceMargin,
      config.receiverMarkingThreshold
    );

    // Decide if passing or shooting
    let shouldPass = false;
    if (passOption !== null) {
      // Striker prioritizes goals unless an open-net cross/through-ball is overwhelmingly better
      if (role === 'striker') {
        shouldPass = !shotOption.isClear && passOption.score > shotOption.score + 180;
      }
      // Wingers prioritize crosses from the wing
      else if (role === 'left_winger' || role === 'right_winger') {
        const isInCrossingPocket = Math.abs(perceivedBall.x - oppGoalX) < 320 && Math.abs(perceivedBall.y) > 110;
        shouldPass = isInCrossingPocket ? passOption.isCross || !shotOption.isClear : passOption.score > shotOption.score;
      }
      // Center backs and midfielders prioritize safe distribution (relance)
      else if (role === 'center_back' || role === 'midfielder') {
        shouldPass = true;
      }
      // 2v2 Presser passes if teammate is in open space
      else if (role === 'presser_2v2') {
        shouldPass = passOption.score > shotOption.score || !shotOption.isClear;
      } else {
        shouldPass = passOption.score > shotOption.score || !shotOption.isClear;
      }
    }

    let actionTargetX = shouldPass && passOption ? passOption.targetX : shotOption.targetX;
    let actionTargetY = shouldPass && passOption ? passOption.targetY : shotOption.targetY;

    // Add difficulty accuracy noise to shots for Easy
    if (!shouldPass && config.shotAccuracyNoise > 0) {
      const angle = Math.atan2(actionTargetY - perceivedBall.y, actionTargetX - perceivedBall.x);
      const noisyAngle = angle + (Math.sin(state.tick * 0.17 + player.id) * config.shotAccuracyNoise);
      const targetDist = vecLength(actionTargetX - perceivedBall.x, actionTargetY - perceivedBall.y);
      actionTargetX = perceivedBall.x + Math.cos(noisyAngle) * targetDist;
      actionTargetY = perceivedBall.y + Math.sin(noisyAngle) * targetDist;
    }

    // 4. Movement Target Determination based on role and play phase
    let targetX = 0;
    let targetY = 0;

    // Check if Goalkeeper should execute a Sweeper Rush ("Sortie Libéro")
    if (role === 'sweeper_keeper') {
      const isBallInDefHalf = perceivedBall.x * dir < 60;
      const isBallHeadingToGoal = dir === 1 ? perceivedBall.vx < -60 : perceivedBall.vx > 60;
      const distKeeperToBall = vecLength(perceivedBall.x - player.x, perceivedBall.y - player.y);

      // Find closest opponent to ball
      let minOppDistToBall = Infinity;
      for (const opp of state.players) {
        if (opp.side !== side && state.active[opp.id]) {
          const d = vecLength(perceivedBall.x - opp.x, perceivedBall.y - opp.y);
          if (d < minOppDistToBall) minOppDistToBall = d;
        }
      }

      // Sweeper trigger: ball loose in own half and keeper can beat the attacker to it
      const canBeatAttacker = distKeeperToBall < minOppDistToBall - 30;
      if (
        isBallInDefHalf &&
        (isBallHeadingToGoal || canBeatAttacker) &&
        distKeeperToBall < 380 * config.sweeperRushAggressiveness
      ) {
        mem.isSweeperRushing = true;
      } else if (distKeeperToBall > 420 || perceivedBall.x * dir > 80) {
        mem.isSweeperRushing = false;
      }
    } else {
      mem.isSweeperRushing = false;
    }

    // Role-specific movement
    if (isPrimaryPresser || role === 'duelist' || mem.isSweeperRushing) {
      // Position behind ball relative to action target
      const [aimDx, aimDy] = normalizeVec(
        actionTargetX - perceivedBall.x,
        actionTargetY - perceivedBall.y
      );

      const approachDist = 26;
      targetX = perceivedBall.x - aimDx * approachDist + perceivedBall.vx * 0.16;
      targetY = perceivedBall.y - aimDy * approachDist + perceivedBall.vy * 0.16;

      // Prevent pushing ball into own goal when caught behind
      const isBehindBallTrapped = dir === 1 ? perceivedBall.x < player.x - 10 : perceivedBall.x > player.x + 10;
      if (isBehindBallTrapped && Math.abs(dyToBall) < 45) {
        targetY += perceivedBall.y > 0 ? -75 : 75;
      }
    } else {
      // Off-ball role positioning
      const anchor = TacticsManager.getTacticalAnchor(state, player, role);
      targetX = anchor.x;
      targetY = anchor.y;

      // Sweeper Keeper shot stopping line
      if (role === 'sweeper_keeper') {
        const isDangerousShot = dir === 1 ? perceivedBall.vx < -140 : perceivedBall.vx > 140;
        if (isDangerousShot) {
          const timeToLine = Math.abs((ownGoalX - perceivedBall.x) / perceivedBall.vx);
          const interceptY = perceivedBall.y + perceivedBall.vy * timeToLine;
          targetY = Math.max(-halfGoal + 18, Math.min(halfGoal - 18, interceptY));
        }
      }

      // Center Back defensive interception: step up to cut loose ball or deep pass
      if (role === 'center_back') {
        const isBallInZone = Math.abs(perceivedBall.x - ownGoalX) < halfW * 0.7;
        const isBallClose = distToBall < 200;
        if (isBallInZone && isBallClose) {
          targetX = perceivedBall.x;
          targetY = perceivedBall.y;
        }
      }
    }

    // 5. Striker Pivot Play (Jeu en pivot)
    if (role === 'striker' && distToBall < 45) {
      mem.pivotHoldTicks++;
      // Check if defender is close behind striker
      const oppBehind = state.players.some(
        (opp) =>
          opp.side !== side &&
          state.active[opp.id] &&
          (opp.x - player.x) * dir < -10 &&
          vecLength(opp.x - player.x, opp.y - player.y) < 70
      );

      // If marked tightly from behind, execute one-touch lay-off to arriving runner
      if (oppBehind && passOption && passOption.isBackPass && Math.random() < config.oneTouchPivotProbability) {
        actionTargetX = passOption.targetX;
        actionTargetY = passOption.targetY;
        shouldPass = true;
      }
    } else {
      mem.pivotHoldTicks = 0;
    }

    // 6. Anti-clumping spatial separation
    const [repelX, repelY] = TacticsManager.computeSeparation(state, player);
    targetX += repelX;
    targetY += repelY;

    // 7. Kicking Decision & Timing
    const kickRange = player.r + state.ball.r + PHYSICS_CONFIG.kickGap + 6;
    let shouldKick = false;

    if (distToBall <= kickRange) {
      const facingOpponentGoal = dir === 1 ? dxToBall > -16 : dxToBall < 16;
      const isInOwnBox = Math.abs(player.x - ownGoalX) < 190 && Math.abs(player.y) < halfGoal + 70;

      // Emergency clearance in own box
      if (isInOwnBox) {
        shouldKick = true;
      }
      // Striker one-touch finish or lay-off
      else if (role === 'striker') {
        shouldKick = true;
      }
      // Cross execution from winger
      else if ((role === 'left_winger' || role === 'right_winger') && passOption?.isCross) {
        shouldKick = true;
      }
      // Clean pass or shot
      else if (facingOpponentGoal || shouldPass) {
        shouldKick = true;
      }
    }

    // 8. Boost / Sprint Mechanics
    let shouldBoost = false;
    if (player.charges > 0 && player.boostCd === 0 && Math.random() <= config.boostAggressiveness) {
      // Sweeper Keeper dive or sweeper rush
      if (role === 'sweeper_keeper') {
        const isDangerousShot = dir === 1 ? perceivedBall.vx < -260 : perceivedBall.vx > 260;
        if (isDangerousShot && Math.abs(perceivedBall.y - player.y) > 35 && distToBall < 280) {
          shouldBoost = true;
        } else if (mem.isSweeperRushing && distToBall > 90) {
          shouldBoost = true;
        }
      }
      // Primary Presser sprint on breakaway or 50/50 loose ball
      else if (isPrimaryPresser || role === 'presser_2v2' || role === 'duelist') {
        if (shotOption.isOpenNet && Math.abs(oppGoalX - player.x) < 420) {
          shouldBoost = true;
        } else if (distToBall > 160 && distToBall < 420) {
          const dot = (dxToBall / distToBall) * dir;
          if (dot > 0.8) {
            shouldBoost = true;
          }
        }
      }
      // Center back emergency recovery
      else if (role === 'center_back' || role === 'cover_2v2') {
        const opponentBreakaway = dir === 1 ? perceivedBall.x < player.x - 30 : perceivedBall.x > player.x + 30;
        if (opponentBreakaway && Math.abs(player.x - ownGoalX) > 160) {
          shouldBoost = true;
        }
      }
    }

    // 9. Compute movement vector
    const [moveX, moveY] = normalizeVec(targetX - player.x, targetY - player.y);

    return {
      x: moveX,
      y: moveY,
      boost: shouldBoost,
      kick: shouldKick
    };
  }
}
