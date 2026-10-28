import { DEPOSIT, MACHINE, PLAYER, STORM, speedFor } from "../config";
import type { Point } from "../planets/types";
import { isInsideDome } from "./hazards";
import { isRidgeOpen, isStormRaging, type GameState } from "./state";

const ROCKET_RADIUS = 1.9;
const STATION_RADIUS = 1.4;
const DRILL_RADIUS = 1.3;
/** Half the ridge's thickness: a wall of big boulders the player cannot climb. */
export const RIDGE_HALF_DEPTH = 2.3;
const BOOST_SPEED_FACTOR = 1.35;

export interface MoveInput {
  /** Desired direction on the ground plane; length 0..1 (joystick deflection). */
  x: number;
  z: number;
}

interface Circle extends Point {
  radius: number;
}

/** Everything solid the player and robots bump into. */
export function colliders(state: GameState): Circle[] {
  const solids: Circle[] = [];
  for (const machine of state.planet.machines) {
    if (state.built.has(machine.id)) solids.push({ x: machine.x, z: machine.z, radius: MACHINE.colliderRadius });
  }
  for (const build of state.planet.builds) {
    if (build.kind === "drill" && state.built.has(build.id)) solids.push({ x: build.x, z: build.z, radius: DRILL_RADIUS });
  }
  for (const deposit of state.deposits) {
    if (deposit.amount > 0) solids.push({ x: deposit.x, z: deposit.z, radius: DEPOSIT.radius });
  }
  solids.push({ x: state.planet.rocket.x, z: state.planet.rocket.z, radius: ROCKET_RADIUS });
  solids.push({ x: state.planet.suitStation.x, z: state.planet.suitStation.z, radius: STATION_RADIUS });
  if (state.planet.builds.some((b) => b.kind === "workbench" && state.built.has(b.id))) solids.push({ x: state.planet.workbench.x, z: state.planet.workbench.z, radius: STATION_RADIUS });
  return solids;
}

interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** The ridge is one solid wall until the drill bores through, then two walls either side of the gap. */
export function ridgeWalls(state: GameState): Rect[] {
  const { ridge, bounds } = state.planet;
  const minZ = ridge.z - RIDGE_HALF_DEPTH;
  const maxZ = ridge.z + RIDGE_HALF_DEPTH;
  const far = 50;
  if (!isRidgeOpen(state)) return [{ minX: bounds.minX - far, maxX: bounds.maxX + far, minZ, maxZ }];
  return [
    { minX: bounds.minX - far, maxX: -ridge.gapHalfWidth, minZ, maxZ },
    { minX: ridge.gapHalfWidth, maxX: bounds.maxX + far, minZ, maxZ },
  ];
}

const GAP_APPROACH = RIDGE_HALF_DEPTH + 1;

/**
 * Next point to walk toward on the way to `target`: straight there, unless the ridge is in the
 * way, in which case through the middle of the gap first.
 */
export function routeToward(state: GameState, from: Point, target: Point): Point {
  const ridge = state.planet.ridge;
  if (from.z > ridge.z === target.z > ridge.z) return target;
  const side = from.z > ridge.z ? 1 : -1;
  if (Math.abs(from.x) > 0.6 && Math.abs(from.z - (ridge.z + side * GAP_APPROACH)) > 0.4) return { x: 0, z: ridge.z + side * GAP_APPROACH };
  return { x: 0, z: ridge.z - side * GAP_APPROACH };
}

/** Circle-vs-box push-out along the shortest way, so bodies slide along walls instead of snagging. */
function pushOutOfRect(body: { x: number; z: number }, radius: number, rect: Rect): void {
  const closestX = Math.min(rect.maxX, Math.max(rect.minX, body.x));
  const closestZ = Math.min(rect.maxZ, Math.max(rect.minZ, body.z));
  const dx = body.x - closestX;
  const dz = body.z - closestZ;
  const distance = Math.hypot(dx, dz);
  if (distance >= radius) return;
  if (distance > 1e-6) {
    body.x = closestX + (dx / distance) * radius;
    body.z = closestZ + (dz / distance) * radius;
    return;
  }
  // Centre is inside the box: leave through the nearest face.
  const exits = [
    { gap: body.x - rect.minX, apply: () => (body.x = rect.minX - radius) },
    { gap: rect.maxX - body.x, apply: () => (body.x = rect.maxX + radius) },
    { gap: body.z - rect.minZ, apply: () => (body.z = rect.minZ - radius) },
    { gap: rect.maxZ - body.z, apply: () => (body.z = rect.maxZ + radius) },
  ];
  exits.sort((a, b) => a.gap - b.gap);
  exits[0]?.apply();
}

/** Push a body of the given radius out of solids, the ridge and the map edge. */
export function resolveCollisions(state: GameState, body: { x: number; z: number }, radius: number, solids: Circle[]): void {
  for (const solid of solids) {
    const dx = body.x - solid.x;
    const dz = body.z - solid.z;
    const distance = Math.hypot(dx, dz);
    const minimum = solid.radius + radius;
    if (distance >= minimum) continue;
    if (distance < 1e-6) {
      body.z = solid.z + minimum;
      continue;
    }
    body.x = solid.x + (dx / distance) * minimum;
    body.z = solid.z + (dz / distance) * minimum;
  }

  for (const wall of ridgeWalls(state)) pushOutOfRect(body, radius, wall);

  const { bounds } = state.planet;
  body.x = Math.min(bounds.maxX - radius, Math.max(bounds.minX + radius, body.x));
  body.z = Math.min(bounds.maxZ - radius, Math.max(bounds.minZ + radius, body.z));
}

export function movePlayer(state: GameState, input: MoveInput, dt: number): void {
  const player = state.player;
  const length = Math.min(1, Math.hypot(input.x, input.z));
  player.moving = player.stunned <= 0 && length > 0.05;
  if (!player.moving) return;

  const boost = state.boostSeconds > 0 ? BOOST_SPEED_FACTOR : 1;
  const storm = isStormRaging(state) && !isInsideDome(state, player) ? STORM.speedMultiplier : 1;
  const speed = speedFor(state.suit.speed) * boost * storm * length;
  const nx = input.x / Math.hypot(input.x, input.z);
  const nz = input.z / Math.hypot(input.x, input.z);
  player.x += nx * speed * dt;
  player.z += nz * speed * dt;
  player.heading = Math.atan2(nx, nz);
  resolveCollisions(state, player, PLAYER.radius, colliders(state));
}
