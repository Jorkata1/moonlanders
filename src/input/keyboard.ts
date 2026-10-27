export interface ScreenVector {
  /** Right is positive. */
  readonly x: number;
  /** Up is positive. */
  readonly y: number;
}

const UP_KEYS = new Set(['KeyW', 'ArrowUp']);
const DOWN_KEYS = new Set(['KeyS', 'ArrowDown']);
const LEFT_KEYS = new Set(['KeyA', 'ArrowLeft']);
const RIGHT_KEYS = new Set(['KeyD', 'ArrowRight']);
const MOVEMENT_KEYS = new Set([...UP_KEYS, ...DOWN_KEYS, ...LEFT_KEYS, ...RIGHT_KEYS]);

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

/** WASD / arrow-key movement. */
export class KeyboardInput {
  private readonly pressed = new Set<string>();

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!MOVEMENT_KEYS.has(event.code) || isTypingTarget(event.target)) return;
    this.pressed.add(event.code);
    event.preventDefault();
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
  };

  private readonly handleBlur = (): void => {
    this.pressed.clear();
  };

  constructor() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
  }

  private isAnyPressed(keys: ReadonlySet<string>): boolean {
    for (const key of keys) if (this.pressed.has(key)) return true;
    return false;
  }

  vector(): ScreenVector {
    const x = Number(this.isAnyPressed(RIGHT_KEYS)) - Number(this.isAnyPressed(LEFT_KEYS));
    const y = Number(this.isAnyPressed(UP_KEYS)) - Number(this.isAnyPressed(DOWN_KEYS));
    const length = Math.hypot(x, y);
    return length > 0 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
  }

  reset(): void {
    this.pressed.clear();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
  }
}
