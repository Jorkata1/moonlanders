import { BOOST, DEPOSIT, PADS, PLAYER, capacityFor, mineIntervalFor, type ItemId } from "../config";
import type { MachineDef, MachineLevel } from "../planets/types";
import type { Emit } from "./events";
import { takeFromDeposit } from "./orefall";
import { deliverToOrder, orderNeeds, orderSite } from "./orders";
import { distance, isAvailable, machineLevel, type DepositState, type GameState } from "./state";

export function boostFactor(state: GameState): number {
  return state.boostSeconds > 0 ? BOOST.multiplier : 1;
}

export function carryCapacity(state: GameState): number {
  return capacityFor(state.suit.capacity);
}

/** Capacities and speed of a machine at its current level. */
export function machineStats(state: GameState, def: MachineDef): MachineLevel {
  const levels = def.levels;
  return levels[Math.min(levels.length, machineLevel(state, def.id)) - 1] ?? (levels[0] as MachineLevel);
}

export function nearestMinableDeposit(state: GameState, x: number, z: number, item: ItemId | null, range: number): DepositState | null {
  let best: DepositState | null = null;
  let bestDistance = range;
  for (const deposit of state.deposits) {
    if (deposit.amount <= 0 || !isAvailable(state, deposit.zone)) continue;
    if (item !== null && deposit.item !== item) continue;
    const d = Math.hypot(deposit.x - x, deposit.z - z) - DEPOSIT.radius;
    if (d < bestDistance) {
      bestDistance = d;
      best = deposit;
    }
  }
  return best;
}

/** The drill warms up once per field (a short step away keeps it warm), then mines on a timer. */
export function updatePlayerMining(state: GameState, dt: number, emit: Emit): void {
  const player = state.player;
  player.miningTarget = null;
  if (player.stunned > 0) return;
  const target = nearestMinableDeposit(state, player.x, player.z, null, PLAYER.mineRange);
  if (!target) {
    player.mineTimer = 0;
    player.outOfReach += dt;
    if (player.outOfReach > PLAYER.warmupGraceSeconds) player.warmup = 0;
    return;
  }
  player.outOfReach = 0;
  if (player.carry.length >= carryCapacity(state)) {
    if (player.mineTimer >= 0) emit({ type: "backpackFull" });
    player.mineTimer = -1; // emit once until something changes
    return;
  }
  if (player.mineTimer < 0) player.mineTimer = 0;
  player.miningTarget = target.id;
  if (player.warmup < PLAYER.warmupSeconds) {
    player.warmup += dt;
    if (player.warmup >= PLAYER.warmupSeconds) emit({ type: "drillLocked", at: target });
    return;
  }
  player.mineTimer += dt * boostFactor(state);
  const interval = mineIntervalFor(state.suit.mining);
  while (player.mineTimer >= interval && target.amount > 0 && player.carry.length < carryCapacity(state)) {
    player.mineTimer -= interval;
    takeFromDeposit(target);
    player.carry.push(target.item);
    state.stats.mined[target.item] += 1;
    emit({ type: "mined", item: target.item, from: target, robotId: null });
  }
}

function machineDef(state: GameState, id: string): MachineDef {
  const def = state.planet.machines.find((m) => m.id === id);
  if (!def) throw new Error(`Unknown machine ${id}`);
  return def;
}

export function updateMachines(state: GameState, dt: number): void {
  for (const machine of state.machines.values()) {
    if (!state.built.has(machine.id)) continue;
    const def = machineDef(state, machine.id);
    const stats = machineStats(state, def);
    if (machine.progress === null) {
      if (machine.input < def.inputPerItem || machine.output >= stats.outputCapacity) continue;
      machine.input -= def.inputPerItem;
      machine.progress = 0;
    }
    machine.progress += (dt * boostFactor(state)) / stats.secondsPerItem;
    if (machine.progress >= 1) {
      machine.output += 1;
      machine.processed += 1;
      machine.progress = null;
    }
  }
}

/** Index of the topmost carried item matching the predicate, or -1. */
function topIndex(carry: readonly ItemId[], accept: (item: ItemId) => boolean): number {
  for (let i = carry.length - 1; i >= 0; i -= 1) if (accept(carry[i] as ItemId)) return i;
  return -1;
}

/** One transfer action per tick: hand materials to the order, feed a machine, or collect its output. */
function transferOnce(state: GameState, emit: Emit): boolean {
  const player = state.player;
  const onPad = (p: { x: number; z: number }) => distance(player, p) <= PADS.radius;

  if (state.order && onPad(orderSite(state, state.order))) {
    const index = topIndex(player.carry, (item) => orderNeeds(state, item) > 0);
    if (index >= 0) {
      const item = player.carry.splice(index, 1)[0] as ItemId;
      return deliverToOrder(state, item, player, null, emit);
    }
  }

  for (const def of state.planet.machines) {
    if (!state.built.has(def.id)) continue;
    const machine = state.machines.get(def.id);
    if (!machine) continue;
    const stats = machineStats(state, def);
    if (onPad(def.inputPad) && machine.input < stats.inputCapacity) {
      const index = topIndex(player.carry, (item) => item === def.input);
      if (index >= 0) {
        player.carry.splice(index, 1);
        machine.input += 1;
        emit({ type: "fed", item: def.input, machineId: def.id, to: def.inputPad, by: null });
        return true;
      }
    }
    if (onPad(def.outputPad) && machine.output > 0 && player.carry.length < carryCapacity(state)) {
      machine.output -= 1;
      player.carry.push(def.output);
      emit({ type: "pickedUp", item: def.output, from: def.outputPad });
      return true;
    }
  }
  return false;
}

export function updateTransfers(state: GameState, dt: number, emit: Emit): void {
  const player = state.player;
  if (player.stunned > 0) return;
  player.transferTimer += dt;
  let guard = 0;
  while (player.transferTimer >= PLAYER.transferInterval && guard < 8) {
    guard += 1;
    player.transferTimer -= PLAYER.transferInterval;
    if (!transferOnce(state, emit)) {
      player.transferTimer = Math.min(player.transferTimer, PLAYER.transferInterval);
      break;
    }
  }
}
