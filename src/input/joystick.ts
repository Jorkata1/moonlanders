import type { ScreenVector } from './keyboard';

const KNOB_TRAVEL_PX = 52;
const DEAD_ZONE = 0.12;

/**
 * Floating touch joystick: it appears wherever the player first touches the
 * play surface, which works for both thumbs and any screen size. Mouse drag
 * works the same way on desktop.
 */
export class VirtualJoystick {
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private pointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private current: ScreenVector = { x: 0, y: 0 };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (this.pointerId !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    this.pointerId = event.pointerId;
    this.surface.setPointerCapture(event.pointerId);
    this.originX = event.clientX;
    this.originY = event.clientY;
    this.base.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0) translate(-50%, -50%)`;
    this.knob.style.transform = 'translate(-50%, -50%)';
    this.base.classList.add('is-active');
    event.preventDefault();
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    const dx = event.clientX - this.originX;
    const dy = event.clientY - this.originY;
    const distance = Math.hypot(dx, dy);
    const clamped = Math.min(distance, KNOB_TRAVEL_PX);
    const scale = distance > 0 ? clamped / distance : 0;
    this.knob.style.transform = `translate(calc(-50% + ${dx * scale}px), calc(-50% + ${dy * scale}px))`;
    const magnitude = clamped / KNOB_TRAVEL_PX;
    this.current = magnitude < DEAD_ZONE ? { x: 0, y: 0 } : { x: (dx / distance) * magnitude, y: (-dy / distance) * magnitude };
  };

  private readonly handlePointerEnd = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.release();
  };

  constructor(
    private readonly surface: HTMLElement,
    overlay: HTMLElement,
  ) {
    this.base = document.createElement('div');
    this.base.className = 'joystick';
    this.base.setAttribute('aria-hidden', 'true');
    this.knob = document.createElement('div');
    this.knob.className = 'joystick__knob';
    this.base.appendChild(this.knob);
    overlay.appendChild(this.base);

    surface.addEventListener('pointerdown', this.handlePointerDown);
    surface.addEventListener('pointermove', this.handlePointerMove);
    surface.addEventListener('pointerup', this.handlePointerEnd);
    surface.addEventListener('pointercancel', this.handlePointerEnd);
    surface.addEventListener('lostpointercapture', this.handlePointerEnd);
  }

  vector(): ScreenVector {
    return this.current;
  }

  release(): void {
    if (this.pointerId !== null && this.surface.hasPointerCapture(this.pointerId)) {
      this.surface.releasePointerCapture(this.pointerId);
    }
    this.pointerId = null;
    this.current = { x: 0, y: 0 };
    this.base.classList.remove('is-active');
  }

  dispose(): void {
    this.release();
    this.surface.removeEventListener('pointerdown', this.handlePointerDown);
    this.surface.removeEventListener('pointermove', this.handlePointerMove);
    this.surface.removeEventListener('pointerup', this.handlePointerEnd);
    this.surface.removeEventListener('pointercancel', this.handlePointerEnd);
    this.surface.removeEventListener('lostpointercapture', this.handlePointerEnd);
    this.base.remove();
  }
}
