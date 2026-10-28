import { ITEM_IDS, MAX_STAGE, STAGE_COSTS, SUIT_UPGRADES, type ItemId, type MaterialCost, type SuitUpgradeId } from "../config";
import type { BuildDef, Point } from "../planets/types";
import type { Emit } from "./events";
import { buildDef, zeroItems, type GameState, type OrderKind, type OrderState } from "./state";

export type OrderResult = { ok: true } | { ok: false; reason: string };

export interface MaterialProgress {
  readonly item: ItemId;
  readonly needed: number;
  readonly delivered: number;
}

const NO_COST: MaterialCost = {};

/** What an order costs in total. */
export function orderCost(state: GameState, order: OrderState): MaterialCost {
  switch (order.kind) {
    case "build":
      return buildDef(state.planet, order.targetId)?.cost ?? NO_COST;
    case "suit":
      return SUIT_UPGRADES[order.targetId as SuitUpgradeId]?.costs[state.suit[order.targetId as SuitUpgradeId]] ?? NO_COST;
    case "stage":
      return STAGE_COSTS[state.stages[order.targetId] ?? MAX_STAGE] ?? NO_COST;
  }
}

/** Where the order's hologram collects materials. */
export function orderSite(state: GameState, order: OrderState): Point {
  if (order.kind === "suit") return state.planet.suitStation.pad;
  return buildDef(state.planet, order.targetId)?.site ?? state.planet.workbench.pad;
}

export function orderLabel(state: GameState, order: OrderState): string {
  switch (order.kind) {
    case "build":
      return buildDef(state.planet, order.targetId)?.label ?? order.targetId;
    case "suit": {
      const id = order.targetId as SuitUpgradeId;
      return `${SUIT_UPGRADES[id].name} level ${state.suit[id] + 1}`;
    }
    case "stage":
      return `${buildDef(state.planet, order.targetId)?.label ?? order.targetId} stage ${(state.stages[order.targetId] ?? 0) + 1}`;
  }
}

/** Every material of the active order with how much has arrived. */
export function orderProgress(state: GameState): MaterialProgress[] {
  const order = state.order;
  if (!order) return [];
  const cost = orderCost(state, order);
  return ITEM_IDS.filter((item) => (cost[item] ?? 0) > 0).map((item) => ({ item, needed: cost[item] ?? 0, delivered: order.delivered[item] }));
}

/** How many more of `item` the active order still needs. */
export function orderNeeds(state: GameState, item: ItemId): number {
  const order = state.order;
  if (!order) return 0;
  return Math.max(0, (orderCost(state, order)[item] ?? 0) - order.delivered[item]);
}

export function isBuildAvailable(state: GameState, build: BuildDef): boolean {
  return !state.built.has(build.id) && build.requires.every((id) => state.built.has(id));
}

/** Why a build cannot be ordered yet, or null when it can (or is already built). */
export function buildLock(state: GameState, build: BuildDef): string | null {
  const missing = build.requires.filter((id) => !state.built.has(id));
  if (missing.length === 0) return null;
  const names = missing.map((id) => (id === state.planet.ridge.openId ? "a way through the ridge" : (buildDef(state.planet, id)?.label ?? id)));
  return `Requires ${names.join(" and ")}`;
}

function busy(state: GameState): OrderResult | null {
  return state.order ? { ok: false, reason: `Finish the ${orderLabel(state, state.order)} first` } : null;
}

function start(state: GameState, kind: OrderKind, targetId: string, emit: Emit): OrderResult {
  state.order = { kind, targetId, delivered: zeroItems() };
  emit({ type: "orderStarted", kind, targetId });
  return { ok: true };
}

export function startBuild(state: GameState, id: string, emit: Emit): OrderResult {
  const build = buildDef(state.planet, id);
  if (!build) return { ok: false, reason: "Unknown build" };
  if (state.built.has(id)) return { ok: false, reason: "Already built" };
  const lock = buildLock(state, build);
  if (lock) return { ok: false, reason: lock };
  return busy(state) ?? start(state, "build", id, emit);
}

export function startSuitUpgrade(state: GameState, id: SuitUpgradeId, emit: Emit): OrderResult {
  if (SUIT_UPGRADES[id].costs[state.suit[id]] === undefined) return { ok: false, reason: "Already at max level" };
  return busy(state) ?? start(state, "suit", id, emit);
}

export function startStageUpgrade(state: GameState, workerId: string, emit: Emit): OrderResult {
  if (!state.built.has(workerId)) return { ok: false, reason: "Build it first" };
  if ((state.stages[workerId] ?? MAX_STAGE) >= MAX_STAGE) return { ok: false, reason: "Already at the last stage" };
  return busy(state) ?? start(state, "stage", workerId, emit);
}

function complete(state: GameState, order: OrderState, emit: Emit): void {
  state.order = null;
  switch (order.kind) {
    case "build": {
      state.built.add(order.targetId);
      if (buildDef(state.planet, order.targetId)?.kind === "drill") state.boring = 0;
      break;
    }
    case "suit":
      state.suit[order.targetId as SuitUpgradeId] += 1;
      break;
    case "stage":
      state.stages[order.targetId] = (state.stages[order.targetId] ?? 0) + 1;
  }
  emit({ type: "orderComplete", kind: order.kind, targetId: order.targetId, at: orderSite(state, order) });
}

/**
 * Hand one `item` to the active order. `by` is the robot or drone id, or null for the player.
 * Returns false when the order doesn't need it.
 */
export function deliverToOrder(state: GameState, item: ItemId, from: Point, by: string | null, emit: Emit): boolean {
  const order = state.order;
  if (!order || orderNeeds(state, item) <= 0) return false;
  order.delivered[item] += 1;
  emit({ type: "orderDelivered", item, from, to: orderSite(state, order), by });
  if (orderProgress(state).every((m) => m.delivered >= m.needed)) complete(state, order, emit);
  return true;
}
