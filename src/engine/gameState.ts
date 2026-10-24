import { MATCH_RULES, PHYSICS_CONFIG } from './constants';
import { getPlayerSpawn, getStadiumField } from './stadium';
import { GameState, GoalNets, NetNode, Player, StadiumField, Team } from './types';

export function createGoalNets(field: StadiumField): GoalNets {
  const halfW = field.width / 2;
  const halfGoal = field.goal / 2;
  const depth = field.depth;
  const nodeCount = 9;

  const leftNodes: NetNode[] = [];
  const rightNodes: NetNode[] = [];

  for (let i = 0; i < nodeCount; i++) {
    const frac = i / (nodeCount - 1);
    const y = -halfGoal + frac * (2 * halfGoal);

    // Left net back line
    const leftX = -halfW - depth;
    leftNodes.push({
      x: leftX,
      y,
      vx: 0,
      vy: 0,
      baseX: leftX,
      baseY: y
    });

    // Right net back line
    const rightX = halfW + depth;
    rightNodes.push({
      x: rightX,
      y,
      vx: 0,
      vy: 0,
      baseX: rightX,
      baseY: y
    });
  }

  return { left: leftNodes, right: rightNodes };
}

export function createInitialPlayer(
  id: number,
  side: Team,
  teamSize: number,
  field: ReturnType<typeof getStadiumField>
): Player {
  const spawn = getPlayerSpawn(side, id, teamSize, field);
  return {
    id,
    side,
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    r: PHYSICS_CONFIG.playerRadius,
    aimX: side === 0 ? 1 : -1,
    aimY: 0,
    charges: MATCH_RULES.boostCapacity,
    regen: 0,
    boostCd: 0,
    kickCd: 0,
    burst: 0,
    signal: 0,
    signalHit: false,
    signalAngle: 0,
    shots: 0,
    boosts: 0,
    crowded: 0
  };
}

export function createGameState(teamSize = 1, isSoloWithBot = true): GameState {
  const field = getStadiumField(teamSize);
  const totalPlayers = teamSize * 2;
  const players: Player[] = [];
  const bot: boolean[] = [];
  const active: boolean[] = [];

  for (let i = 0; i < totalPlayers; i++) {
    const side = (i % 2) as Team; // 0 = Lilac, 1 = Coral
    players.push(createInitialPlayer(i, side, teamSize, field));
    // In solo play, player 0 is human, all others are bots
    bot.push(i !== 0 && isSoloWithBot);
    active.push(true);
  }

  return {
    tick: 0,
    phase: 'countdown',
    phaseTicks: MATCH_RULES.countdown,
    time: teamSize === 1 ? MATCH_RULES.duration1v1 : MATCH_RULES.durationTeam,
    teamSize,
    score: [0, 0],
    scorer: 0,
    goalTick: -1,
    field,
    players,
    nets: createGoalNets(field),
    ball: {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      r: PHYSICS_CONFIG.ballRadius,
      spin: 0,
      orientation: [0, 0, 0, 1]
    },
    bot,
    active,
    events: [],
    lastTouch: -1,
    lastKick: -1
  };
}
