import { BufferAttribute, Color, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3, type BufferGeometry } from "three";
import type { PlanetDef, Point } from "../planets/types";

/** Planar cuts that chisel a rock into broken faces, and how far in they bite. */
const CUTS = 4;
const CUT_DEPTH = 0.72;
/** Upward faces collect dust: they start greying above this slope and are fully dusted at the second. */
const DUST_FROM = 0.3;
const DUST_FULL = 0.85;

export function hash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth value noise in 0..1. */
export function noise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const materialCache = new WeakMap<PlanetDef, MeshStandardMaterial>();

/** One shared material for every rock, so a whole ridge bakes into a single draw call. */
export function rockMaterial(planet: PlanetDef): MeshStandardMaterial {
  const cached = materialCache.get(planet);
  if (cached) return cached;
  const material = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
  materialCache.set(planet, material);
  return material;
}

/**
 * A chiselled boulder: noise-warped, cut by a few random planes into broken faces, sat on a flat
 * base, and coloured per face with strata bands, dark crevices and dust on everything facing up.
 */
export function rockGeometry(planet: PlanetDef, seed: number, detail = 2): BufferGeometry {
  const geometry = new IcosahedronGeometry(1, detail);
  const position = geometry.getAttribute("position") as BufferAttribute;
  const point = new Vector3();
  const cuts = Array.from({ length: CUTS }, (_, i) => new Vector3(hash(seed, i * 3 + 1) - 0.5, hash(seed, i * 3 + 2) * 0.8 - 0.1, hash(seed, i * 3 + 3) - 0.5).normalize());
  for (let i = 0; i < position.count; i += 1) {
    point.fromBufferAttribute(position, i);
    const jitter = 0.78 + noise(point.x * 1.7 + seed, point.z * 1.7 + point.y * 1.3) * 0.38 + noise(point.x * 4.3 - seed, point.y * 4.3 + point.z) * 0.1;
    point.multiplyScalar(jitter);
    for (const cut of cuts) {
      const reach = point.dot(cut);
      if (reach > CUT_DEPTH) point.addScaledVector(cut, CUT_DEPTH - reach);
    }
    point.y = Math.max(point.y * 0.74, -0.32);
    position.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();

  const normal = geometry.getAttribute("normal") as BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const base = new Color(planet.palette.rock);
  const dust = new Color(planet.palette.dust).multiplyScalar(0.82);
  const tint = new Color();
  const shade = 0.82 + hash(seed, 7) * 0.3;
  // Colour whole triangles so each facet reads as one chip of stone.
  for (let face = 0; face < position.count; face += 3) {
    let ny = 0;
    let y = 0;
    for (let k = 0; k < 3; k += 1) {
      ny += normal.getY(face + k) / 3;
      y += position.getY(face + k) / 3;
    }
    const strata = 0.9 + Math.sin(y * 9 + seed) * 0.08 + (hash(face, seed) - 0.5) * 0.12;
    const crevice = ny < -0.2 ? 0.72 : 1;
    const dusted = Math.min(1, Math.max(0, (ny - DUST_FROM) / (DUST_FULL - DUST_FROM)));
    tint.copy(base).multiplyScalar(shade * strata * crevice).lerp(dust, dusted * 0.65);
    for (let k = 0; k < 3; k += 1) tint.toArray(colors, (face + k) * 3);
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  return geometry;
}

export function rock(planet: PlanetDef, scale: number, seed: number): Mesh {
  const mesh = new Mesh(rockGeometry(planet, seed), rockMaterial(planet));
  mesh.scale.setScalar(scale);
  mesh.rotation.y = hash(seed, 2) * Math.PI * 2;
  return mesh;
}

const SCATTER_COUNT = 520;
const SCATTER_SHAPES = 3;

/** Pebbles and small rocks strewn over the map, a few chiselled shapes instanced many times, avoiding gameplay spots. */
export function scatter(planet: PlanetDef, keepClear: readonly (Point & { radius: number })[], heightAt: (x: number, z: number) => number): InstancedMesh[] {
  const meshes = Array.from({ length: SCATTER_SHAPES }, (_, shape) => new InstancedMesh(rockGeometry(planet, 900 + shape * 17, 1), rockMaterial(planet), Math.ceil(SCATTER_COUNT / SCATTER_SHAPES)));
  const placed = meshes.map(() => 0);
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const position = new Vector3();
  const axis = new Vector3();
  for (let i = 0, total = 0; total < SCATTER_COUNT && i < 4000; i += 1) {
    const x = planet.bounds.minX - 8 + hash(i, 1.3) * (planet.bounds.maxX - planet.bounds.minX + 16);
    const z = planet.bounds.minZ - 8 + hash(i, 2.7) * (planet.bounds.maxZ - planet.bounds.minZ + 16);
    if (keepClear.some((p) => Math.hypot(p.x - x, p.z - z) < p.radius)) continue;
    if (Math.abs(z - planet.ridge.z) < 3) continue;
    const shape = i % SCATTER_SHAPES;
    const target = meshes[shape] as InstancedMesh;
    const slot = placed[shape] as number;
    if (slot >= target.count) continue;
    const size = 0.06 + hash(i, 4.1) ** 3 * 0.55;
    position.set(x, heightAt(x, z) + size * 0.15, z);
    rotation.setFromAxisAngle(axis.set(hash(i, 5) * 0.3, 1, hash(i, 6) * 0.3).normalize(), hash(i, 7) * Math.PI * 2);
    scale.set(size, size * (0.75 + hash(i, 9) * 0.4), size * (0.8 + hash(i, 8) * 0.5));
    target.setMatrixAt(slot, matrix.compose(position, rotation, scale));
    placed[shape] = slot + 1;
    total += 1;
  }
  meshes.forEach((mesh, shape) => {
    mesh.count = placed[shape] as number;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  return meshes;
}
