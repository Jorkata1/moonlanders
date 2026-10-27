import { CAMERA_YAW } from '../config/balance';
import type { Vec2 } from '../config/planets/types';
import { VirtualJoystick } from './joystick';
import { KeyboardInput, type ScreenVector } from './keyboard';

const COS_YAW = Math.cos(CAMERA_YAW);
const SIN_YAW = Math.sin(CAMERA_YAW);

/** Converts a screen-space direction into world XZ relative to the camera yaw. */
export function screenToWorld(input: ScreenVector): Vec2 {
  return {
    x: input.x * COS_YAW - input.y * SIN_YAW,
    z: -input.x * SIN_YAW - input.y * COS_YAW,
  };
}

/** Merges keyboard and touch input into a single world-space move vector. */
export class MovementInput {
  private readonly keyboard = new KeyboardInput();
  private readonly joystick: VirtualJoystick;

  constructor(surface: HTMLElement, overlay: HTMLElement) {
    this.joystick = new VirtualJoystick(surface, overlay);
  }

  worldVector(): Vec2 {
    const touch = this.joystick.vector();
    const source = touch.x !== 0 || touch.y !== 0 ? touch : this.keyboard.vector();
    return screenToWorld(source);
  }

  /** Drops any held input, e.g. when a menu opens. */
  reset(): void {
    this.keyboard.reset();
    this.joystick.release();
  }

  dispose(): void {
    this.keyboard.dispose();
    this.joystick.dispose();
  }
}
