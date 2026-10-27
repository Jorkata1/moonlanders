import type { MoveInput } from "./sim/movement";

const JOYSTICK_RADIUS_PX = 56;
const DEAD_ZONE = 0.12;

const KEY_DIRECTIONS: Record<string, { x: number; z: number }> = {
  KeyW: { x: 0, z: -1 },
  ArrowUp: { x: 0, z: -1 },
  KeyS: { x: 0, z: 1 },
  ArrowDown: { x: 0, z: 1 },
  KeyA: { x: -1, z: 0 },
  ArrowLeft: { x: -1, z: 0 },
  KeyD: { x: 1, z: 0 },
  ArrowRight: { x: 1, z: 0 },
};

export interface MoveControls {
  read(): MoveInput;
  setEnabled(enabled: boolean): void;
}

/**
 * Keyboard plus a floating joystick: press anywhere on the play area and drag.
 * Works the same with a mouse, so desktop players can play one-handed too.
 */
export function createMoveControls(surface: HTMLElement, base: HTMLElement, knob: HTMLElement): MoveControls {
  const pressed = new Set<string>();
  const stick = { pointerId: null as number | null, originX: 0, originY: 0, x: 0, z: 0 };
  let enabled = false;

  function release(): void {
    stick.pointerId = null;
    stick.x = 0;
    stick.z = 0;
    base.hidden = true;
  }

  window.addEventListener("keydown", (event) => {
    if (!enabled || !(event.code in KEY_DIRECTIONS)) return;
    pressed.add(event.code);
    event.preventDefault();
  });
  window.addEventListener("keyup", (event) => pressed.delete(event.code));
  window.addEventListener("blur", () => {
    pressed.clear();
    release();
  });

  surface.addEventListener("pointerdown", (event) => {
    if (!enabled || stick.pointerId !== null) return;
    stick.pointerId = event.pointerId;
    stick.originX = event.clientX;
    stick.originY = event.clientY;
    surface.setPointerCapture(event.pointerId);
    base.hidden = false;
    base.style.transform = `translate(${event.clientX - JOYSTICK_RADIUS_PX}px, ${event.clientY - JOYSTICK_RADIUS_PX}px)`;
    knob.style.transform = "translate(0px, 0px)";
  });
  surface.addEventListener("pointermove", (event) => {
    if (event.pointerId !== stick.pointerId) return;
    let dx = event.clientX - stick.originX;
    let dy = event.clientY - stick.originY;
    const length = Math.hypot(dx, dy);
    if (length > JOYSTICK_RADIUS_PX) {
      dx = (dx / length) * JOYSTICK_RADIUS_PX;
      dy = (dy / length) * JOYSTICK_RADIUS_PX;
    }
    stick.x = dx / JOYSTICK_RADIUS_PX;
    stick.z = dy / JOYSTICK_RADIUS_PX;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  const end = (event: PointerEvent) => {
    if (event.pointerId === stick.pointerId) release();
  };
  surface.addEventListener("pointerup", end);
  surface.addEventListener("pointercancel", end);

  return {
    read() {
      let x = stick.x;
      let z = stick.z;
      for (const code of pressed) {
        const direction = KEY_DIRECTIONS[code];
        if (!direction) continue;
        x += direction.x;
        z += direction.z;
      }
      const length = Math.hypot(x, z);
      if (length < DEAD_ZONE) return { x: 0, z: 0 };
      const scale = Math.min(1, length) / length;
      return { x: x * scale, z: z * scale };
    },
    setEnabled(next) {
      enabled = next;
      if (!next) {
        pressed.clear();
        release();
      }
    },
  };
}
