import { BufferAttribute, CanvasTexture, Color, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Quaternion, RepeatWrapping, Vector2, Vector3, type BufferGeometry } from "three";
import { mergeVertices, toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { PlanetDef, Point } from "../planets/types";

/** Planar cuts that break a boulder into a few flat fractured faces, and how deep they bite. */
const CUTS = 9;
const CUT_DEPTH = 0.5;
/** Fracture edges sharper than this stay crisp; gentler curves are smoothed. */
const CREASE_ANGLE = Math.PI / 5;
/** Upward faces collect dust: greying starts above this slope and is complete at the second. */
const DUST_FROM = 0.35;
const DUST_FULL = 0.9;
/** How much of a rock's height is buried, so it sits in the ground rather than on it. */
const BURY = 0.3;
const NORMAL_TEXTURE_SIZE = 256;

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

function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 269.5 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth 3D value noise in 0..1. */
function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const corner = (dx: number, dy: number, dz: number) => hash3(ix + dx, iy + dy, iz + dz);
  return lerp(
    lerp(lerp(corner(0, 0, 0), corner(1, 0, 0), u), lerp(corner(0, 1, 0), corner(1, 1, 0), u), v),
    lerp(lerp(corner(0, 0, 1), corner(1, 0, 1), u), lerp(corner(0, 1, 1), corner(1, 1, 1), u), v),
    w,
  );
}

/** Fractal noise: several octaves of value noise, roughly -0.5..0.5. */
function fbm(x: number, y: number, z: number, octaves: number): number {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let i = 0; i < octaves; i += 1) {
    sum += (noise3(x * frequency, y * frequency, z * frequency) - 0.5) * amplitude;
    amplitude *= 0.5;
    frequency *= 2.1;
  }
  return sum;
}

/** Fine cracks and grain as a tiling normal map, so smooth rock surfaces still read as stone. */
function rockNormalTexture(): CanvasTexture {
  const size = NORMAL_TEXTURE_SIZE;
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      // Tileable by sampling noise on a torus.
      const a = u * Math.PI * 2;
      const b = v * Math.PI * 2;
      const px = Math.cos(a) * 2;
      const py = Math.sin(a) * 2;
      const pz = Math.cos(b) * 2;
      const pw = Math.sin(b) * 2;
      const grain = fbm(px * 2 + pw * 0.7, py * 2 + pz * 0.3, pz * 2 - pw, 3);
      const crack = Math.abs(fbm(px * 1.2 + pz, py * 1.2 + pw, pz * 1.2, 2));
      height[y * size + x] = grain * 0.35 - Math.max(0, 0.025 - crack) * 10;
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available for the rock texture");
  const image = ctx.createImageData(size, size);
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)] ?? 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 4;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 4;
      const length = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      image.data[i] = ((-dx / length) * 0.5 + 0.5) * 255;
      image.data[i + 1] = ((dy / length) * 0.5 + 0.5) * 255;
      image.data[i + 2] = ((1 / length) * 0.5 + 0.5) * 255;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

const materialCache = new WeakMap<PlanetDef, MeshStandardMaterial>();

/** One shared material for every rock, so a whole ridge bakes into a single draw call. */
export function rockMaterial(planet: PlanetDef): MeshStandardMaterial {
  const cached = materialCache.get(planet);
  if (cached) return cached;
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, normalMap: rockNormalTexture(), normalScale: new Vector2(0.7, 0.7) });
  materialCache.set(planet, material);
  return material;
}

/** Box-projected texture coordinates from each vertex's main facing, so the crack map wraps without stretching. */
function boxProject(geometry: BufferGeometry, scale: number): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const normal = geometry.getAttribute("normal") as BufferAttribute;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    const ax = Math.abs(normal.getX(i));
    const ay = Math.abs(normal.getY(i));
    const az = Math.abs(normal.getZ(i));
    const [a, b] = ay >= ax && ay >= az ? [position.getX(i), position.getZ(i)] : ax >= az ? [position.getZ(i), position.getY(i)] : [position.getX(i), position.getY(i)];
    uv[i * 2] = a * scale;
    uv[i * 2 + 1] = b * scale;
  }
  geometry.setAttribute("uv", new BufferAttribute(uv, 2));
}

/**
 * A weathered boulder: a smooth fractal shape with a few flat fractured faces, half buried,
 * coloured with strata bands, darker hollows and dust settling on everything that faces up.
 */
export function rockGeometry(planet: PlanetDef, seed: number, detail = 3): BufferGeometry {
  const sphere = new IcosahedronGeometry(1, detail);
  sphere.deleteAttribute("uv");
  sphere.deleteAttribute("normal");
  const geometry = mergeVertices(sphere);
  sphere.dispose();
  const position = geometry.getAttribute("position") as BufferAttribute;
  const point = new Vector3();
  const offset = seed * 7.13;
  const cuts = Array.from({ length: CUTS }, (_, i) => ({
    normal: new Vector3(hash(seed, i * 3 + 1) - 0.5, hash(seed, i * 3 + 2) - 0.25, hash(seed, i * 3 + 3) - 0.5).normalize(),
    depth: CUT_DEPTH + hash(seed, i * 5 + 7) * 0.3,
  }));
  const hollows = new Float32Array(position.count);
  for (let i = 0; i < position.count; i += 1) {
    point.fromBufferAttribute(position, i);
    const shape = fbm(point.x * 1.1 + offset, point.y * 1.1, point.z * 1.1 - offset, 3);
    const detailNoise = fbm(point.x * 3.2 - offset, point.y * 3.2 + offset, point.z * 3.2, 3);
    const radius = 1 + shape * 0.4 + detailNoise * 0.06;
    hollows[i] = detailNoise;
    point.multiplyScalar(radius);
    // Fractures: everything past a cut plane is pressed flat onto it, leaving crisp faces and edges.
    for (const cut of cuts) {
      const reach = point.dot(cut.normal);
      if (reach > cut.depth) point.addScaledVector(cut.normal, cut.depth - reach);
    }
    point.y = point.y * 0.82 - BURY * 0.5;
    position.setXYZ(i, point.x, point.y, point.z);
  }
  // Unweld so each fracture face keeps its own normals: crisp edges, smooth faces.
  const hollowAttribute = new BufferAttribute(hollows, 1);
  geometry.setAttribute("hollow", hollowAttribute);
  const shaped = toCreasedNormals(geometry, CREASE_ANGLE);
  geometry.dispose();
  return paintRock(planet, shaped, seed, offset);
}

/** Vertex colours: strata bands, warm streaks, darker hollows and undersides, dust on top faces. */
function paintRock(planet: PlanetDef, geometry: BufferGeometry, seed: number, offset: number): BufferGeometry {
  boxProject(geometry, 1.3);
  const position = geometry.getAttribute("position") as BufferAttribute;
  const hollows = geometry.getAttribute("hollow") as BufferAttribute;
  const normal = geometry.getAttribute("normal") as BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const base = new Color(planet.palette.rock).multiplyScalar(0.72);
  const warm = new Color(0x6a5a50);
  const dust = new Color(planet.palette.dust).multiplyScalar(0.68);
  const tint = new Color();
  const shade = 0.85 + hash(seed, 7) * 0.25;
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    const strata = 0.92 + Math.sin(y * 7 + offset) * 0.06;
    const cavity = 0.62 + Math.min(1, Math.max(0, hollows.getX(i) * 3 + 0.5)) * 0.45;
    const underside = normal.getY(i) < -0.15 ? 0.6 : 1;
    const dusted = Math.min(1, Math.max(0, (normal.getY(i) - DUST_FROM) / (DUST_FULL - DUST_FROM)));
    tint.copy(base).lerp(warm, Math.max(0, Math.sin(y * 3 + offset)) * 0.15).multiplyScalar(shade * strata * cavity * underside).lerp(dust, dusted * 0.45);
    tint.toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.deleteAttribute("hollow");
  return geometry;
}

const geometryCache = new Map<string, BufferGeometry>();

/** Rocks reuse a handful of shapes per size class, so building a long ridge stays quick. */
function sharedRockGeometry(planet: PlanetDef, seed: number, detail: number): BufferGeometry {
  const key = `${planet.id}|${seed % ROCK_SHAPES}|${detail}`;
  const cached = geometryCache.get(key);
  if (cached) return cached;
  const geometry = rockGeometry(planet, (seed % ROCK_SHAPES) * 13 + 5, detail);
  geometryCache.set(key, geometry);
  return geometry;
}

const ROCK_SHAPES = 12;

export function rock(planet: PlanetDef, scale: number, seed: number): Mesh {
  const mesh = new Mesh(sharedRockGeometry(planet, seed, scale > 1.4 ? 3 : 2), rockMaterial(planet));
  mesh.scale.set(scale * (0.9 + hash(seed, 11) * 0.25), scale * (0.85 + hash(seed, 12) * 0.3), scale * (0.9 + hash(seed, 13) * 0.25));
  mesh.rotation.y = hash(seed, 2) * Math.PI * 2;
  return mesh;
}

const SCATTER_COUNT = 520;
const SCATTER_SHAPES = 4;

/** Pebbles and small rocks strewn over the map, a few weathered shapes instanced many times, avoiding gameplay spots. */
export function scatter(planet: PlanetDef, keepClear: readonly (Point & { radius: number })[], heightAt: (x: number, z: number) => number): InstancedMesh[] {
  const meshes = Array.from({ length: SCATTER_SHAPES }, (_, shape) => new InstancedMesh(rockGeometry(planet, 900 + shape * 17, 2), rockMaterial(planet), Math.ceil(SCATTER_COUNT / SCATTER_SHAPES)));
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
    position.set(x, heightAt(x, z), z);
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
