import { DRONE, droneCapacityFor, droneSpeedFor, type ItemId } from "../config";
import type { BuildDef, MachineDef, Point } from "../planets/types";
import { machineStats } from "./economy";
import type { Emit } from "./events";
import { deliverToOrder, orderNeeds, orderSite } from "./orders";
import { buildDef, stockpileSpot, type DroneState, type GameState } from "./state";

const ARRIVE_DISTANCE = 0.12;
/** Hover just beside a point, not on top of the player standing there. */
const HOVER_OFFSET = { x: 0.9, z: 0.5 } as const;

function hover(point: Point): Point {
  return { x: point.x + HOVER_OFFSET.x, z: point.z + HOVER_OFFSET.z };
}

function dockOf(state: GameState, drone: DroneState): BuildDef {
  const build = buildDef(state.planet, drone.id);
  if (!build) throw new Error(`Drone ${drone.id} has no build`);
  return build;
}

function machineOf(state: GameState, drone: DroneState): MachineDef | undefined {
  return state.planet.machines.find((m) => m.id === drone.machineId);
}

/** Spawn a drone on its dock once its build is finished. */
function syncDrones(state: GameState): void {
  for (const build of state.planet.builds) {
    if (build.kind !== "drone" || !build.machineId || !state.built.has(build.id)) continue;
    if (state.drones.some((d) => d.id === build.id)) continue;
    state.drones.push({ id: build.id, machineId: build.machineId, x: build.x, z: build.z, heading: 0, carry: 0, cargo: null, source: null, phase: "parked", timer: 0 });
  }
}

/** Fly straight toward a point (drones ignore walls); returns true on arrival. */
function flyToward(drone: DroneState, target: Point, speed: number, dt: number): boolean {
  const dx = target.x - drone.x;
  const dz = target.z - drone.z;
  const remaining = Math.hypot(dx, dz);
  if (remaining <= ARRIVE_DISTANCE) return true;
  const step = Math.min(remaining, speed * dt);
  drone.x += (dx / remaining) * step;
  drone.z += (dz / remaining) * step;
  drone.heading = Math.atan2(dx, dz);
  return false;
}

function sourcePoint(state: GameState, drone: DroneState): Point {
  if (drone.source) {
    const robot = buildDef(state.planet, drone.source);
    if (robot) return stockpileSpot(robot);
  }
  return hover(machineOf(state, drone)?.outputPad ?? dockOf(state, drone));
}

/** How many of the cargo are left at the source. */
function sourceStock(state: GameState, drone: DroneState): number {
  if (drone.source) return state.stockpiles[drone.source] ?? 0;
  const def = machineOf(state, drone);
  return def && state.built.has(def.id) ? (state.machines.get(def.id)?.output ?? 0) : 0;
}

/** Change the stock at the drone's source by `amount` (negative to take, positive to put back). */
function adjustSource(state: GameState, drone: DroneState, amount: number): void {
  if (drone.source) {
    state.stockpiles[drone.source] = (state.stockpiles[drone.source] ?? 0) + amount;
    return;
  }
  const machine = state.machines.get(drone.machineId);
  const def = machineOf(state, drone);
  if (!machine || !def) return;
  // Never overfill the machine; anything that doesn't fit is set down beside its output.
  const room = amount > 0 ? Math.max(0, machineStats(state, def).outputCapacity - machine.output) : amount;
  const kept = Math.min(amount, room);
  machine.output += kept;
  if (amount > kept) state.piles.push({ id: state.nextPileId++, x: def.outputPad.x + 0.9, z: def.outputPad.z + 0.9, items: new Array<ItemId>(amount - kept).fill(def.output), held: false });
}

/** Plates from the machine first; otherwise any robot stockpile the order is waiting on. */
function findJob(state: GameState, drone: DroneState): boolean {
  const def = machineOf(state, drone);
  if (def && orderNeeds(state, def.output) > 0 && sourceStock(state, { ...drone, source: null }) > 0) {
    drone.source = null;
    drone.cargo = def.output;
    return true;
  }
  for (const robot of state.robots) {
    if (robot.machineId || orderNeeds(state, robot.item) <= 0 || (state.stockpiles[robot.id] ?? 0) <= 0) continue;
    drone.source = robot.id;
    drone.cargo = robot.item;
    return true;
  }
  return false;
}

function updateDrone(state: GameState, drone: DroneState, dt: number, emit: Emit): void {
  const stage = state.stages[drone.id] ?? 0;
  const speed = droneSpeedFor(stage);
  const capacity = droneCapacityFor(stage);
  const enabled = state.enabled[drone.id] !== false;
  const cargo: ItemId | null = drone.cargo;

  switch (drone.phase) {
    case "parked":
      if (enabled && findJob(state, drone)) drone.phase = "toSource";
      return;
    case "toSource":
      if (!enabled || !cargo || orderNeeds(state, cargo) <= 0) {
        drone.phase = "returning";
        return;
      }
      if (flyToward(drone, sourcePoint(state, drone), speed, dt)) {
        drone.phase = "loading";
        drone.timer = 0;
      }
      return;
    case "loading": {
      if (!cargo) {
        drone.phase = "returning";
        return;
      }
      const wanted = Math.min(capacity, orderNeeds(state, cargo));
      if (!enabled || drone.carry >= wanted || sourceStock(state, drone) <= 0) {
        drone.phase = drone.carry > 0 ? "toOrder" : "returning";
        return;
      }
      drone.timer += dt;
      if (drone.timer < DRONE.loadInterval) return;
      drone.timer = 0;
      adjustSource(state, drone, -1);
      drone.carry += 1;
      emit({ type: "droneLoaded", droneId: drone.id, item: cargo, from: sourcePoint(state, drone) });
      return;
    }
    case "toOrder": {
      if (!state.order || !cargo || orderNeeds(state, cargo) <= 0) {
        drone.phase = "restocking";
        return;
      }
      if (flyToward(drone, hover(orderSite(state, state.order)), speed, dt)) {
        drone.phase = "unloading";
        drone.timer = 0;
      }
      return;
    }
    case "unloading": {
      if (drone.carry <= 0 || !cargo) {
        drone.cargo = null;
        drone.phase = enabled && findJob(state, drone) ? "toSource" : "returning";
        return;
      }
      drone.timer += dt;
      if (drone.timer < DRONE.unloadInterval) return;
      drone.timer = 0;
      if (!deliverToOrder(state, cargo, drone, drone.id, emit)) {
        drone.phase = "restocking";
        return;
      }
      drone.carry -= 1;
      return;
    }
    case "restocking":
      if (drone.carry <= 0 || flyToward(drone, sourcePoint(state, drone), speed, dt)) {
        adjustSource(state, drone, drone.carry);
        drone.carry = 0;
        drone.cargo = null;
        drone.phase = "returning";
      }
      return;
    case "returning":
      if (enabled && findJob(state, drone)) drone.phase = "toSource";
      else if (flyToward(drone, dockOf(state, drone), speed, dt)) drone.phase = "parked";
  }
}

export function updateDrones(state: GameState, dt: number, emit: Emit): void {
  syncDrones(state);
  for (const drone of state.drones) updateDrone(state, drone, dt, emit);
}
