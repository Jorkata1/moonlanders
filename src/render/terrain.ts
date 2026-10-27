import {
  BufferAttribute,
  Color,
  DodecahedronGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  TorusGeometry,
  Vector3,
} from 'three';
import { WORLD_RADIUS } from '../config/balance';
import type { PlanetDefinition, Vec2 } from '../config/planets/types';
import { createRandom, randomBetween } from '../core/random';
import { surface } from './materials';

const GROUND_SIZE = 140;
const GROUND_SEGMENTS = 70;
const DECOR_ROCK_COUNT = 70;
const CRATER_COUNT = 9;

/** Positions decorations must keep clear of so gameplay stays readable. */
function reservedSpots(planet: PlanetDefinition): Array<{ point: Vec2; radius: number }> {
  return [
    { point: { x: 0, z: 0 }, radius: planet.domeRadius + 1.5 },
    ...planet.deposits.map((deposit) => ({ point: deposit.position, radius: deposit.radius + 2 })),
    ...planet.machines.map((machine) => ({ point: machine.position, radius: 5.5 })),
  ];
}

function isClear(point: Vec2, spots: ReturnType<typeof reservedSpots>): boolean {
  return spots.every(({ point: spot, radius }) => Math.hypot(point.x - spot.x, point.z - spot.z) > radius);
}

function heightAt(x: number, z: number): number {
  const distance = Math.hypot(x, z);
  const rim = Math.max(0, distance - (WORLD_RADIUS + 3));
  const ripples = Math.sin(x * 0.21) * Math.cos(z * 0.17) * 0.25 + Math.sin((x + z) * 0.09) * 0.2;
  return ripples * Math.min(1, distance / 20) + rim * rim * 0.06;
}

function createGround(planet: PlanetDefinition): Mesh {
  const geometry = new PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_SEGMENTS, GROUND_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position') as BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  const base = new Color(planet.palette.ground);
  const alt = new Color(planet.palette.groundAlt);
  const mixed = new Color();
  const random = createRandom(planet.decorationSeed);

  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const nearPlayArea = Math.hypot(x, z) < WORLD_RADIUS;
    positions.setY(i, nearPlayArea ? heightAt(x, z) * 0.4 - 0.05 : heightAt(x, z));
    mixed.copy(base).lerp(alt, random() * 0.55);
    colors.set([mixed.r, mixed.g, mixed.b], i * 3);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  material.userData.unique = true;
  const ground = new Mesh(geometry, material);
  ground.receiveShadow = true;
  return ground;
}

function createRocks(planet: PlanetDefinition): InstancedMesh {
  const random = createRandom(planet.decorationSeed * 7);
  const spots = reservedSpots(planet);
  const rocks = new InstancedMesh(new DodecahedronGeometry(1, 0), surface(planet.palette.rock), DECOR_ROCK_COUNT);
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const axis = new Vector3(0, 1, 0);
  let placed = 0;

  for (let attempt = 0; attempt < DECOR_ROCK_COUNT * 6 && placed < DECOR_ROCK_COUNT; attempt += 1) {
    const angle = random() * Math.PI * 2;
    const distance = randomBetween(random, 6, WORLD_RADIUS + 12);
    const point = { x: Math.cos(angle) * distance, z: Math.sin(angle) * distance };
    if (!isClear(point, spots)) continue;
    const size = randomBetween(random, 0.25, distance > WORLD_RADIUS ? 1.8 : 0.9);
    scale.set(size, size * randomBetween(random, 0.5, 0.9), size);
    rotation.setFromAxisAngle(axis, random() * Math.PI);
    matrix.compose(new Vector3(point.x, heightAt(point.x, point.z) * 0.4 + size * 0.2, point.z), rotation, scale);
    rocks.setMatrixAt(placed, matrix);
    placed += 1;
  }
  rocks.count = placed;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  return rocks;
}

function createCraters(planet: PlanetDefinition): Group {
  const random = createRandom(planet.decorationSeed * 13);
  const spots = reservedSpots(planet);
  const group = new Group();
  const material = surface(planet.palette.groundAlt);
  for (let attempt = 0; attempt < CRATER_COUNT * 8 && group.children.length < CRATER_COUNT; attempt += 1) {
    const point = { x: randomBetween(random, -WORLD_RADIUS, WORLD_RADIUS), z: randomBetween(random, -WORLD_RADIUS, WORLD_RADIUS) };
    if (!isClear(point, spots) || Math.hypot(point.x, point.z) > WORLD_RADIUS) continue;
    const radius = randomBetween(random, 1.2, 3);
    const crater = new Mesh(new TorusGeometry(radius, radius * 0.18, 4, 18), material);
    crater.rotation.x = -Math.PI / 2;
    crater.scale.z = 0.5;
    crater.position.set(point.x, 0, point.z);
    crater.receiveShadow = true;
    group.add(crater);
  }
  return group;
}

export function createTerrain(planet: PlanetDefinition): Group {
  const group = new Group();
  group.add(createGround(planet), createRocks(planet), createCraters(planet));
  return group;
}
