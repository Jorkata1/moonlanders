import { ROBOT, robotCapacityFor, robotMineIntervalFor, robotSpeedFor } from "../config";
import type { BuildDef, Point } from "../planets/types";
import { nearestMinableDeposit } from "./economy";
import type { Emit } from "./events";
import { routeToward } from "./movement";
import { takeFromDeposit } from "./orefall";
import { buildDef, stockpileSpot, type GameState, type RobotState } from "./state";

const ARRIVE_DISTANCE = 0.15;
const SEARCH_RANGE = 80;
const MINE_STANDOFF = 1.1;
/** Robots stand just beside their stockpile, not on top of it. */
const DROP_STANDOFF = 0.6;
/** Parked robots look for work twice a second rather than every tick. */
const PARKED_CHECK_SECONDS = 0.5;

/** Spawn a robot on its dock for every robot build that is finished. */
function syncRobots(state: GameState): void {
  for (const build of state.planet.builds) {
    if (build.kind !== "robot" || !build.item || !state.built.has(build.id)) continue;
    if (state.robots.some((r) => r.id === build.id)) continue;
    state.robots.push({ id: build.id, item: build.item, x: build.x, z: build.z, heading: 0, carry: 0, phase: "parked", depositId: null, timer: 0 });
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

function stockpileFull(state: GameState, robot: RobotState): boolean {
  return (state.stockpiles[robot.id] ?? 0) >= ROBOT.stockpileCapacity;
}

/** Robots only mine and stack: carry a load home, or go mine while the stockpile has room. */
function decide(state: GameState, robot: RobotState): void {
  robot.timer = 0;
  if (state.enabled[robot.id] === false) robot.phase = "parked";
  else if (robot.carry > 0) robot.phase = stockpileFull(state, robot) ? "parked" : "toDropOff";
  else robot.phase = stockpileFull(state, robot) ? "parked" : "toDeposit";
}

function updateRobot(state: GameState, robot: RobotState, dt: number, emit: Emit): void {
  const stage = state.stages[robot.id] ?? 0;
  const speed = robotSpeedFor(stage);
  const capacity = robotCapacityFor(stage);
  if (state.enabled[robot.id] === false && robot.phase !== "parked") robot.phase = "parked";

  switch (robot.phase) {
    case "parked": {
      walk(state, robot, dockOf(state, robot), 0, speed, dt);
      robot.timer += dt;
      if (state.enabled[robot.id] !== false && robot.timer > PARKED_CHECK_SECONDS) decide(state, robot);
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
      if (walk(state, robot, stockpileSpot(dockOf(state, robot)), DROP_STANDOFF, speed, dt)) {
        robot.phase = "unloading";
        robot.timer = 0;
      }
      return;
    }
    case "unloading": {
      if (robot.carry <= 0 || stockpileFull(state, robot)) {
        decide(state, robot);
        return;
      }
      robot.timer += dt;
      if (robot.timer < ROBOT.unloadInterval) return;
      robot.timer = 0;
      state.stockpiles[robot.id] = (state.stockpiles[robot.id] ?? 0) + 1;
      robot.carry -= 1;
      emit({ type: "stockpiled", robotId: robot.id, item: robot.item, to: stockpileSpot(dockOf(state, robot)) });
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
