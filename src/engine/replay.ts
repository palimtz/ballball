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
}

export interface GoalClip {
  frames: ReplayFrame[];
  scorerTeam: Team;
  lastTouchPlayerId: number;
  startTick: number;
  endTick: number;
}

export class ReplaySystem {
  private static readonly MAX_BUFFER_FRAMES = 480; // 4 seconds at 120 Hz
  private ringBuffer: ReplayFrame[] = [];
  private activeClip: GoalClip | null = null;
  private playbackIndex = 0;
  private playbackSpeed = 1.0; // Playback speed multiplier

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
      }))
    };

    this.ringBuffer.push(frame);
    if (this.ringBuffer.length > ReplaySystem.MAX_BUFFER_FRAMES) {
      this.ringBuffer.shift();
    }
  }

  /**
   * Captures the recent action leading to the goal as a replay clip.
   */
  public captureGoalClip(scorerTeam: Team, lastTouchPlayerId: number): void {
    // Capture up to 360 frames (3 seconds) leading to the goal
    const clipFrames = this.ringBuffer.slice(-360);
    if (clipFrames.length === 0) return;

    this.activeClip = {
      frames: clipFrames,
      scorerTeam,
      lastTouchPlayerId,
      startTick: clipFrames[0].tick,
      endTick: clipFrames[clipFrames.length - 1].tick
    };
    this.playbackIndex = 0;
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
   * Steps the replay playback forward. Returns the active frame, or null when finished.
   */
  public stepPlayback(): ReplayFrame | null {
    if (!this.activeClip) return null;

    const frameIdx = Math.floor(this.playbackIndex);
    if (frameIdx >= this.activeClip.frames.length) {
      this.stopPlayback();
      return null;
    }

    const frame = this.activeClip.frames[frameIdx];
    this.playbackIndex += this.playbackSpeed;
    return frame;
  }

  /**
   * Gets the current frame without advancing playback.
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
