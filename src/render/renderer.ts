import { ReplayFrame } from '../engine/replay';
import { GameState } from '../engine/types';

export class GameRenderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private cameraX = 0;
  private cameraY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D canvas context');
    this.ctx = ctx;
  }

  public getCameraOffset() {
    return { x: this.cameraX, y: this.cameraY };
  }

  public resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  public render(state: GameState, replayFrame: ReplayFrame | null = null, replayProgress = 0): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    const isReplay = state.phase === 'replay' && replayFrame !== null;

    // Ball to follow with camera
    const ballPos = isReplay ? replayFrame.ball : state.ball;

    // Director Camera: follow ball with smooth lerp
    const targetCamX = ballPos.x * 0.45;
    const targetCamY = ballPos.y * 0.45;
    this.cameraX += (targetCamX - this.cameraX) * (isReplay ? 0.12 : 0.08);
    this.cameraY += (targetCamY - this.cameraY) * (isReplay ? 0.12 : 0.08);

    // Scale to fit arena nicely on screen
    const arenaW = state.field.width + 240;
    const arenaH = state.field.height + 200;
    const scale = Math.min(w / arenaW, h / arenaH, 1.1);

    // Clear background
    ctx.fillStyle = '#0a1210';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    // Center world
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-this.cameraX, -this.cameraY);

    // Render field & goals
    this.renderCourt(state);
    this.renderGoals(state);

    if (isReplay) {
      // Render recorded entities
      this.renderReplayPlayers(replayFrame);
      this.renderReplayBall(replayFrame.ball);
    } else {
      // Render live simulation entities
      this.renderPlayers(state);
      this.renderBall(state);
    }

    ctx.restore();

    // Render HUD or Replay Broadcast Overlay
    if (isReplay) {
      this.renderReplayOverlay(state, replayProgress);
    } else {
      this.renderHUD(state);

      if (state.phase === 'goal') {
        this.renderGoalBanner(state);
      } else if (state.phase === 'countdown') {
        this.renderCountdownBanner(state);
      } else if (state.phase === 'finished') {
        this.renderFinishedBanner(state);
      }
    }
  }

  private renderCourt(state: GameState): void {
    const ctx = this.ctx;
    const field = state.field;
    const halfW = field.width / 2;
    const halfH = field.height / 2;
    const corner = field.corner;

    // Pitch grass background with subtle alternating stripes
    ctx.save();
    ctx.fillStyle = '#142823';
    this.roundedRectPath(ctx, -halfW, -halfH, field.width, field.height, corner);
    ctx.fill();

    // Lawn stripes
    ctx.clip();
    const stripeWidth = 80;
    for (let x = -halfW; x < halfW; x += stripeWidth * 2) {
      ctx.fillStyle = '#122420';
      ctx.fillRect(x, -halfH, stripeWidth, field.height);
    }
    ctx.restore();

    // Pitch border lines
    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    this.roundedRectPath(ctx, -halfW, -halfH, field.width, field.height, corner);
    ctx.stroke();

    // Center line
    ctx.beginPath();
    ctx.moveTo(0, -halfH);
    ctx.lineTo(0, halfH);
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(0, 0, 100, 0, Math.PI * 2);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();

    // Penalty areas
    const penaltyW = 160;
    const penaltyH = field.goal + 120;
    ctx.strokeRect(-halfW, -penaltyH / 2, penaltyW, penaltyH);
    ctx.strokeRect(halfW - penaltyW, -penaltyH / 2, penaltyW, penaltyH);

    ctx.restore();
  }

  private renderGoals(state: GameState): void {
    const ctx = this.ctx;
    const field = state.field;
    const halfW = field.width / 2;
    const halfGoal = field.goal / 2;
    const depth = field.depth;

    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';

    // Left Goal Cavity (Net)
    ctx.fillStyle = 'rgba(189, 172, 255, 0.08)'; // Team Lilac tint
    ctx.fillRect(-halfW - depth, -halfGoal, depth, field.goal);
    ctx.strokeRect(-halfW - depth, -halfGoal, depth, field.goal);

    // Right Goal Cavity (Net)
    ctx.fillStyle = 'rgba(255, 161, 136, 0.08)'; // Team Coral tint
    ctx.fillRect(halfW, -halfGoal, depth, field.goal);
    ctx.strokeRect(halfW, -halfGoal, depth, field.goal);

    // 4 Goal Posts
    ctx.fillStyle = '#ffffff';
    const posts = [
      { x: -halfW, y: -halfGoal },
      { x: -halfW, y: halfGoal },
      { x: halfW, y: -halfGoal },
      { x: halfW, y: halfGoal }
    ];
    for (const post of posts) {
      ctx.beginPath();
      ctx.arc(post.x, post.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private renderPlayers(state: GameState): void {
    for (const player of state.players) {
      if (!state.active[player.id]) continue;
      this.drawPlayer(player, player.id === 0 ? 'VOUS' : state.bot[player.id] ? 'BOT' : `J${player.id + 1}`);
    }
  }

  private renderReplayPlayers(frame: ReplayFrame): void {
    for (const player of frame.players) {
      this.drawPlayer(player, player.id === 0 ? 'VOUS' : `BOT`);
    }
  }

  private drawPlayer(
    player: {
      x: number;
      y: number;
      side: 0 | 1;
      aimX: number;
      aimY: number;
      burst: number;
      signal: number;
      charges: number;
    },
    label: string
  ): void {
    const ctx = this.ctx;
    const teamColor = player.side === 0 ? '#bdacff' : '#ffa188';
    const r = 23;

    ctx.save();
    ctx.translate(player.x, player.y);

    // Kick signal shockwave
    if (player.signal > 0) {
      const radius = r + (42 - player.signal) * 1.5;
      const alpha = player.signal / 42;
      ctx.strokeStyle = teamColor;
      ctx.lineWidth = 2;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }

    // Boost burst particles/glow
    if (player.burst > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath();
      ctx.arc(-player.aimX * 20, -player.aimY * 20, r * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 8, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Main circle body
    ctx.fillStyle = teamColor;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Border outline
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Aim direction pointer
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(player.aimX * (r - 8), player.aimY * (r - 8));
    ctx.lineTo(player.aimX * (r + 8), player.aimY * (r + 8));
    ctx.stroke();

    // Boost charge pips (3 small dots on player body)
    for (let i = 0; i < 3; i++) {
      const pipX = (i - 1) * 9;
      const pipY = -6;
      ctx.fillStyle = i < player.charges ? '#ffffff' : 'rgba(255, 255, 255, 0.25)';
      ctx.beginPath();
      ctx.arc(pipX, pipY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player name / label
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, r + 16);

    ctx.restore();
  }

  private renderBall(state: GameState): void {
    this.renderReplayBall(state.ball);
  }

  private renderReplayBall(ball: {
    x: number;
    y: number;
    r: number;
    spin: number;
    orientation: [number, number, number, number];
  }): void {
    const ctx = this.ctx;

    ctx.save();
    ctx.translate(ball.x, ball.y);

    // Ball shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 6, ball.r, ball.r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ball body
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, ball.r, 0, Math.PI * 2);
    ctx.fill();

    // 3D Roll pattern derived from quaternion
    const [qx, qy] = ball.orientation;
    ctx.fillStyle = '#1c2e26';
    ctx.beginPath();
    ctx.arc(qx * 5, qy * 5, ball.r * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Spin indicator trail if ball has high curve spin
    if (Math.abs(ball.spin) > 2) {
      ctx.strokeStyle = ball.spin > 0 ? '#bdacff' : '#ffa188';
      ctx.lineWidth = 2;
      ctx.globalAlpha = Math.min(0.8, Math.abs(ball.spin) / 20);
      ctx.beginPath();
      ctx.arc(0, 0, ball.r + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }

    ctx.restore();
  }

  private renderHUD(state: GameState): void {
    const ctx = this.ctx;
    const w = this.canvas.width;

    ctx.save();
    // Top Scoreboard Bar
    ctx.fillStyle = 'rgba(16, 28, 25, 0.85)';
    const barW = 340;
    const barH = 50;
    const barX = (w - barW) / 2;
    ctx.beginPath();
    ctx.roundRect(barX, 16, barW, barH, 12);
    ctx.fill();

    // Lilac score
    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = '#bdacff';
    ctx.textAlign = 'right';
    ctx.fillText(`${state.score[0]}`, barX + 110, 48);

    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('LILAS', barX + 80, 47);

    // Timer (mm:ss)
    const totalSec = Math.ceil(state.time / 120);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    const timeStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(timeStr, w / 2, 47);

    // Coral score
    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = '#ffa188';
    ctx.textAlign = 'left';
    ctx.fillText(`${state.score[1]}`, barX + barW - 110, 48);

    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('CORAIL', barX + barW - 80, 47);

    // Controls hint bottom
    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.textAlign = 'center';
    ctx.fillText(
      'ZQSD / Flèches : Déplacement | Espace / Clic Gauche : Tirer | Shift / Clic Droit : Boost',
      w / 2,
      this.canvas.height - 20
    );

    ctx.restore();
  }

  /**
   * Broadcast Replay overlay matching ballball.club
   */
  private renderReplayOverlay(state: GameState, progress: number): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const teamName = state.scorer === 0 ? 'LILAS' : 'CORAIL';
    const teamColor = state.scorer === 0 ? '#bdacff' : '#ffa188';

    ctx.save();

    // Broadcast letterbox bars (cinematic look)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 0, w, 50);
    ctx.fillRect(0, h - 50, w, 50);

    // Top Replay Badge
    const badgeW = 320;
    const badgeH = 46;
    const badgeX = (w - badgeW) / 2;
    ctx.fillStyle = 'rgba(12, 22, 19, 0.95)';
    ctx.beginPath();
    ctx.roundRect(badgeX, 16, badgeW, badgeH, 23);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Pulsing Red Recording Dot
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.008);
    ctx.fillStyle = `rgba(255, 60, 60, ${pulse})`;
    ctx.beginPath();
    ctx.arc(badgeX + 28, 16 + badgeH / 2, 6, 0, Math.PI * 2);
    ctx.fill();

    // REPLAY text
    ctx.font = '900 15px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText('REPLAY', badgeX + 44, 45);

    // Scorer team
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = teamColor;
    ctx.fillText(`BUT ${teamName}`, badgeX + 118, 45);

    // Slow-motion badge when active
    const isSlowMo = progress >= 0.35 && progress <= 0.85;
    if (isSlowMo) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.beginPath();
      ctx.roundRect(badgeX + badgeW - 86, 26, 72, 24, 12);
      ctx.fill();
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = '#ffd15c';
      ctx.textAlign = 'center';
      ctx.fillText('0.5x SLOW', badgeX + badgeW - 50, 42);
    }

    // Bottom replay scrubber bar
    const barW = Math.min(520, w - 80);
    const barH = 5;
    const barX = (w - barW) / 2;
    const barY = h - 68;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 2.5);
    ctx.fill();

    ctx.fillStyle = teamColor;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW * Math.min(1, Math.max(0, progress)), barH, 2.5);
    ctx.fill();

    // Scrubber current handle dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(barX + barW * Math.min(1, Math.max(0, progress)), barY + barH / 2, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private renderGoalBanner(state: GameState): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const teamName = state.scorer === 0 ? 'LILAS' : 'CORAIL';
    const teamColor = state.scorer === 0 ? '#bdacff' : '#ffa188';

    ctx.save();
    // Dramatic goal flash overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, h / 2 - 90, w, 180);

    ctx.font = '900 52px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.shadowColor = teamColor;
    ctx.shadowBlur = 20;
    ctx.fillText('BUT !', w / 2, h / 2 - 8);

    ctx.shadowBlur = 0;
    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = teamColor;
    ctx.fillText(`ÉQUIPE ${teamName}`, w / 2, h / 2 + 42);
    ctx.restore();
  }

  private renderCountdownBanner(state: GameState): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 240 ticks total (2.0s) -> divide into 3 seconds count: 3, 2, 1
    // 240..160 = 3, 160..80 = 2, 80..0 = 1
    const countNumber = Math.max(1, Math.ceil(state.phaseTicks / 80));
    const subProgress = (state.phaseTicks % 80) / 80;

    ctx.save();

    // Translucent countdown disc in center
    const discRadius = 60;
    ctx.fillStyle = 'rgba(12, 22, 19, 0.85)';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, discRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Animated countdown ring
    ctx.strokeStyle = '#39e58c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, discRadius - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * subProgress);
    ctx.stroke();

    // Big countdown number
    ctx.font = '900 54px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${countNumber}`, w / 2, h / 2 - 4);

    // Kickoff label beneath
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText("COUP D'ENVOI", w / 2, h / 2 + discRadius + 28);

    ctx.restore();
  }

  private renderFinishedBanner(state: GameState): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.save();
    // Dim background overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, 0, w, h);

    const winner =
      state.score[0] > state.score[1]
        ? 0
        : state.score[1] > state.score[0]
        ? 1
        : null;

    const winnerName =
      winner === 0 ? 'LILAS' : winner === 1 ? 'CORAIL' : 'ÉGALITÉ';
    const winnerColor =
      winner === 0 ? '#bdacff' : winner === 1 ? '#ffa188' : '#39e58c';

    // Banner card
    const cardW = Math.min(480, w - 40);
    const cardH = 220;
    const cardX = (w - cardW) / 2;
    const cardY = (h - cardH) / 2;

    ctx.fillStyle = 'rgba(16, 28, 25, 0.95)';
    this.roundedRectPath(ctx, cardX, cardY, cardW, cardH, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Title
    ctx.font = '900 30px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('FIN DU MATCH', w / 2, cardY + 54);

    // Winner line
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = winnerColor;
    ctx.fillText(
      winner !== null ? `VICTOIRE DE L'ÉQUIPE ${winnerName} !` : 'MATCH NUL !',
      w / 2,
      cardY + 98
    );

    // Final score
    ctx.font = '900 36px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${state.score[0]} - ${state.score[1]}`, w / 2, cardY + 146);

    // Subtitle
    ctx.font = '500 13px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillText('Cliquez sur Recommencer pour rejouer', w / 2, cardY + 188);

    ctx.restore();
  }

  private roundedRectPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.arcTo(x + width, y, x + width, y + radius, radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
    ctx.lineTo(x + radius, y + height);
    ctx.arcTo(x, y + height, x, y + height - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
  }
}
