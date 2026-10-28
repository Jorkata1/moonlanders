import { ROBOT, robotCapacityFor, robotMineIntervalFor, robotSpeedFor } from "../config";
import type { BuildDef, Point } from "../planets/types";
import { machineStats, nearestMinableDeposit } from "./economy";
import type { Emit } from "./events";
import { routeToward } from "./movement";
import { takeFromDeposit } from "./orefall";
import { deliverToOrder, orderNeeds, orderSite } from "./orders";
import { buildDef, stockpileSpot, type GameState, type RobotState } from "./state";

const ARRIVE_DISTANCE = 0.15;
const SEARCH_RANGE = 80;
const MINE_STANDOFF = 1.1;
/** Robots stand just beside a drop-off point, not on top of it. */
const DROP_STANDOFF = 0.6;

/** Spawn a robot on its dock for every robot build that is finished. */
function syncRobots(state: GameState): void {
  for (const build of state.planet.builds) {
    if (build.kind !== "robot" || !build.item || !state.built.has(build.id)) continue;
    if (state.robots.some((r) => r.id === build.id)) continue;
    state.robots.push({ id: build.id, item: build.item, machineId: build.machineId ?? null, x: build.x, z: build.z, heading: 0, carry: 0, phase: "parked", dropOff: "stockpile", depositId: null, timer: 0 });
  }
}

/** Walk toward a target (around the ridge if needed); returns true once close enough. */
function walk(state: GameState, robot: RobotState, target: Point, stopDistance: number, speed: number, dt: number): boolean {
  const next = routeToward(state, robot, target);
  const final = next === target;
  const dx = next.x - robot.x;
  const dz = next.z - robot.z;
  const length = Math.hypot(dx, dz);
  const remaining = length - (final ? stopDistance : 0);
  if (final && remaining <= ARRIVE_DISTANCE) return true;
  if (length < 1e-6) return final;
  const step = Math.min(Math.max(remaining, 0), speed * dt);
  robot.x += (dx / length) * step;
  robot.z += (dz / length) * step;
  robot.heading = Math.atan2(dx, dz);
  return false;
}

function dockOf(state: GameState, robot: RobotState): BuildDef {
  const build = buildDef(state.planet, robot.id);
  if (!build) throw new Error(`Robot ${robot.id} has no build`);
  return build;
}

function dropOffPoint(state: GameState, robot: RobotState): Point {
  if (robot.dropOff === "machine") {
    const def = state.planet.machines.find((m) => m.id === robot.machineId);
    if (def) return def.inputPad;
  }
  if (robot.dropOff === "order" && state.order) return orderSite(state, state.order);
  return stockpileSpot(dockOf(state, robot));
}

/** A far-away build is left to the cargo drone when one is working; robots keep mining instead. */
function walksToOrder(state: GameState, robot: RobotState): boolean {
  if (!state.order) return false;
  const site = orderSite(state, state.order);
  const dock = dockOf(state, robot);
  const droneWorking = state.drones.some((d) => state.enabled[d.id] !== false);
  return !droneWorking || Math.hypot(site.x - dock.x, site.z - dock.z) <= ROBOT.walkRange;
}

/** Pick the robot's next job from scratch. */
function decide(state: GameState, robot: RobotState): void {
  robot.timer = 0;
  if (state.enabled[robot.id] === false) {
    robot.phase = "parked";
    return;
  }
  if (robot.machineId) {
    robot.dropOff = "machine";
    robot.phase = robot.carry > 0 ? "toDropOff" : "toDeposit";
    return;
  }
  const need = walksToOrder(state, robot) ? orderNeeds(state, robot.item) : 0;
  const stock = state.stockpiles[robot.id] ?? 0;
  if (robot.carry > 0) {
    robot.dropOff = need > 0 ? "order" : "stockpile";
    robot.phase = robot.dropOff === "stockpile" && stock >= ROBOT.stockpileCapacity ? "parked" : "toDropOff";
    return;
  }
  if (need > 0 && stock > 0) robot.phase = "toStockpile";
  else if (need > 0 || stock < ROBOT.stockpileCapacity) robot.phase = "toDeposit";
  else robot.phase = "parked";
}

/** Hand one carried item over at the drop-off; returns false while it has to wait. */
function unloadOne(state: GameState, robot: RobotState, emit: Emit): boolean {
  const at = { x: robot.x, z: robot.z };
  if (robot.dropOff === "machine") {
    const def = state.planet.machines.find((m) => m.id === robot.machineId);
    const machine = def ? state.machines.get(def.id) : undefined;
    if (!def || !machine || !state.built.has(def.id) || machine.input >= machineStats(state, def).inputCapacity) return false;
    machine.input += 1;
    robot.carry -= 1;
    emit({ type: "fed", item: robot.item, machineId: def.id, to: def.inputPad, by: robot.id });
    return true;
  }
  if (robot.dropOff === "order") {
    if (!deliverToOrder(state, robot.item, at, robot.id, emit)) {
      robot.dropOff = "stockpile";
      robot.phase = "toDropOff";
      return false;
    }
    robot.carry -= 1;
    return true;
  }
  const stock = state.stockpiles[robot.id] ?? 0;
  if (stock >= ROBOT.stockpileCapacity) return false;
  state.stockpiles[robot.id] = stock + 1;
  robot.carry -= 1;
  emit({ type: "stockpiled", robotId: robot.id, item: robot.item, to: stockpileSpot(dockOf(state, robot)) });
  return true;
}

function updateRobot(state: GameState, robot: RobotState, dt: number, emit: Emit): void {
  const stage = state.stages[robot.id] ?? 0;
  const speed = robotSpeedFor(stage);
  const capacity = robotCapacityFor(stage);
  if (state.enabled[robot.id] === false && robot.phase !== "parked") robot.phase = "parked";

  switch (robot.phase) {
    case "parked": {
      const dock = dockOf(state, robot);
      walk(state, robot, dock, 0, speed, dt);
      robot.timer += dt;
      // Look for work twice a second rather than every tick.
      if (state.enabled[robot.id] !== false && robot.timer > 0.5) decide(state, robot);
      return;
    }
    case "toDeposit": {
      const deposit = state.deposits.find((d) => d.id === robot.depositId && d.amount > 0) ?? nearestMinableDeposit(state, robot.x, robot.z, robot.item, SEARCH_RANGE);
      if (!deposit) {
        if (robot.carry > 0) decide(state, robot);
        return;
      }
      robot.depositId = deposit.id;
      if (walk(state, robot, deposit, MINE_STANDOFF, speed, dt)) {
        robot.phase = "mining";
        robot.timer = 0;
      }
      return;
    }
    case "mining": {
      const deposit = state.deposits.find((d) => d.id === robot.depositId);
      if (!deposit || deposit.amount <= 0) {
        robot.depositId = null;
        if (robot.carry >= capacity) decide(state, robot);
        else robot.phase = "toDeposit";
        return;
      }
      robot.timer += dt;
      if (robot.timer < robotMineIntervalFor(stage)) return;
      robot.timer = 0;
      takeFromDeposit(deposit);
      robot.carry += 1;
      emit({ type: "mined", item: deposit.item, from: deposit, robotId: robot.id });
      if (robot.carry >= capacity) decide(state, robot);
      return;
    }
    case "toDropOff": {
      if (robot.dropOff === "order" && orderNeeds(state, robot.item) <= 0) robot.dropOff = robot.machineId ? "machine" : "stockpile";
      if (walk(state, robot, dropOffPoint(state, robot), DROP_STANDOFF, speed, dt)) {
        robot.phase = "unloading";
        robot.timer = 0;
      }
      return;
    }
    case "unloading": {
      if (robot.carry <= 0) {
        decide(state, robot);
        return;
      }
      robot.timer += dt;
      if (robot.timer < ROBOT.unloadInterval) return;
      if (unloadOne(state, robot, emit)) robot.timer = 0;
      return;
    }
    case "toStockpile": {
      if (walk(state, robot, stockpileSpot(dockOf(state, robot)), DROP_STANDOFF, speed, dt)) {
        robot.phase = "loading";
        robot.timer = 0;
      }
      return;
    }
    case "loading": {
      const stock = state.stockpiles[robot.id] ?? 0;
      const wanted = Math.min(capacity, orderNeeds(state, robot.item));
      if (stock <= 0 || robot.carry >= wanted) {
        decide(state, robot);
        return;
      }
      robot.timer += dt;
      if (robot.timer < ROBOT.unloadInterval) return;
      robot.timer = 0;
      state.stockpiles[robot.id] = stock - 1;
      robot.carry += 1;
    }
  }
}

export function updateRobots(state: GameState, dt: number, emit: Emit): void {
  syncRobots(state);
  for (const robot of state.robots) updateRobot(state, robot, dt, emit);
}

export function setWorkerEnabled(state: GameState, id: string, enabled: boolean): void {
  if (!(id in state.enabled)) return;
  state.enabled[id] = enabled;
}

export function isWorkerEnabled(state: GameState, id: string): boolean {
  return state.enabled[id] !== false;
}
