import {
  CanvasTexture,
  MeshStandardMaterial,
  SRGBColorSpace,
  BufferAttribute,
  BufferGeometry,
  Color,
  DodecahedronGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  MeshBasicMaterial,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  Vector3,
} from "three";
import type { PlanetDef, Point } from "../planets/types";
import { flat } from "./materials";
import { regolithNormalTexture, regolithTexture } from "./textures";

const GROUND_SIZE = 110;
const GROUND_SEGMENTS = 240;
const WARM_DUST = new Color(0x8a7462);
const COOL_DUST = new Color(0x55607e);
const EDGE_RISE = 0.55;
/** Pebbles and small rocks strewn over the map. */
const SCATTER_COUNT = 520;

function hash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth value noise in 0..1. */
function noise(x: number, z: number): number {
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

function outsideDistance(planet: PlanetDef, x: number, z: number): number {
  const { minX, maxX, minZ, maxZ } = planet.bounds;
  const dx = Math.max(minX - x, 0, x - maxX);
  const dz = Math.max(minZ - z, 0, z - maxZ);
  return Math.hypot(dx, dz);
}

interface FlatZone extends Point {
  radius: number;
}

const flatZoneCache = new WeakMap<PlanetDef, FlatZone[]>();

/** Ground is levelled under everything the player stands on or builds, so pads never sink or float. */
function flatZones(planet: PlanetDef): FlatZone[] {
  const cached = flatZoneCache.get(planet);
  if (cached) return cached;
  const zones: FlatZone[] = [
    { ...planet.dome, radius: planet.dome.radius + 0.8 },
    { ...planet.suitStation, radius: 2.2 },
    { ...planet.suitStation.pad, radius: 1.6 },
    { ...planet.workbench, radius: 2.2 },
    { ...planet.workbench.pad, radius: 1.6 },
    { x: planet.rocket.x, z: planet.rocket.z, radius: 3.2 },
    { ...planet.rocket.pad, radius: 1.9 },
    ...planet.machines.flatMap((m) => [{ ...m, radius: 2.8 }, { ...m.inputPad, radius: 1.5 }, { ...m.outputPad, radius: 1.5 }]),
    ...planet.builds.flatMap((b) => [{ ...b, radius: 1.9 }, { ...b.site, radius: 1.6 }]),
  ];
  flatZoneCache.set(planet, zones);
  return zones;
}

function flatness(planet: PlanetDef, x: number, z: number): number {
  let factor = 1;
  for (const zone of flatZones(planet)) {
    const t = Math.min(1, Math.max(0, (Math.hypot(x - zone.x, z - zone.z) - zone.radius) / 1.6));
    factor = Math.min(factor, t * t * (3 - 2 * t));
  }
  return factor;
}

function rawHeight(planet: PlanetDef, x: number, z: number): number {
  let h = (noise(x * 0.3, z * 0.3) - 0.5) * 0.35 + (noise(x * 1.1, z * 1.1) - 0.5) * 0.08;
  for (const crater of planet.scenery.craters) {
    const d = Math.hypot(x - crater.x, z - crater.z) / crater.radius;
    if (d < 1) h -= (1 - d * d) * 0.5 * crater.radius * 0.28;
    else if (d < 1.45) h += Math.sin(((d - 1) / 0.45) * Math.PI) * 0.16 * crater.radius * 0.3;
  }
  const out = outsideDistance(planet, x, z);
  if (out > 0) h += out * EDGE_RISE + noise(x * 0.2, z * 0.2) * out * 0.4 + noise(x * 0.7, z * 0.7) * Math.min(out, 6) * 0.15;
  return h;
}

/** Ground height: rolling regolith, craters for character, hills beyond the edge, level under buildings. */
export function heightAt(planet: PlanetDef, x: number, z: number): number {
  return rawHeight(planet, x, z) * flatness(planet, x, z);
}

/** How deep inside a crater bowl a point is, 0..1, for darker crater floors. */
function craterDepth(planet: PlanetDef, x: number, z: number): number {
  let depth = 0;
  for (const crater of planet.scenery.craters) {
    const d = Math.hypot(x - crater.x, z - crater.z) / crater.radius;
    if (d < 1) depth = Math.max(depth, 1 - d);
  }
  return depth;
}

function ground(planet: PlanetDef): Mesh {
  const centreX = (planet.bounds.minX + planet.bounds.maxX) / 2;
  const centreZ = (planet.bounds.minZ + planet.bounds.maxZ) / 2;
  const geometry = new PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_SEGMENTS, GROUND_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(centreX, 0, centreZ);
  const position = geometry.getAttribute("position") as BufferAttribute;
  for (let i = 0; i < position.count; i += 1) position.setY(i, heightAt(planet, position.getX(i), position.getZ(i)));
  geometry.computeVertexNormals();
  const normal = geometry.getAttribute("normal") as BufferAttribute;

  const low = new Color(planet.palette.groundLow);
  const high = new Color(planet.palette.groundHigh);
  const rockTone = new Color(planet.palette.rock);
  const colors = new Float32Array(position.count * 3);
  const tint = new Color();
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    // Broad light and dark "seas", lighter rims, darker crater floors and rocky slopes.
    const patch = noise(x * 0.09, z * 0.09);
    const grain = noise(x * 0.9, z * 0.9);
    let t = 0.08 + patch * 0.95 + (grain - 0.5) * 0.3 + position.getY(i) * 0.35 - craterDepth(planet, x, z) * 0.5;
    t = Math.min(1, Math.max(0, t));
    tint.copy(low).lerp(high, t);
    // Warm and cool mineral patches break up the grey.
    tint.lerp(WARM_DUST, Math.max(0, noise(x * 0.05 + 7, z * 0.05) - 0.45) * 0.9).lerp(COOL_DUST, Math.max(0, noise(x * 0.07 - 3, z * 0.07 + 5) - 0.5) * 0.8);
    const slope = 1 - normal.getY(i);
    if (slope > 0.08) tint.lerp(rockTone, Math.min(1, (slope - 0.08) * 3));
    tint.toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  const material = new MeshStandardMaterial({ map: regolithTexture(GROUND_SIZE / 7), normalMap: regolithNormalTexture(GROUND_SIZE / 4.5), vertexColors: true, roughness: 0.96, metalness: 0 });
  material.normalScale.set(2.4, 2.4);
  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.userData.noCastShadow = true;
  return mesh;
}

/** Rock shades come in a few steps so rocks share materials and bake into few draw calls. */
const ROCK_SHADES = [0.82, 0.92, 1.02, 1.12] as const;

function rock(planet: PlanetDef, scale: number, seed: number): Mesh {
  const geometry = new IcosahedronGeometry(1, 2);
  const position = geometry.getAttribute("position") as BufferAttribute;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    // Displace by position-based noise so shared corners move together and the rock stays closed.
    const jitter = 0.74 + noise(x * 1.7 + seed, z * 1.7 + y * 1.3) * 0.42 + noise(x * 4.1 + seed, y * 4.1 - z) * 0.12;
    position.setXYZ(i, x * jitter, y * jitter * 0.72, z * jitter);
  }
  geometry.computeVertexNormals();
  const step = ROCK_SHADES[Math.floor(hash(seed, 7) * ROCK_SHADES.length)] ?? 1;
  const shade = new Color(planet.palette.rock).multiplyScalar(step);
  const mesh = new Mesh(geometry, flat(shade.getHex(), 0.95));
  mesh.scale.setScalar(scale);
  mesh.rotation.set(hash(seed, 1) * 0.6, hash(seed, 2) * Math.PI * 2, hash(seed, 3) * 0.6);
  return mesh;
}

export interface RidgeView {
  readonly root: Group;
  /** Boulders that block the gap until the drill bores through. */
  readonly gapBoulders: Mesh[];
}

/** Rows of the ridge, front (south) to back: depth offset, smallest and largest boulder. */
const RIDGE_ROWS = [
  { offset: 1, min: 1.2, max: 1.7 },
  { offset: 0, min: 2, max: 2.8 },
  { offset: -1.2, min: 2.3, max: 3.2 },
] as const;
const RIDGE_STEP = 1.7;

/** A massive wall of boulders, three rows deep; the gap is filled with boulders just as big. */
function ridge(planet: PlanetDef): RidgeView {
  const root = new Group();
  const gapBoulders: Mesh[] = [];
  const { z, gapHalfWidth } = planet.ridge;
  let seed = 11;
  RIDGE_ROWS.forEach((row, index) => {
    const shift = (index % 2) * RIDGE_STEP * 0.5;
    for (let x = planet.bounds.minX - 8 + shift; x <= planet.bounds.maxX + 8; x += RIDGE_STEP) {
      seed += 1;
      const scale = row.min + hash(seed, 9) * (row.max - row.min);
      const boulder = rock(planet, scale, seed);
      const bz = z + row.offset + (hash(seed, 6) - 0.5) * 0.5;
      const bx = x + (hash(seed, 4) - 0.5) * 0.5;
      boulder.position.set(bx, heightAt(planet, bx, bz) + scale * 0.3, bz);
      root.add(boulder);
      if (Math.abs(bx) < gapHalfWidth + 0.4) {
        boulder.userData.dynamic = true;
        gapBoulders.push(boulder);
      }
    }
  });
  return { root, gapBoulders };
}

/** Scattered pebbles and rocks as one instanced mesh, avoiding gameplay spots. */
function scatter(planet: PlanetDef, keepClear: readonly (Point & { radius: number })[]): InstancedMesh {
  const geometry = new DodecahedronGeometry(1, 0);
  const mesh = new InstancedMesh(geometry, flat(planet.palette.rock, 0.95), SCATTER_COUNT);
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const position = new Vector3();
  let placed = 0;
  for (let i = 0; placed < mesh.count && i < 4000; i += 1) {
    const x = planet.bounds.minX - 8 + hash(i, 1.3) * (planet.bounds.maxX - planet.bounds.minX + 16);
    const z = planet.bounds.minZ - 8 + hash(i, 2.7) * (planet.bounds.maxZ - planet.bounds.minZ + 16);
    if (keepClear.some((p) => Math.hypot(p.x - x, p.z - z) < p.radius)) continue;
    if (Math.abs(z - planet.ridge.z) < 3) continue;
    const size = 0.06 + hash(i, 4.1) ** 3 * 0.55;
    position.set(x, heightAt(planet, x, z) + size * 0.2, z);
    rotation.setFromAxisAngle(new Vector3(hash(i, 5), 1, hash(i, 6)).normalize(), hash(i, 7) * Math.PI * 2);
    scale.set(size, size * 0.7, size * (0.8 + hash(i, 8) * 0.5));
    mesh.setMatrixAt(placed, matrix.compose(position, rotation, scale));
    placed += 1;
  }
  mesh.count = placed;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function starfield(count: number): Points {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const u = hash(i, 0.5) * 2 - 1;
    const theta = hash(i, 9.9) * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    positions.set([r * Math.cos(theta) * 160, Math.abs(u) * 160 + 10, r * Math.sin(theta) * 160], i * 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return new Points(geometry, new PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false }));
}

/** Earth hanging in the black sky, with a thin blue atmosphere. */
function earth(): Group {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = "#1d4f9a";
  ctx.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 60; i += 1) {
    ctx.fillStyle = hash(i, 3) > 0.5 ? "#3f7a3a" : "#8a7a4a";
    ctx.beginPath();
    ctx.ellipse(hash(i, 1) * 256, 20 + hash(i, 2) * 88, 6 + hash(i, 4) * 18, 4 + hash(i, 5) * 10, hash(i, 6) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 90; i += 1) {
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.ellipse(hash(i, 7) * 256, hash(i, 8) * 128, 8 + hash(i, 9) * 22, 2 + hash(i, 10) * 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const group = new Group();
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  const globe = new Mesh(new IcosahedronGeometry(9, 4), new MeshStandardMaterial({ map, roughness: 0.7, emissive: 0x16305a, emissiveIntensity: 0.35, fog: false }));
  globe.rotation.set(0.4, 2.2, 0.2);
  const halo = new Mesh(new IcosahedronGeometry(9.6, 4), new MeshBasicMaterial({ color: 0x6fb4ff, transparent: true, opacity: 0.18, fog: false, depthWrite: false }));
  group.add(globe, halo);
  group.position.set(-60, 48, -150);
  return group;
}

export interface TerrainView {
  readonly root: Group;
  readonly ridge: RidgeView;
}

export function buildTerrain(planet: PlanetDef, keepClear: readonly (Point & { radius: number })[]): TerrainView {
  const root = new Group();
  const ridgeView = ridge(planet);
  root.add(ground(planet), ridgeView.root, scatter(planet, keepClear), starfield(planet.scenery.starCount), earth());
  // A few big boulders along the map edge frame the playfield.
  let seed = 200;
  for (const [x, z, s] of planet.scenery.edgeBoulders) {
    seed += 1;
    const boulder = rock(planet, s, seed);
    boulder.position.set(x, heightAt(planet, x, z) + s * 0.3, z);
    root.add(boulder);
  }
  return { root, ridge: ridgeView };
}
