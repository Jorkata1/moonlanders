import { MACHINE, ROBOT, robotCapacityFor, robotMineIntervalFor, robotSpeedFor } from "../config";
import type { MachineDef, Point } from "../planets/types";
import type { Emit } from "./events";
import { nearestMinableDeposit } from "./economy";
import { takeFromDeposit } from "./orefall";
import type { GameState, RobotState } from "./state";

const ARRIVE_DISTANCE = 0.15;
const ROBOT_SEARCH_RANGE = 80;
const MINE_STANDOFF = 1.1;

function machineFor(state: GameState, robot: RobotState): MachineDef {
  const def = state.planet.machines.find((m) => m.id === robot.machineId);
  if (!def) throw new Error(`Robot ${robot.id} serves unknown machine ${robot.machineId}`);
  return def;
}

/** Spawn robots for robot unlocks that have been bought but have no robot yet. */
export function syncRobots(state: GameState): void {
  for (const unlock of state.planet.unlocks) {
    if (unlock.kind !== "robot" || !unlock.machineId || !state.unlocked.has(unlock.id)) continue;
    if (state.robots.some((r) => r.id === unlock.id)) continue;
    state.robots.push({ id: unlock.id, machineId: unlock.machineId, x: unlock.x, z: unlock.z, heading: 0, carry: 0, phase: "toDeposit", depositId: null, timer: 0 });
  }
}

function levelsOf(state: GameState, robot: RobotState) {
  return state.robotUpgrades[robot.id] ?? { speed: 0, capacity: 0, mining: 0 };
}

/** Move toward a target; returns true once close enough. */
function stepToward(robot: RobotState, target: Point, stopDistance: number, speed: number, dt: number): boolean {
  const dx = target.x - robot.x;
  const dz = target.z - robot.z;
  const remaining = Math.hypot(dx, dz) - stopDistance;
  if (remaining <= ARRIVE_DISTANCE) return true;
  const step = Math.min(remaining, speed * dt);
  robot.x += (dx / Math.hypot(dx, dz)) * step;
  robot.z += (dz / Math.hypot(dx, dz)) * step;
  robot.heading = Math.atan2(dx, dz);
  return false;
}

function updateRobot(state: GameState, robot: RobotState, dt: number, emit: Emit): void {
  const def = machineFor(state, robot);
  const machine = state.machines.get(def.id);
  if (!machine) return;
  const levels = levelsOf(state, robot);
  const speed = robotSpeedFor(levels.speed);
  const capacity = robotCapacityFor(levels.capacity);

  switch (robot.phase) {
    case "toDeposit": {
      const deposit = state.deposits.find((d) => d.id === robot.depositId && d.amount > 0) ?? nearestMinableDeposit(state, robot.x, robot.z, def.input, ROBOT_SEARCH_RANGE);
      if (!deposit) {
        if (robot.carry > 0) robot.phase = "toMachine";
        return;
      }
      robot.depositId = deposit.id;
      if (stepToward(robot, deposit, MINE_STANDOFF, speed, dt)) {
        robot.phase = "mining";
        robot.timer = 0;
      }
      return;
    }
    case "mining": {
      const deposit = state.deposits.find((d) => d.id === robot.depositId);
      if (!deposit || deposit.amount <= 0) {
        robot.depositId = null;
        robot.phase = robot.carry >= capacity ? "toMachine" : "toDeposit";
        return;
      }
      robot.timer += dt;
      if (robot.timer < robotMineIntervalFor(levels.mining)) return;
      robot.timer = 0;
      takeFromDeposit(deposit);
      robot.carry += 1;
      emit({ type: "mined", item: deposit.item, from: deposit, robotId: robot.id });
      if (robot.carry >= capacity) robot.phase = "toMachine";
      return;
    }
    case "toMachine": {
      if (stepToward(robot, def.inputPad, 0, speed, dt)) {
        robot.phase = "unloading";
        robot.timer = 0;
      }
      return;
    }
    case "unloading": {
      if (robot.carry <= 0) {
        robot.phase = "toDeposit";
        return;
      }
      if (machine.input >= MACHINE.inputCapacity) return; // wait for room
      robot.timer += dt;
      if (robot.timer < ROBOT.unloadInterval) return;
      robot.timer = 0;
      robot.carry -= 1;
      machine.input += 1;
      emit({ type: "robotUnloaded", robotId: robot.id, item: def.input, to: def.inputPad, machineId: def.id });
    }
  }
}

export function updateRobots(state: GameState, dt: number, emit: Emit): void {
  syncRobots(state);
  for (const robot of state.robots) {
    if (!state.unlocked.has(robot.machineId)) continue;
    updateRobot(state, robot, dt, emit);
  }
}
