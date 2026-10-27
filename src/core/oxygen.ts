import { OXYGEN_DRAIN_PER_SECOND, OXYGEN_LOW_RATIO, OXYGEN_REFILL_PER_SECOND } from '../config/balance';

/** Returns the new oxygen level after `dt` seconds inside or outside the dome. */
export function nextOxygenLevel(
  current: number,
  max: number,
  isInsideDome: boolean,
  drainMultiplier: number,
  dt: number,
): number {
  if (isInsideDome) return Math.min(max, current + OXYGEN_REFILL_PER_SECOND * dt);
  return Math.max(0, current - OXYGEN_DRAIN_PER_SECOND * drainMultiplier * dt);
}

export function isOxygenLow(current: number, max: number): boolean {
  return max > 0 && current / max <= OXYGEN_LOW_RATIO;
}
