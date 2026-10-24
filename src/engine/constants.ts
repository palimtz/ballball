export const TICKS_PER_SECOND = 120;
export const TICK_DT = 1 / TICKS_PER_SECOND; // ~0.008333s
export const SUB_STEPS = 4;
export const SUB_STEP_DT = TICK_DT / SUB_STEPS; // ~0.002083s

export const MATCH_RULES = {
  duration1v1: 90 * TICKS_PER_SECOND, // 90s
  durationTeam: 180 * TICKS_PER_SECOND, // 180s
  countdown: 240, // 2s before kickoff
  celebration: 240, // 2.0s post-goal celebration before replay
  replay: 600, // 5s max replay
  winScore: 5,
  boostCapacity: 3,
  boostRegen: 5 * TICKS_PER_SECOND, // 600 ticks = 5s
  boostCooldown: 24, // 0.2s between boosts
  kickCooldown: Math.round(TICKS_PER_SECOND / 6) // 20 ticks (~0.166s)
} as const;

export const PHYSICS_CONFIG = {
  // Player dynamics
  runAcceleration: 1250,
  runDrag: 4.35,
  coastDrag: 3.7,
  playerMaxSpeed: 650,
  playerInverseMass: 0.35,
  playerRadius: 23,
  playerWallBounce: 0.08,
  playerBounce: 0.06,

  // Boost mechanics
  boostImpulse: 300,
  boostDuration: 18, // ticks
  boostDrag: 4.0,

  // Ball dynamics
  ballRadius: 12,
  ballInverseMass: 2.8,
  ballDrag: 0.95,
  ballStopSpeed: 10,
  ballMaxSpeed: 880,
  shotSpeed: 620,
  shotMomentum: 0.35,
  kickGap: 12, // range extension beyond player.r + ball.r
  ballWallBounce: 0.62,
  touchBounce: 0.06,
  boostedTouchBounce: 0.16,

  // Goal post radius
  goalPostRadius: 7
} as const;

export const SPIN_CONFIG = {
  inertia: 2 / 3, // Hollow sphere moment of inertia factor
  contactFriction: 0.22,
  wallFriction: 0.28,
  drag: 0.85, // Spin decay rate
  max: 28, // Max angular velocity (rad/s)
  curve: 0.0315, // Magnus trajectory curvature coefficient
  kickTransfer: 0.65, // Tangential velocity converted to spin
  kickRetention: 0.35 // Existing spin retained during kick
} as const;

export const CROWDING_CONFIG = {
  radius: 100,
  ballZone: 150,
  farZone: 500,
  farStrength: 0.3,
  acceleration: 0.6,
  delay: Math.round(TICKS_PER_SECOND / 2), // 60 ticks
  ramp: Math.round(TICKS_PER_SECOND / 4), // 30 ticks
  recovery: 3
} as const;
