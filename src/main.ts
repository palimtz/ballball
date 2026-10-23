import './style.css';
import { BotAI } from './ai/botController';
import { SoundManager } from './audio/soundManager';
import { TICK_DT } from './engine/constants';
import { createGameState } from './engine/gameState';
import { finishReplay, simulateTick } from './engine/physics';
import { ReplaySystem } from './engine/replay';
import { GameState, PlayerInput } from './engine/types';
import { InputManager } from './input/inputManager';
import { GameRenderer } from './render/renderer';

class GameApp {
  private renderer: GameRenderer;
  private inputManager: InputManager;
  private soundManager: SoundManager;
  private replaySystem: ReplaySystem;
  private state: GameState;
  private lastTime = 0;
  private accumulator = 0;
  private currentTeamSize = 1;

  constructor() {
    const canvas = document.getElementById('court') as HTMLCanvasElement;
    if (!canvas) throw new Error('Canvas #court not found');

    this.renderer = new GameRenderer(canvas);
    this.inputManager = new InputManager();
    this.soundManager = new SoundManager();
    this.replaySystem = new ReplaySystem();

    this.inputManager.setCanvas(canvas);
    this.renderer.resize();

    window.addEventListener('resize', () => {
      this.renderer.resize();
    });

    this.state = createGameState(this.currentTeamSize, true);
    this.setupUI();

    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  private setupUI(): void {
    const formatButtons = document.querySelectorAll<HTMLButtonElement>('[data-format]');
    formatButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        formatButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const size = parseInt(btn.dataset.format || '1', 10);
        this.currentTeamSize = size;
        this.resetGame();
      });
    });

    const restartBtn = document.getElementById('btn-restart');
    restartBtn?.addEventListener('click', () => {
      this.resetGame();
    });

    // Press Space or V to skip replay
    window.addEventListener('keydown', (e) => {
      if (this.state.phase === 'replay' && (e.code === 'Space' || e.code === 'KeyV')) {
        e.preventDefault();
        this.skipReplay();
      }
    });

    // Click canvas during replay to skip
    window.addEventListener('pointerdown', () => {
      if (this.state.phase === 'replay') {
        this.skipReplay();
      }
    });
  }

  private skipReplay(): void {
    this.replaySystem.stopPlayback();
    finishReplay(this.state);
  }

  private resetGame(): void {
    this.replaySystem.clearBuffer();
    this.state = createGameState(this.currentTeamSize, true);
  }

  private loop(currentTime: number): void {
    const deltaMs = Math.min(currentTime - this.lastTime, 100);
    this.lastTime = currentTime;
    this.accumulator += deltaMs / 1000;

    // Fixed timestep physics update at 120 Hz
    while (this.accumulator >= TICK_DT) {
      this.tick();
      this.accumulator -= TICK_DT;
    }

    // Step replay playback during replay phase
    let currentReplayFrame = null;
    if (this.state.phase === 'replay') {
      currentReplayFrame = this.replaySystem.stepPlayback();
      if (!currentReplayFrame) {
        // Replay completed, trigger kickoff
        finishReplay(this.state);
      }
    }

    // Camera offset for accurate mouse aim
    this.inputManager.setCameraOffset(this.renderer.getCameraOffset());

    // Render frame (live or replay)
    this.renderer.render(
      this.state,
      currentReplayFrame,
      this.replaySystem.getProgress()
    );

    requestAnimationFrame((t) => this.loop(t));
  }

  private tick(): void {
    // When playing, record state into replay buffer at 120 Hz
    if (this.state.phase === 'playing') {
      this.replaySystem.recordFrame(this.state);
    } else if (this.state.phase === 'goal') {
      // Goal triggered: capture the recent build-up as the replay clip
      if (!this.replaySystem.isReplaying()) {
        this.replaySystem.captureGoalClip(this.state.scorer, this.state.lastTouch);
      }
    }

    // 1. Poll human player input
    const humanInput = this.inputManager.pollInput();

    // 2. Prepare inputs for all players
    const allInputs: PlayerInput[] = [];

    for (let i = 0; i < this.state.players.length; i++) {
      const player = this.state.players[i];
      if (this.state.bot[i]) {
        allInputs.push(BotAI.computeInput(this.state, player));
      } else {
        allInputs.push(humanInput);
      }
    }

    // 3. Step physics simulation at 120 Hz
    simulateTick(this.state, allInputs);

    // 4. Play audio effects for events
    if (this.state.events.length > 0) {
      this.soundManager.handleEvents(this.state.events);
    }
  }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  new GameApp();
});
