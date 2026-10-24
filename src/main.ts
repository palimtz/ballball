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
  private skipReplayBtn: HTMLButtonElement | null;
  private pauseModal: HTMLElement | null;
  private isPaused = false;

  constructor() {
    const canvas = document.getElementById('court') as HTMLCanvasElement;
    if (!canvas) throw new Error('Canvas #court not found');

    this.renderer = new GameRenderer(canvas);
    this.inputManager = new InputManager();
    this.soundManager = new SoundManager();
    this.replaySystem = new ReplaySystem();
    this.skipReplayBtn = document.getElementById('btn-skip-replay') as HTMLButtonElement | null;
    this.pauseModal = document.getElementById('pause-modal');

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

    // Pause button and modal controls
    const pauseBtn = document.getElementById('btn-pause');
    pauseBtn?.addEventListener('click', () => {
      this.togglePause();
    });

    const resumeBtn = document.getElementById('btn-resume');
    resumeBtn?.addEventListener('click', () => {
      this.togglePause(false);
    });

    const restartPauseBtn = document.getElementById('btn-restart-pause');
    restartPauseBtn?.addEventListener('click', () => {
      this.togglePause(false);
      this.resetGame();
    });

    // Keydown handlers: Escape/P for Pause, Space/V for Replay skip
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        this.togglePause();
        return;
      }

      if (
        this.state.phase === 'replay' &&
        (e.code === 'Space' || e.code === 'KeyV')
      ) {
        e.preventDefault();
        if (this.replaySystem.canSkip()) {
          this.skipReplay();
        }
      }
    });

    // Skip replay via dedicated button (with 600ms grace period)
    this.skipReplayBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.state.phase === 'replay' && this.replaySystem.canSkip()) {
        this.skipReplay();
      }
    });
  }

  private togglePause(forceState?: boolean): void {
    this.isPaused = forceState !== undefined ? forceState : !this.isPaused;
    if (this.pauseModal) {
      this.pauseModal.hidden = !this.isPaused;
    }
    if (!this.isPaused) {
      this.lastTime = performance.now();
      this.accumulator = 0;
    }
  }

  private skipReplay(): void {
    this.replaySystem.stopPlayback();
    if (this.skipReplayBtn) this.skipReplayBtn.hidden = true;
    finishReplay(this.state);
  }

  private resetGame(): void {
    this.togglePause(false);
    this.replaySystem.clearBuffer();
    if (this.skipReplayBtn) this.skipReplayBtn.hidden = true;
    this.state = createGameState(this.currentTeamSize, true);
  }

  private loop(currentTime: number): void {
    if (this.isPaused) {
      this.lastTime = currentTime;
      requestAnimationFrame((t) => this.loop(t));
      return;
    }

    const deltaMs = Math.min(currentTime - this.lastTime, 100);
    this.lastTime = currentTime;
    const dtSeconds = deltaMs / 1000;
    this.accumulator += dtSeconds;

    // Fixed timestep physics update at 120 Hz
    while (this.accumulator >= TICK_DT) {
      this.tick();
      this.accumulator -= TICK_DT;
    }

    // Step replay playback during replay phase
    let currentReplayFrame = null;
    if (this.state.phase === 'replay') {
      if (this.skipReplayBtn) this.skipReplayBtn.hidden = false;
      currentReplayFrame = this.replaySystem.stepPlayback(dtSeconds);
      if (!currentReplayFrame) {
        // Replay completed, trigger kickoff
        this.skipReplay();
      }
    } else {
      if (this.skipReplayBtn && !this.skipReplayBtn.hidden) {
        this.skipReplayBtn.hidden = true;
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

    // When playing or celebrating, record state into replay buffer at 120 Hz
    if (this.state.phase === 'playing' || this.state.phase === 'goal') {
      this.replaySystem.recordFrame(this.state);
    }

    // Capture the replay clip on the last tick of celebration, right before replay starts
    if (this.state.phase === 'goal' && this.state.phaseTicks === 1) {
      this.replaySystem.captureGoalClip(this.state.scorer, this.state.lastTouch, this.state.goalTick);
    }
    // Fallback if replay phase triggered directly
    if (this.state.phase === 'replay' && !this.replaySystem.isReplaying()) {
      this.replaySystem.captureGoalClip(this.state.scorer, this.state.lastTouch, this.state.goalTick);
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
