import { DRONE, DRONE_UPGRADES, ITEMS, droneCapacityFor, dronePriceFactor, droneSpeedFor, type DroneUpgradeId } from "../config";
import type { MachineDef, Point, UnlockDef } from "../planets/types";
import type { Emit } from "./events";
import type { UpgradeResult } from "./inventory";
import { zeroDroneUpgrades, type DroneState, type GameState } from "./state";

const ARRIVE_DISTANCE = 0.12;
/** Hover just beside a pad, not on top of the player standing on it. */
const HOVER_OFFSET = { x: 0.9, z: 0.5 } as const;
/** With some cargo aboard, stop waiting for a full load after this long. */
const PARTIAL_LOAD_WAIT = 2.5;

function droneUnlocks(state: GameState): UnlockDef[] {
  return state.planet.unlocks.filter((u) => u.kind === "drone" && u.machineId !== undefined);
}

function sourceOf(state: GameState, drone: DroneState): MachineDef | undefined {
  return state.planet.machines.find((m) => m.id === drone.machineId);
}

function dockOf(state: GameState, drone: DroneState): Point {
  const unlock = state.planet.unlocks.find((u) => u.id === drone.id);
  return unlock ? { x: unlock.x, z: unlock.z } : { x: state.planet.trader.x, z: state.planet.trader.z };
}

function hover(point: Point): Point {
  return { x: point.x + HOVER_OFFSET.x, z: point.z + HOVER_OFFSET.z };
}

export function isDroneEnabled(state: GameState, id: string): boolean {
  return state.droneEnabled[id] !== false;
}

/** Spawn a drone on its dock for every drone unlock that has been bought. */
function syncDrones(state: GameState): void {
  for (const unlock of droneUnlocks(state)) {
    if (!state.unlocked.has(unlock.id) || state.drones.some((d) => d.id === unlock.id)) continue;
    state.drones.push({ id: unlock.id, machineId: unlock.machineId as string, x: unlock.x, z: unlock.z, heading: 0, carry: 0, phase: "parked", timer: 0, cashRemainder: 0 });
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

function updateDrone(state: GameState, drone: DroneState, dt: number, emit: Emit): void {
  const def = sourceOf(state, drone);
  const machine = def ? state.machines.get(def.id) : undefined;
  if (!def || !machine) return;
  const levels = state.droneUpgrades[drone.id] ?? zeroDroneUpgrades();
  const speed = droneSpeedFor(levels.speed);
  const capacity = droneCapacityFor(levels.capacity);
  const enabled = isDroneEnabled(state, drone.id) && state.unlocked.has(def.id);

  switch (drone.phase) {
    case "parked":
      if (enabled && machine.output > 0) drone.phase = "toMachine";
      return;
    case "toMachine":
      if (!enabled) drone.phase = drone.carry > 0 ? "toTrader" : "returning";
      else if (flyToward(drone, hover(def.outputPad), speed, dt)) {
        drone.phase = "loading";
        drone.timer = 0;
      }
      return;
    case "loading": {
      drone.timer += dt;
      // Leave when full, paused, or when nothing more is coming for a while (park if empty-handed).
      if (!enabled || drone.carry >= capacity || (machine.output === 0 && drone.timer >= PARTIAL_LOAD_WAIT)) {
        drone.phase = drone.carry > 0 ? "toTrader" : "returning";
        return;
      }
      if (machine.output === 0 || drone.timer < DRONE.loadInterval) return;
      drone.timer = 0;
      machine.output -= 1;
      drone.carry += 1;
      emit({ type: "droneLoaded", droneId: drone.id, item: def.output, from: def.outputPad });
      return;
    }
    case "toTrader":
      if (flyToward(drone, hover(state.planet.sellPad), speed, dt)) {
        drone.phase = "selling";
        drone.timer = 0;
      }
      return;
    case "selling": {
      if (drone.carry <= 0) {
        drone.phase = enabled ? "toMachine" : "returning";
        return;
      }
      drone.timer += dt;
      if (drone.timer < DRONE.sellInterval) return;
      drone.timer = 0;
      drone.carry -= 1;
      // Haggled prices are fractional; carry the cents over so every upgrade level pays.
      const value = ITEMS[def.output].sellPrice * dronePriceFactor(levels.haggle) + drone.cashRemainder;
      const credits = Math.floor(value);
      drone.cashRemainder = value - credits;
      state.credits += credits;
      state.stats.earned += credits;
      emit({ type: "droneSold", droneId: drone.id, item: def.output, credits });
      return;
    }
    case "returning":
      if (enabled && machine.output > 0) drone.phase = "toMachine";
      else if (flyToward(drone, dockOf(state, drone), speed, dt)) drone.phase = "parked";
  }
}

export function updateDrones(state: GameState, dt: number, emit: Emit): void {
  syncDrones(state);
  for (const drone of state.drones) updateDrone(state, drone, dt, emit);
}

export function setDroneEnabled(state: GameState, id: string, enabled: boolean): void {
  if (!(id in state.droneEnabled)) return;
  state.droneEnabled[id] = enabled;
}

export function buyDroneUpgrade(state: GameState, droneId: string, id: DroneUpgradeId, emit: Emit): UpgradeResult {
  const levels = state.droneUpgrades[droneId];
  if (!levels || !state.unlocked.has(droneId)) return { ok: false, reason: "Buy this drone first" };
  const cost = DRONE_UPGRADES[id].costs[levels[id]];
  if (cost === undefined) return { ok: false, reason: "Already at max level" };
  if (state.credits < cost) return { ok: false, reason: `Needs ${cost - state.credits} more credits` };
  state.credits -= cost;
  levels[id] += 1;
  emit({ type: "droneUpgraded", droneId, id, level: levels[id] });
  return { ok: true };
}
