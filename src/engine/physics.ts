import {
  CROWDING_CONFIG,
  MATCH_RULES,
  PHYSICS_CONFIG,
  SUB_STEP_DT,
  SUB_STEPS,
  TICK_DT
} from './constants';
import { resolveCircleCollision, resolveWallCollisions } from './collisions';
import { clampLength, integrateBallQuaternion, normalizeVec, vecLength } from './math';
import { applyMagnusCurvature, calculateKickSpin } from './spin';
import { getPlayerSpawn } from './stadium';
import { GameState, Player, PlayerInput } from './types';

/**
 * Updates player acceleration, boost activation, aim direction, and drag.
 * Implementation of function `M1` from decompiled ballball codebase.
 */
export function updatePlayerMovement(
  player: Player,
  input: PlayerInput,
  crowdAccelMultiplier: number,
  events: GameState['events']
): void {
  const [inX, inY] = normalizeVec(input.x, input.y);
  const isMoving = inX !== 0 || inY !== 0;

  // Timers and cooldowns
  player.boostCd = Math.max(0, player.boostCd - 1);
  player.kickCd = Math.max(0, player.kickCd - 1);
  player.signal = Math.max(0, player.signal - 1);
  player.burst = Math.max(0, player.burst - 1);

  // Boost charge regeneration
  if (player.charges < MATCH_RULES.boostCapacity) {
    if (++player.regen >= MATCH_RULES.boostRegen) {
      player.charges++;
      player.regen = 0;
    }
  }

  // Update aim direction
  if (isMoving) {
    player.aimX = inX;
    player.aimY = inY;
  }

  // Boost activation
  if (input.boost && player.boostCd === 0 && player.charges > 0) {
    if (player.charges === MATCH_RULES.boostCapacity) {
      player.regen = 0;
    }
    player.charges--;
    player.boostCd = MATCH_RULES.boostCooldown;
    player.burst = PHYSICS_CONFIG.boostDuration;
    player.boosts++;

    // Boost impulse along aim direction
    player.vx += player.aimX * PHYSICS_CONFIG.boostImpulse;
    player.vy += player.aimY * PHYSICS_CONFIG.boostImpulse;

    events.push({
      type: 'boost',
      x: player.x,
      y: player.y,
      power: 1.0,
      side: player.side
    });
  }

  // Exponential drag selection
  const drag =
    player.burst > 0
      ? PHYSICS_CONFIG.boostDrag
      : isMoving
      ? PHYSICS_CONFIG.runDrag
      : PHYSICS_CONFIG.coastDrag;

  // Acceleration applied along input vector
  const effectiveAccel = PHYSICS_CONFIG.runAcceleration * crowdAccelMultiplier;
  player.vx = (player.vx + inX * effectiveAccel * TICK_DT) * Math.exp(-drag * TICK_DT);
  player.vy = (player.vy + inY * effectiveAccel * TICK_DT) * Math.exp(-drag * TICK_DT);

  // Clamp player to top speed
  clampLength(player, PHYSICS_CONFIG.playerMaxSpeed);
}

/**
 * Master simulation step executed at 120 Hz.
 * Implementation of function `_at` from decompiled ballball codebase.
 */
export function simulateTick(state: GameState, inputs: PlayerInput[]): void {
  state.tick++;
  state.events = [];

  // Phase: Countdown (players locked at kickoff spots until whistle)
  if (state.phase === 'countdown') {
    for (const player of state.players) {
      const spawn = getPlayerSpawn(player.side, player.id, state.teamSize, state.field);
      player.x = spawn.x;
      player.y = spawn.y;
      player.vx = 0;
      player.vy = 0;
    }
    state.ball.x = 0;
    state.ball.y = 0;
    state.ball.vx = 0;
    state.ball.vy = 0;
    if (--state.phaseTicks <= 0) {
      state.phase = 'playing';
      state.events.push({
        type: 'hit',
        x: 0,
        y: 0,
        power: 1.5,
        side: 0
      });
    }
    return;
  }

  // Phase: Goal Celebration (players can move and celebrate as ball settles in net)
  if (state.phase === 'goal') {
    for (let i = 0; i < state.players.length; i++) {
      const player = state.players[i];
      if (state.active[player.id]) {
        updatePlayerMovement(player, inputs[i], 1.0, state.events);
      }
    }
    state.ball.vx *= Math.exp(-PHYSICS_CONFIG.ballDrag * TICK_DT * 1.5);
    state.ball.vy *= Math.exp(-PHYSICS_CONFIG.ballDrag * TICK_DT * 1.5);

    // Continuous sub-stepping for smooth net contact
    for (let step = 0; step < SUB_STEPS; step++) {
      for (const player of state.players) {
        if (!state.active[player.id]) continue;
        player.x += player.vx * SUB_STEP_DT;
        player.y += player.vy * SUB_STEP_DT;
      }
      state.ball.x += state.ball.vx * SUB_STEP_DT;
      state.ball.y += state.ball.vy * SUB_STEP_DT;

      for (const player of state.players) {
        if (state.active[player.id]) {
          resolveWallCollisions(state, player, false);
        }
      }
      resolveWallCollisions(state, state.ball, true);
    }

    if (--state.phaseTicks <= 0) {
      state.phase = 'replay';
      state.phaseTicks = MATCH_RULES.replay;
    }
    return;
  }

  // Phase: Replay
  if (state.phase === 'replay') {
    return;
  }

  if (state.phase === 'finished') return;

  // Decrement match clock
  if (state.time > 0) {
    state.time--;
    if (state.time === 0) {
      state.phase = 'finished';
      return;
    }
  }

  // Crowding penalty calculations
  for (const player of state.players) {
    if (!state.active[player.id]) continue;
    let teammateNearBall = false;
    const distToBall = vecLength(player.x - state.ball.x, player.y - state.ball.y);

    for (const other of state.players) {
      if (
        other === player ||
        other.side !== player.side ||
        !state.active[other.id]
      )
        continue;
      if (vecLength(other.x - player.x, other.y - player.y) < CROWDING_CONFIG.radius) {
        if (vecLength(other.x - state.ball.x, other.y - state.ball.y) < distToBall) {
          teammateNearBall = true;
          break;
        }
      }
    }

    if (teammateNearBall) {
      player.crowded = Math.min(
        CROWDING_CONFIG.delay + CROWDING_CONFIG.ramp,
        player.crowded + 1
      );
    } else {
      player.crowded = Math.max(0, player.crowded - CROWDING_CONFIG.recovery);
    }

    // Crowd penalty factor
    const crowdProgress = Math.max(
      0,
      Math.min(
        1,
        (player.crowded - CROWDING_CONFIG.delay) / CROWDING_CONFIG.ramp
      )
    );
    const crowdMultiplier =
      1 - (1 - CROWDING_CONFIG.acceleration) * crowdProgress;

    // Movement update
    const pInput = inputs[player.id] ?? { x: 0, y: 0, boost: false, kick: false };
    updatePlayerMovement(player, pInput, crowdMultiplier, state.events);
  }

  // Kicking resolution
  handlePlayerKicks(state, inputs);

  // Ball aerodynamics: spin curve (Magnus effect) and exponential air drag
  applyMagnusCurvature(state.ball, TICK_DT);
  state.ball.vx *= Math.exp(-PHYSICS_CONFIG.ballDrag * TICK_DT);
  state.ball.vy *= Math.exp(-PHYSICS_CONFIG.ballDrag * TICK_DT);
  clampLength(state.ball, PHYSICS_CONFIG.ballMaxSpeed);

  if (vecLength(state.ball.vx, state.ball.vy) < PHYSICS_CONFIG.ballStopSpeed) {
    state.ball.vx = 0;
    state.ball.vy = 0;
  }

  // 4x Sub-stepping for positional integration and continuous collision resolution
  for (let step = 0; step < SUB_STEPS; step++) {
    // 1. Position update
    for (const player of state.players) {
      if (!state.active[player.id]) continue;
      player.x += player.vx * SUB_STEP_DT;
      player.y += player.vy * SUB_STEP_DT;
    }
    state.ball.x += state.ball.vx * SUB_STEP_DT;
    state.ball.y += state.ball.vy * SUB_STEP_DT;

    // 2. Player-vs-Player collisions
    for (let i = 0; i < state.players.length; i++) {
      if (!state.active[i]) continue;
      for (let j = i + 1; j < state.players.length; j++) {
        if (!state.active[j]) continue;
        resolveCircleCollision(
          state,
          state.players[i],
          state.players[j],
          1,
          1,
          PHYSICS_CONFIG.playerBounce,
          false
        );
      }
    }

    // 3. Player-vs-Ball collisions
    for (const player of state.players) {
      if (!state.active[player.id]) continue;
      const restitution =
        player.burst > 0
          ? PHYSICS_CONFIG.boostedTouchBounce
          : PHYSICS_CONFIG.touchBounce;

      resolveCircleCollision(
        state,
        player,
        state.ball,
        PHYSICS_CONFIG.playerInverseMass,
        PHYSICS_CONFIG.ballInverseMass,
        restitution,
        true
      );
    }

    // 4. Wall & Goal collisions
    for (const player of state.players) {
      if (state.active[player.id]) {
        resolveWallCollisions(state, player, false);
      }
    }
    resolveWallCollisions(state, state.ball, true);
  }

  // Update 3D Quaternion ball rolling orientation
  state.ball.orientation = integrateBallQuaternion(
    state.ball.orientation,
    state.ball.vx,
    state.ball.vy,
    state.ball.spin,
    state.ball.r,
    TICK_DT
  );
}

/**
 * Resolves kick inputs, shot velocities, recoil, and spin.
 */
function handlePlayerKicks(state: GameState, inputs: PlayerInput[]): void {
  const ball = state.ball;
  let totalShotVx = 0;
  let totalShotVy = 0;
  let totalSpin = 0;
  let kickingCount = 0;

  for (const player of state.players) {
    if (!state.active[player.id]) continue;
    const input = inputs[player.id];
    if (!input?.kick || player.kickCd > 0) continue;

    // Trigger visual kick indicator
    player.kickCd = MATCH_RULES.kickCooldown;
    player.signal = 42;
    player.signalHit = false;

    // Distance to ball
    const dx = ball.x - player.x;
    const dy = ball.y - player.y;
    const dist = vecLength(dx, dy);
    const maxKickDist = player.r + ball.r + PHYSICS_CONFIG.kickGap;

    if (dist <= maxKickDist) {
      const [dirX, dirY] =
        dist > 0.001 ? [dx / dist, dy / dist] : [player.aimX, player.aimY];

      // Shot velocity = shotSpeed in kick direction + player momentum transfer
      const shotVx = dirX * PHYSICS_CONFIG.shotSpeed + player.vx * PHYSICS_CONFIG.shotMomentum;
      const shotVy = dirY * PHYSICS_CONFIG.shotSpeed + player.vy * PHYSICS_CONFIG.shotMomentum;
      const kickSpin = calculateKickSpin(ball, player, dirX, dirY);

      totalShotVx += shotVx;
      totalShotVy += shotVy;
      totalSpin += kickSpin;
      kickingCount++;

      // Player recoil in opposite direction
      player.vx -= dirX * 40;
      player.vy -= dirY * 40;
      player.shots++;
      player.signalHit = true;
      player.signalAngle = Math.atan2(dirY, dirX);

      state.lastTouch = player.id;
      state.lastKick = player.id;

      state.events.push({
        type: 'kick',
        x: ball.x,
        y: ball.y,
        power: 1.0,
        side: player.side
      });
    } else {
      // Missed kick sound / event
      state.events.push({
        type: 'kick',
        x: player.x,
        y: player.y,
        power: 0.18,
        side: player.side
      });
    }
  }

  // If multiple players kick simultaneously, average the impulse
  if (kickingCount > 0) {
    ball.vx = totalShotVx / kickingCount;
    ball.vy = totalShotVy / kickingCount;
    ball.spin = totalSpin / kickingCount;
  }
}

/**
 * Finishes the replay and triggers the kickoff countdown.
 */
export function finishReplay(state: GameState): void {
  if (
    state.score[0] >= MATCH_RULES.winScore ||
    state.score[1] >= MATCH_RULES.winScore
  ) {
    state.phase = 'finished';
    return;
  }
  resetForKickoff(state);
  state.phase = 'countdown';
  state.phaseTicks = MATCH_RULES.countdown;
}

/**
 * Resets players to spawn positions and ball to center field.
 */
export function resetForKickoff(state: GameState): void {
  state.ball.x = 0;
  state.ball.y = 0;
  state.ball.vx = 0;
  state.ball.vy = 0;
  state.ball.spin = 0;
  state.lastTouch = -1;
  state.lastKick = -1;

  for (const player of state.players) {
    const spawn = getPlayerSpawn(player.side, player.id, state.teamSize, state.field);
    player.x = spawn.x;
    player.y = spawn.y;
    player.vx = 0;
    player.vy = 0;
    player.aimX = player.side === 0 ? 1 : -1;
    player.aimY = 0;
    player.charges = MATCH_RULES.boostCapacity;
    player.regen = 0;
    player.boostCd = 0;
    player.kickCd = 0;
    player.burst = 0;
    player.signal = 0;
    player.crowded = 0;
  }
}
