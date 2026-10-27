import { BOOST, DEPOSIT, ITEMS, MACHINE, PADS, PLAYER, UPGRADES, capacityFor, mineIntervalFor, type ItemId, type UpgradeId } from "../config";
import type { MachineDef, UnlockDef } from "../planets/types";
import type { Emit } from "./events";
import { distance, isAvailable, rocketComplete, rocketNeeds, type DepositState, type GameState } from "./state";

export function boostFactor(state: GameState): number {
  return state.boostSeconds > 0 ? BOOST.multiplier : 1;
}

export function carryCapacity(state: GameState): number {
  return capacityFor(state.upgrades.capacity);
}

export function isPadAvailable(state: GameState, unlock: UnlockDef): boolean {
  return !state.unlocked.has(unlock.id) && unlock.requires.every((id) => state.unlocked.has(id));
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

export function takeFromDeposit(state: GameState, deposit: DepositState): void {
  deposit.amount -= 1;
  if (deposit.amount <= 0 && !deposit.temporary) deposit.regrowTimer = DEPOSIT.regrowSeconds;
}

export function updateDeposits(state: GameState, dt: number): void {
  for (const deposit of state.deposits) {
    if (deposit.temporary) {
      deposit.lifetime -= dt;
      continue;
    }
    if (deposit.amount > 0) continue;
    deposit.regrowTimer -= dt;
    if (deposit.regrowTimer <= 0) deposit.amount = deposit.maxAmount;
  }
  state.deposits = state.deposits.filter((d) => !d.temporary || (d.amount > 0 && d.lifetime > 0));
}

export function updatePlayerMining(state: GameState, dt: number, emit: Emit): void {
  const player = state.player;
  player.miningTarget = null;
  if (player.stunned > 0) return;
  const target = nearestMinableDeposit(state, player.x, player.z, null, PLAYER.mineRange);
  if (!target) {
    player.mineTimer = 0;
    return;
  }
  if (player.carry.length >= carryCapacity(state)) {
    if (player.mineTimer >= 0) emit({ type: "backpackFull" });
    player.mineTimer = -1; // emit once until something changes
    return;
  }
  if (player.mineTimer < 0) player.mineTimer = 0;
  player.miningTarget = target.id;
  player.mineTimer += dt * boostFactor(state);
  const interval = mineIntervalFor(state.upgrades.mining);
  while (player.mineTimer >= interval && target.amount > 0 && player.carry.length < carryCapacity(state)) {
    player.mineTimer -= interval;
    takeFromDeposit(state, target);
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
    if (!state.unlocked.has(machine.id)) continue;
    const def = machineDef(state, machine.id);
    if (machine.progress === null) {
      if (machine.input <= 0 || machine.output >= MACHINE.outputCapacity) continue;
      machine.input -= 1;
      machine.progress = 0;
    }
    machine.progress += (dt * boostFactor(state)) / def.secondsPerItem;
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

/** One transfer action per tick: sell, feed a machine, collect output or load the rocket. */
function transferOnce(state: GameState, emit: Emit): boolean {
  const player = state.player;
  const planet = state.planet;
  const onPad = (p: { x: number; z: number }) => distance(player, p) <= PADS.radius;

  if (onPad(planet.sellPad) && player.carry.length > 0) {
    const item = player.carry.pop() as ItemId;
    const credits = ITEMS[item].sellPrice;
    state.credits += credits;
    state.stats.earned += credits;
    emit({ type: "sold", item, credits });
    return true;
  }

  for (const def of planet.machines) {
    if (!state.unlocked.has(def.id)) continue;
    const machine = state.machines.get(def.id);
    if (!machine) continue;
    if (onPad(def.inputPad) && machine.input < MACHINE.inputCapacity) {
      const index = topIndex(player.carry, (item) => item === def.input);
      if (index >= 0) {
        player.carry.splice(index, 1);
        machine.input += 1;
        emit({ type: "delivered", item: def.input, to: def });
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

  if (state.unlocked.has(planet.ridge.unlockId) && onPad(planet.rocket.pad)) {
    const index = topIndex(player.carry, (item) => rocketNeeds(state, item) > 0);
    if (index >= 0) {
      const item = player.carry.splice(index, 1)[0] as ItemId;
      state.rocket[item] += 1;
      emit({ type: "delivered", item, to: planet.rocket });
      if (rocketComplete(state)) emit({ type: "rocketComplete" });
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

export function updatePayPads(state: GameState, dt: number, emit: Emit): void {
  const player = state.player;
  const unlock = player.stunned > 0 ? undefined : state.planet.unlocks.find((u) => isPadAvailable(state, u) && distance(player, u) <= PADS.radius);
  if (!unlock || state.credits <= 0) {
    state.payAccumulator = 0;
    return;
  }
  const paid = state.paid.get(unlock.id) ?? 0;
  const rate = Math.max(PADS.minPayPerSecond, unlock.cost / PADS.paySeconds);
  state.payAccumulator += rate * dt;
  const whole = Math.floor(state.payAccumulator);
  if (whole < 1) return;
  state.payAccumulator -= whole;
  const amount = Math.min(state.credits, unlock.cost - paid, whole);
  state.credits -= amount;
  state.paid.set(unlock.id, paid + amount);
  emit({ type: "paying", padId: unlock.id });
  if (paid + amount < unlock.cost) return;
  state.unlocked.add(unlock.id);
  state.paid.delete(unlock.id);
  state.payAccumulator = 0;
  emit({ type: "unlocked", id: unlock.id });
}

export type UpgradeResult = { ok: true } | { ok: false; reason: string };

export function buyUpgrade(state: GameState, id: UpgradeId, emit: Emit): UpgradeResult {
  const level = state.upgrades[id];
  const cost = UPGRADES[id].costs[level];
  if (cost === undefined) return { ok: false, reason: "Already at max level" };
  if (state.credits < cost) return { ok: false, reason: `Needs ${cost - state.credits} more credits` };
  state.credits -= cost;
  state.upgrades[id] = level + 1;
  emit({ type: "upgraded", id, level: level + 1 });
  return { ok: true };
}
