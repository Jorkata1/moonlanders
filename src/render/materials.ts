import { Color, MeshBasicMaterial, MeshLambertMaterial, type Side, DoubleSide, FrontSide } from 'three';

export interface SurfaceOptions {
  readonly emissive?: number;
  readonly emissiveIntensity?: number;
  readonly transparent?: boolean;
  readonly opacity?: number;
  readonly doubleSided?: boolean;
}

const surfaceCache = new Map<string, MeshLambertMaterial>();
const glowCache = new Map<string, MeshBasicMaterial>();

/**
 * Shared flat-shaded Lambert material. Lambert is far cheaper than PBR on
 * mobile GPUs and suits the low-poly look. Materials are cached and never
 * disposed: the palette is small and reused across planets.
 */
export function surface(color: number, options: SurfaceOptions = {}): MeshLambertMaterial {
  const key = JSON.stringify([color, options]);
  const cached = surfaceCache.get(key);
  if (cached) return cached;

  const side: Side = options.doubleSided ? DoubleSide : FrontSide;
  const material = new MeshLambertMaterial({
    color: new Color(color),
    flatShading: true,
    emissive: new Color(options.emissive ?? 0x000000),
    emissiveIntensity: options.emissiveIntensity ?? 1,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side,
    depthWrite: !options.transparent,
  });
  surfaceCache.set(key, material);
  return material;
}

/** Unlit material for things that should read as light sources or UI in-world. */
export function glow(color: number, opacity = 1): MeshBasicMaterial {
  const key = `${color}:${opacity}`;
  const cached = glowCache.get(key);
  if (cached) return cached;
  const material = new MeshBasicMaterial({
    color: new Color(color),
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  });
  glowCache.set(key, material);
  return material;
}

/** A material that is safe to mutate per-instance (e.g. animated opacity). */
export function uniqueGlow(color: number, opacity = 1): MeshBasicMaterial {
  const material = new MeshBasicMaterial({ color: new Color(color), transparent: true, opacity, depthWrite: false });
  material.userData.unique = true;
  return material;
}

export const SUIT_WHITE = 0xf3f5f8;
export const STEEL_DARK = 0x3a3f4b;
export const STEEL_MID = 0x6b7280;
export const HAZARD_YELLOW = 0xfacc15;
