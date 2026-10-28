import { DRONE, ITEM_IDS, ROBOT, droneCapacityFor, droneSpeedFor, type ItemId } from "../config";
import type { BuildDef, MachineDef, Point } from "../planets/types";
import { machineStats } from "./economy";
import type { Emit } from "./events";
import { deliverToOrder, orderNeeds, orderSite } from "./orders";
import { buildDef, stockpileSpot, type DroneSource, type DroneState, type DroneTarget, type GameState } from "./state";

const ARRIVE_DISTANCE = 0.12;
/** Hover just beside a point, not on top of the player standing there. */
const HOVER_OFFSET = { x: 0.9, z: 0.5 } as const;
/** A machine whose input is below this share of its hopper is fed before anything else. */
const FEED_FIRST_SHARE = 0.25;

interface Job {
  readonly item: ItemId;
  readonly source: DroneSource;
  readonly target: DroneTarget;
}

interface FeedJob extends Job {
  /** How full the machine's input already is, 0..1. */
  readonly share: number;
}

function hover(point: Point): Point {
  return { x: point.x + HOVER_OFFSET.x, z: point.z + HOVER_OFFSET.z };
}

function dockOf(state: GameState, drone: DroneState): BuildDef {
  const build = buildDef(state.planet, drone.id);
  if (!build) throw new Error(`Drone ${drone.id} has no build`);
  return build;
}

function machineDef(state: GameState, id: string): MachineDef | undefined {
  return state.planet.machines.find((m) => m.id === id && state.built.has(m.id));
}

/** Spawn a drone on its dock once its build is finished. */
function syncDrones(state: GameState): void {
  for (const build of state.planet.builds) {
    if (build.kind !== "drone" || !state.built.has(build.id)) continue;
    if (state.drones.some((d) => d.id === build.id)) continue;
    state.drones.push({ id: build.id, x: build.x, z: build.z, heading: 0, carry: 0, cargo: null, source: null, target: null, phase: "parked", timer: 0 });
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

function stockAt(state: GameState, source: DroneSource): number {
  if (source.kind === "stockpile") return state.stockpiles[source.id] ?? 0;
  const def = machineDef(state, source.id);
  return def ? (state.machines.get(def.id)?.output ?? 0) : 0;
}

function sourcePoint(state: GameState, source: DroneSource): Point | null {
  if (source.kind === "stockpile") {
    const robot = buildDef(state.planet, source.id);
    return robot ? stockpileSpot(robot) : null;
  }
  const def = machineDef(state, source.id);
  return def ? hover(def.outputPad) : null;
}

function targetPoint(state: GameState, target: DroneTarget): Point | null {
  if (target.kind === "order") return state.order ? hover(orderSite(state, state.order)) : null;
  const def = machineDef(state, target.id);
  return def ? hover(def.inputPad) : null;
}

/** How many more of `item` the target can take right now. */
function wantedBy(state: GameState, target: DroneTarget, item: ItemId): number {
  if (target.kind === "order") return orderNeeds(state, item);
  const def = machineDef(state, target.id);
  const machine = def ? state.machines.get(def.id) : undefined;
  if (!def || !machine || def.input !== item) return 0;
  return Math.max(0, machineStats(state, def).inputCapacity - machine.input);
}

/** The fullest place holding `item`: a robot's stockpile or a machine's output. */
function bestSource(state: GameState, item: ItemId): DroneSource | null {
  let best: DroneSource | null = null;
  let most = 0;
  const candidates: DroneSource[] = [
    ...state.robots.filter((robot) => robot.item === item).map((robot): DroneSource => ({ kind: "stockpile", id: robot.id })),
    ...state.planet.machines.filter((def) => def.output === item).map((def): DroneSource => ({ kind: "machine", id: def.id })),
  ];
  for (const source of candidates) {
    const stock = stockAt(state, source);
    if (stock <= most) continue;
    most = stock;
    best = source;
  }
  return best;
}

/** Machines that can be topped up from a robot stockpile, emptiest first. */
function feedJobs(state: GameState): FeedJob[] {
  const jobs: FeedJob[] = [];
  for (const def of state.planet.machines) {
    const machine = state.machines.get(def.id);
    if (!machine || !state.built.has(def.id)) continue;
    const capacity = machineStats(state, def).inputCapacity;
    if (machine.input >= capacity) continue;
    const source = bestSource(state, def.input);
    if (source?.kind === "stockpile") jobs.push({ item: def.input, source, target: { kind: "machine", id: def.id }, share: machine.input / capacity });
  }
  return jobs.sort((a, b) => a.share - b.share);
}

/** The material the order needs that has the most waiting at a source. */
function orderJob(state: GameState): Job | null {
  let best: Job | null = null;
  let most = 0;
  for (const item of ITEM_IDS) {
    const need = orderNeeds(state, item);
    if (need <= 0) continue;
    const source = bestSource(state, item);
    if (!source) continue;
    const ready = Math.min(need, stockAt(state, source));
    if (ready <= most) continue;
    most = ready;
    best = { item, source, target: { kind: "order" } };
  }
  return best;
}

/** A nearly empty machine first, then the order, then topping machines up. */
function findJob(state: GameState, drone: DroneState): boolean {
  const feeds = feedJobs(state);
  const job = feeds.find((feed) => feed.share < FEED_FIRST_SHARE) ?? orderJob(state) ?? feeds[0] ?? null;
  if (!job) return false;
  drone.cargo = job.item;
  drone.source = job.source;
  drone.target = job.target;
  return true;
}

function clearJob(drone: DroneState): void {
  drone.cargo = null;
  drone.source = null;
  drone.target = null;
}

/** Put cargo back at its source; whatever no longer fits is set down beside it. */
function restock(state: GameState, drone: DroneState): void {
  const { source, cargo } = drone;
  if (!source || !cargo || drone.carry <= 0) return;
  let kept = 0;
  let spot: Point | null = null;
  if (source.kind === "stockpile") {
    const stock = state.stockpiles[source.id] ?? 0;
    kept = Math.min(drone.carry, Math.max(0, ROBOT.stockpileCapacity - stock));
    state.stockpiles[source.id] = stock + kept;
    spot = sourcePoint(state, source);
  } else {
    const def = machineDef(state, source.id);
    const machine = def ? state.machines.get(def.id) : undefined;
    if (def && machine) {
      kept = Math.min(drone.carry, Math.max(0, machineStats(state, def).outputCapacity - machine.output));
      machine.output += kept;
      spot = def.outputPad;
    }
  }
  const left = drone.carry - kept;
  const at = spot ?? drone;
  if (left > 0) state.piles.push({ id: state.nextPileId++, x: at.x + 0.9, z: at.z + 0.9, items: new Array<ItemId>(left).fill(cargo), held: false });
}

function takeOne(state: GameState, source: DroneSource): void {
  if (source.kind === "stockpile") {
    state.stockpiles[source.id] = Math.max(0, (state.stockpiles[source.id] ?? 0) - 1);
    return;
  }
  const machine = state.machines.get(source.id);
  if (machine) machine.output = Math.max(0, machine.output - 1);
}

/** Hand one item to the target; false when it cannot take any more. */
function unloadOne(state: GameState, drone: DroneState, cargo: ItemId, target: DroneTarget, emit: Emit): boolean {
  if (target.kind === "order") return deliverToOrder(state, cargo, drone, drone.id, emit);
  const def = machineDef(state, target.id);
  const machine = def ? state.machines.get(def.id) : undefined;
  if (!def || !machine || wantedBy(state, target, cargo) <= 0) return false;
  machine.input += 1;
  emit({ type: "fed", item: cargo, machineId: def.id, to: def.inputPad, by: drone.id });
  return true;
}

function updateDrone(state: GameState, drone: DroneState, dt: number, emit: Emit): void {
  const stage = state.stages[drone.id] ?? 0;
  const speed = droneSpeedFor(stage);
  const capacity = droneCapacityFor(stage);
  const enabled = state.enabled[drone.id] !== false;
  const { cargo, source, target } = drone;

  switch (drone.phase) {
    case "parked":
      if (enabled && findJob(state, drone)) drone.phase = "toSource";
      return;
    case "toSource": {
      const at = source ? sourcePoint(state, source) : null;
      if (!enabled || !cargo || !target || !at || wantedBy(state, target, cargo) <= 0) {
        clearJob(drone);
        drone.phase = "returning";
        return;
      }
      if (flyToward(drone, at, speed, dt)) {
        drone.phase = "loading";
        drone.timer = 0;
      }
      return;
    }
    case "loading": {
      if (!cargo || !source || !target) {
        drone.phase = "returning";
        return;
      }
      const wanted = Math.min(capacity, wantedBy(state, target, cargo));
      if (!enabled || drone.carry >= wanted || stockAt(state, source) <= 0) {
        drone.phase = drone.carry > 0 ? "toTarget" : "returning";
        return;
      }
      drone.timer += dt;
      if (drone.timer < DRONE.loadInterval) return;
      drone.timer = 0;
      takeOne(state, source);
      drone.carry += 1;
      emit({ type: "droneLoaded", droneId: drone.id, item: cargo, from: sourcePoint(state, source) ?? { x: drone.x, z: drone.z } });
      return;
    }
    case "toTarget": {
      const at = target ? targetPoint(state, target) : null;
      if (!cargo || !target || !at || wantedBy(state, target, cargo) <= 0) {
        drone.phase = "restocking";
        return;
      }
      if (flyToward(drone, at, speed, dt)) {
        drone.phase = "unloading";
        drone.timer = 0;
      }
      return;
    }
    case "unloading": {
      if (drone.carry <= 0 || !cargo || !target) {
        clearJob(drone);
        drone.phase = enabled && findJob(state, drone) ? "toSource" : "returning";
        return;
      }
      drone.timer += dt;
      if (drone.timer < DRONE.unloadInterval) return;
      drone.timer = 0;
      if (!unloadOne(state, drone, cargo, target, emit)) {
        drone.phase = "restocking";
        return;
      }
      drone.carry -= 1;
      return;
    }
    case "restocking": {
      const at = source ? sourcePoint(state, source) : null;
      if (drone.carry <= 0 || !at || flyToward(drone, at, speed, dt)) {
        restock(state, drone);
        drone.carry = 0;
        clearJob(drone);
        drone.phase = "returning";
      }
      return;
    }
    case "returning":
      if (enabled && findJob(state, drone)) drone.phase = "toSource";
      else if (flyToward(drone, dockOf(state, drone), speed, dt)) drone.phase = "parked";
  }
}

export function updateDrones(state: GameState, dt: number, emit: Emit): void {
  syncDrones(state);
  for (const drone of state.drones) updateDrone(state, drone, dt, emit);
}
