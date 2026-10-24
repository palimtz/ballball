export type Team = 0 | 1; // 0 = Lilac (left), 1 = Coral (right)

export interface Vector2D {
  x: number;
  y: number;
}

export type Quaternion = [number, number, number, number]; // [x, y, z, w]

export interface PlayerInput {
  x: number; // -1 to 1 (direction X)
  y: number; // -1 to 1 (direction Y)
  boost: boolean;
  kick: boolean;
}

export interface Player {
  id: number;
  side: Team;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  aimX: number;
  aimY: number;

  // Boost & Kick resources
  charges: number; // 0..3
  regen: number; // ticks towards next charge
  boostCd: number; // cooldown timer (ticks)
  kickCd: number; // cooldown timer (ticks)
  burst: number; // boost active timer (ticks)

  // Visual cues & stats
  signal: number; // kick visual glow / ripple timer
  signalHit: boolean; // whether last kick struck the ball
  signalAngle: number;
  shots: number;
  boosts: number;
  crowded: number; // crowding penalty counter
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  spin: number; // Angular velocity (rad/s)
  orientation: Quaternion; // 3D roll rotation for visual texture
}

export interface StadiumField {
  width: number;
  height: number;
  goal: number; // Opening width of the goal
  depth: number; // Depth of the goal cavity
  corner: number; // Rounded corner radius
}

export interface NetNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
}

export interface GoalNets {
  left: NetNode[];
  right: NetNode[];
}

export type GamePhase = 'countdown' | 'playing' | 'goal' | 'replay' | 'finished';

export interface GameEvent {
  type: 'kick' | 'hit' | 'wall' | 'boost' | 'goal';
  x: number;
  y: number;
  power: number;
  side: Team;
}

export interface GameState {
  tick: number;
  phase: GamePhase;
  phaseTicks: number; // Remaining ticks in current phase
  time: number; // Match clock (ticks remaining)
  teamSize: number; // 1, 2, 3, 4, or 5
  score: [number, number];
  scorer: Team;
  goalTick: number; // Tick when the most recent goal was scored (-1 if none)
  field: StadiumField;
  players: Player[];
  ball: Ball;
  nets: GoalNets; // Interactive physics nets for both goals
  bot: boolean[]; // whether player id is AI controlled
  active: boolean[]; // whether player slot is active in match
  events: GameEvent[]; // events emitted in current tick (audio / VFX)
  lastTouch: number; // player id of last contact
  lastKick: number; // player id of last kick
}
