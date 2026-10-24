import { GameState, Quaternion, Team } from './types';

export interface RecordedPlayerState {
  id: number;
  side: Team;
  x: number;
  y: number;
  vx: number;
  vy: number;
  aimX: number;
  aimY: number;
  burst: number;
  signal: number;
  charges: number;
}

export interface ReplayFrame {
  tick: number;
  ball: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    spin: number;
    orientation: Quaternion;
  };
  players: RecordedPlayerState[];
  nets?: {
    left: { x: number; y: number }[];
    right: { x: number; y: number }[];
  };
}

export interface GoalClip {
  frames: ReplayFrame[];
  scorerTeam: Team;
  lastTouchPlayerId: number;
  startTick: number;
  endTick: number;
}

export class ReplaySystem {
  // Keep up to 600 frames (5 seconds at 120 Hz)
  private static readonly MAX_BUFFER_FRAMES = 600;
  private ringBuffer: ReplayFrame[] = [];
  private activeClip: GoalClip | null = null;
  private playbackIndex = 0;
  private startTime = 0;

  /**
   * Records a snapshot of the current frame into the sliding ring buffer.
   */
  public recordFrame(state: GameState): void {
    const frame: ReplayFrame = {
      tick: state.tick,
      ball: {
        x: state.ball.x,
        y: state.ball.y,
        vx: state.ball.vx,
        vy: state.ball.vy,
        r: state.ball.r,
        spin: state.ball.spin,
        orientation: [...state.ball.orientation] as Quaternion
      },
      players: state.players.map((p) => ({
        id: p.id,
        side: p.side,
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        aimX: p.aimX,
        aimY: p.aimY,
        burst: p.burst,
        signal: p.signal,
        charges: p.charges
      })),
      nets: state.nets
        ? {
            left: state.nets.left.map((n) => ({ x: n.x, y: n.y })),
            right: state.nets.right.map((n) => ({ x: n.x, y: n.y }))
          }
        : undefined
    };

    this.ringBuffer.push(frame);
    if (this.ringBuffer.length > ReplaySystem.MAX_BUFFER_FRAMES) {
      this.ringBuffer.shift();
    }
  }

  /**
   * Captures the action leading to the goal as a replay clip.
   * If goalTick is provided, it extracts ~280 frames before the goal and ~65 frames after,
   * keeping the focus primarily on the build-up, shot, curve, and net impact,
   * rather than excessive post-goal celebration.
   */
  public captureGoalClip(scorerTeam: Team, lastTouchPlayerId: number, goalTick?: number): void {
    if (this.ringBuffer.length === 0) return;

    let clipFrames: ReplayFrame[];
    if (goalTick !== undefined && goalTick > 0) {
      const goalIdx = this.ringBuffer.findIndex((f) => f.tick >= goalTick);
      if (goalIdx !== -1) {
        const startIdx = Math.max(0, goalIdx - 280);
        const endIdx = Math.min(this.ringBuffer.length, goalIdx + 65);
        clipFrames = this.ringBuffer.slice(startIdx, endIdx);
      } else {
        clipFrames = this.ringBuffer.slice(-340);
      }
    } else {
      clipFrames = this.ringBuffer.slice(-340);
    }

    if (clipFrames.length === 0) return;

    this.activeClip = {
      frames: clipFrames,
      scorerTeam,
      lastTouchPlayerId,
      startTick: clipFrames[0].tick,
      endTick: clipFrames[clipFrames.length - 1].tick
    };
    this.playbackIndex = 0;
    this.startTime = performance.now();
  }

  public isReplaying(): boolean {
    return this.activeClip !== null;
  }

  public getActiveClip(): GoalClip | null {
    return this.activeClip;
  }

  public getProgress(): number {
    if (!this.activeClip || this.activeClip.frames.length === 0) return 1;
    return this.playbackIndex / this.activeClip.frames.length;
  }

  /**
   * Minimum grace period before allowing user to skip replay (prevents accidental skips from in-game spam).
   */
  public canSkip(): boolean {
    return performance.now() - this.startTime >= 600; // 600ms grace period
  }

  /**
   * Cinematic speed curve:
   * - 0% to 35%: Build-up / approach at normal fluid speed (0.95x)
   * - 35% to 45%: Smooth deceleration towards the decisive kick
   * - 45% to 80%: Dramatic Slow Motion (0.45x - 0.5x) for the kick, ball flight, Magnus curve, and net impact!
   * - 80% to 100%: Smooth transition out as the ball rests in the net (0.75x)
   */
  public getSpeedAtProgress(progress: number): number {
    if (progress < 0.40) {
      return 0.95; // Fluid build-up
    } else if (progress < 0.52) {
      // Ease down into slow-motion before the strike
      const t = (progress - 0.40) / 0.12;
      return 0.95 - t * (0.95 - 0.48);
    } else if (progress < 0.85) {
      // Slow-motion highlight of the shot, curve, and net ripple
      return 0.48;
    } else {
      // Settle as the ball rests in the net
      const t = (progress - 0.85) / 0.15;
      return 0.48 + t * (0.75 - 0.48);
    }
  }

  /**
   * Advances replay playback based on real delta time in seconds.
   * Frame rate independent (works identically on 60Hz, 144Hz, 240Hz).
   */
  public stepPlayback(dt: number): ReplayFrame | null {
    if (!this.activeClip) return null;

    const progress = this.getProgress();
    const speed = this.getSpeedAtProgress(progress);

    // dt is in seconds, recorded at 120 frames/sec
    const framesToAdvance = speed * 120 * dt;
    this.playbackIndex += framesToAdvance;

    const frameIdx = Math.floor(this.playbackIndex);
    if (frameIdx >= this.activeClip.frames.length) {
      this.stopPlayback();
      return null;
    }

    return this.activeClip.frames[frameIdx];
  }

  /**
   * Gets current frame without advancing.
   */
  public getCurrentFrame(): ReplayFrame | null {
    if (!this.activeClip) return null;
    const frameIdx = Math.min(
      this.activeClip.frames.length - 1,
      Math.floor(this.playbackIndex)
    );
    return this.activeClip.frames[frameIdx] ?? null;
  }

  public stopPlayback(): void {
    this.activeClip = null;
    this.playbackIndex = 0;
  }

  public clearBuffer(): void {
    this.ringBuffer = [];
    this.activeClip = null;
    this.playbackIndex = 0;
  }
}
