import { BoxGeometry, Mesh, MeshStandardMaterial, type BufferGeometry, type Material, type Texture } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export interface SurfaceOptions {
  color?: number;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  map?: Texture;
  emissiveMap?: Texture;
  flat?: boolean;
  transparent?: boolean;
  opacity?: number;
  /** Picks up the studio reflection map (metal, glass, visors). */
  reflective?: boolean;
  envMapIntensity?: number;
  /** Bright emissives should not cast shadows (bulbs, glows). */
  noShadow?: boolean;
}

const cache = new Map<string, MeshStandardMaterial>();

/** Shared, cached PBR material. Low-poly pieces use flat shading for crisp facets. */
export function surface(options: SurfaceOptions): MeshStandardMaterial {
  const key = JSON.stringify({ ...options, map: options.map?.uuid, emissiveMap: options.emissiveMap?.uuid });
  const cached = cache.get(key);
  if (cached) return cached;
  const created = new MeshStandardMaterial({
    color: options.color ?? 0xffffff,
    roughness: options.roughness ?? 0.8,
    metalness: options.metalness ?? 0,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 1,
    map: options.map ?? null,
    emissiveMap: options.emissiveMap ?? null,
    flatShading: options.flat ?? false,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    envMapIntensity: options.envMapIntensity ?? 1,
    depthWrite: !(options.transparent ?? false),
  });
  created.userData.reflective = options.reflective === true;
  created.userData.noShadow = options.noShadow === true;
  cache.set(key, created);
  return created;
}

export function flat(color: number, roughness = 0.85): MeshStandardMaterial {
  return surface({ color, roughness, flat: true });
}

export function glow(color: number, intensity = 2.5): MeshStandardMaterial {
  return surface({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4, noShadow: true });
}

export function mesh(geometry: BufferGeometry, mat: Material | Material[], x = 0, y = 0, z = 0): Mesh {
  const m = new Mesh(geometry, mat);
  m.position.set(x, y, z);
  return m;
}

const roundedCache = new Map<string, BufferGeometry>();

/** Box with softly rounded edges; the radius shrinks for thin panels. */
export function roundedBox(w: number, h: number, d: number, radius = 0.06): BufferGeometry {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${radius}`;
  const cached = roundedCache.get(key);
  if (cached) return cached;
  const r = Math.min(radius, Math.min(w, h, d) * 0.3);
  const geometry = r < 0.004 ? new BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 2, r);
  roundedCache.set(key, geometry);
  return geometry;
}

export function box(w: number, h: number, d: number, mat: Material, x = 0, y = 0, z = 0, radius?: number): Mesh {
  return mesh(roundedBox(w, h, d, radius), mat, x, y, z);
}

/** Starhop's shared palette of finishes. */
export const LOOK = {
  white: () => surface({ color: 0xf1f3f7, roughness: 0.45, reflective: true, envMapIntensity: 0.35 }),
  panel: () => surface({ color: 0xd8dde6, roughness: 0.5, reflective: true, envMapIntensity: 0.3 }),
  steel: () => surface({ color: 0x9aa3b0, roughness: 0.35, metalness: 0.7, reflective: true, envMapIntensity: 0.6 }),
  dark: () => surface({ color: 0x2c3240, roughness: 0.55, metalness: 0.4, reflective: true, envMapIntensity: 0.4 }),
  rubber: () => surface({ color: 0x1d2028, roughness: 0.9 }),
  orange: () => surface({ color: 0xff8a2a, roughness: 0.45, reflective: true, envMapIntensity: 0.3 }),
  teal: () => surface({ color: 0x2fb7c9, roughness: 0.45, reflective: true, envMapIntensity: 0.3 }),
  yellow: () => surface({ color: 0xffc83d, roughness: 0.45, reflective: true, envMapIntensity: 0.3 }),
  cyanGlow: () => glow(0x4de3ff, 2.2),
  orangeGlow: () => glow(0xff8a2a, 2.6),
  yellowGlow: () => glow(0xffd25a, 2.2),
};
