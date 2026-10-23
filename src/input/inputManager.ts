import { PlayerInput } from '../engine/types';

export class InputManager {
  private keys: Record<string, boolean> = {};
  private mouseAim = { x: 1, y: 0 };
  private mouseKick = false;
  private mouseBoost = false;
  private canvasElement: HTMLCanvasElement | null = null;
  private cameraOffset = { x: 0, y: 0 };

  constructor() {
    this.setupKeyboard();
    this.setupMouse();
  }

  public setCanvas(canvas: HTMLCanvasElement): void {
    this.canvasElement = canvas;
  }

  public setCameraOffset(offset: { x: number; y: number }): void {
    this.cameraOffset = offset;
  }

  private setupKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      // Prevent scrolling on Space or Arrow keys
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
  }

  private setupMouse(): void {
    window.addEventListener('contextmenu', (e) => {
      e.preventDefault(); // Disable context menu on right click
    });

    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseKick = true; // Left click = kick
      } else if (e.button === 2) {
        this.mouseBoost = true; // Right click = boost
      } else if (e.button === 1) {
        this.mouseKick = true; // Middle click = both
        this.mouseBoost = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.mouseKick = false;
      } else if (e.button === 2) {
        this.mouseBoost = false;
      } else if (e.button === 1) {
        this.mouseKick = false;
        this.mouseBoost = false;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.canvasElement) return;
      const rect = this.canvasElement.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      // Transform to world coordinates relative to center
      const worldX = screenX - rect.width / 2 + this.cameraOffset.x;
      const worldY = screenY - rect.height / 2 + this.cameraOffset.y;

      const len = Math.hypot(worldX, worldY);
      if (len > 1e-4) {
        this.mouseAim.x = worldX / len;
        this.mouseAim.y = worldY / len;
      }
    });
  }

  /**
   * Polls input from keyboard, mouse, and gamepads.
   */
  public pollInput(): PlayerInput {
    let inputX = 0;
    let inputY = 0;

    // Movement: WASD / ZQSD / Arrows
    if (this.keys['KeyW'] || this.keys['KeyZ'] || this.keys['ArrowUp']) inputY -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) inputY += 1;
    if (this.keys['KeyA'] || this.keys['KeyQ'] || this.keys['ArrowLeft']) inputX -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) inputX += 1;

    // Actions
    let kick = this.keys['Space'] || this.mouseKick;
    let boost = this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.keys['KeyB'] || this.mouseBoost;

    // Gamepad support
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (gamepads && gamepads[0]) {
      const gp = gamepads[0];
      const axisX = gp.axes[0] ?? 0;
      const axisY = gp.axes[1] ?? 0;
      if (Math.hypot(axisX, axisY) > 0.15) {
        inputX = axisX;
        inputY = axisY;
      }

      // Button 0 (A) / Button 2 (X) -> Kick
      if (gp.buttons[0]?.pressed || gp.buttons[2]?.pressed) kick = true;
      // Button 1 (B) / Trigger -> Boost
      if (gp.buttons[1]?.pressed || gp.buttons[5]?.pressed || gp.buttons[7]?.pressed) boost = true;
    }

    return {
      x: inputX,
      y: inputY,
      boost,
      kick
    };
  }
}
