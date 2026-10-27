import type { Vec2 } from '../config/planets/types';

export function distanceBetween(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function isWithin(point: Vec2, center: Vec2, radius: number): boolean {
  const dx = point.x - center.x;
  const dz = point.z - center.z;
  return dx * dx + dz * dz <= radius * radius;
}

export function offsetBy(origin: Vec2, offset: Vec2): Vec2 {
  return { x: origin.x + offset.x, z: origin.z + offset.z };
}

/** Pushes `point` (with `pointRadius`) out of a circular obstacle, mutating it. */
export function pushOutOfCircle(point: Vec2, pointRadius: number, center: Vec2, radius: number): void {
  const dx = point.x - center.x;
  const dz = point.z - center.z;
  const minDistance = pointRadius + radius;
  const distanceSq = dx * dx + dz * dz;
  if (distanceSq >= minDistance * minDistance) return;
  const distance = Math.sqrt(distanceSq);
  if (distance < 1e-6) {
    point.x = center.x + minDistance;
    return;
  }
  const scale = minDistance / distance;
  point.x = center.x + dx * scale;
  point.z = center.z + dz * scale;
}

/** Keeps `point` inside a circle of `radius` around the origin, mutating it. */
export function clampToRadius(point: Vec2, radius: number): void {
  const distance = Math.hypot(point.x, point.z);
  if (distance <= radius) return;
  const scale = radius / distance;
  point.x *= scale;
  point.z *= scale;
}
