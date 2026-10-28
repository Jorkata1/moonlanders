import { DEPOSIT, ITEM_IDS, MAX_STAGE, ROBOT, SUIT_UPGRADES, SUIT_UPGRADE_IDS, oxygenFor, type ItemId, type SuitUpgradeId } from "../config";
import { PLANETS, planetById } from "../planets";
import type { PlanetDef } from "../planets/types";
import { orderCost } from "./orders";
import { buildDef, createState, fieldKey, zeroItems, type GameState, type OrderKind } from "./state";

/** Version 3 is the materials economy; older saves (credits and Zix) start a fresh game. */
const SAVE_VERSION = 3;
const ORDER_KINDS: readonly OrderKind[] = ["build", "suit", "stage"];

/** What survives a reload. Positions, carried items and hazards reset to keep saves simple and fair. */
export interface SaveData {
  version: number;
  planetId: string;
  built: string[];
  order: { kind: OrderKind; targetId: string; delivered: Record<ItemId, number> } | null;
  suit: Record<SuitUpgradeId, number>;
  stages: Record<string, number>;
  enabled: Record<string, boolean>;
  stockpiles: Record<string, number>;
  machines: Record<string, { input: number; output: number; processed: number }>;
  boring: number | null;
  mined: Record<ItemId, number>;
  objectiveIndex: number;
  launched: boolean;
}

export function toSave(state: GameState): SaveData {
  return {
    version: SAVE_VERSION,
    planetId: state.planet.id,
    built: [...state.built],
    order: state.order ? { kind: state.order.kind, targetId: state.order.targetId, delivered: { ...state.order.delivered } } : null,
    suit: { ...state.suit },
    stages: { ...state.stages },
    enabled: { ...state.enabled },
    stockpiles: { ...state.stockpiles },
    machines: Object.fromEntries([...state.machines.values()].map((m) => [m.id, { input: m.input, output: m.output, processed: m.processed }])),
    boring: state.boring,
    mined: { ...state.stats.mined },
    objectiveIndex: state.objectiveIndex,
    launched: state.launched,
  };
}

function count(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.min(max, Math.floor(value)) : 0;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function restoreOrder(state: GameState, raw: unknown): void {
  const data = record(raw);
  const kind = ORDER_KINDS.find((k) => k === data.kind);
  const targetId = typeof data.targetId === "string" ? data.targetId : null;
  if (!kind || !targetId) {
    state.order = null;
    return;
  }
  const valid =
    (kind === "build" && buildDef(state.planet, targetId) !== undefined && !state.built.has(targetId)) ||
    (kind === "suit" && (SUIT_UPGRADE_IDS as readonly string[]).includes(targetId)) ||
    (kind === "stage" && state.built.has(targetId) && targetId in state.stages);
  if (!valid) {
    state.order = null;
    return;
  }
  state.order = { kind, targetId, delivered: zeroItems() };
  const cost = orderCost(state, state.order);
  const delivered = record(data.delivered);
  for (const item of ITEM_IDS) state.order.delivered[item] = count(delivered[item], cost[item] ?? 0);
}

/** Rebuild a game from untrusted saved JSON, ignoring anything malformed or unknown. */
export function fromSave(planet: PlanetDef, raw: unknown): GameState {
  const state = createState(planet);
  const data = record(raw);
  if (data.planetId !== planet.id || data.version !== SAVE_VERSION) return state;

  const known = new Set([...planet.builds.map((b) => b.id), planet.ridge.openId]);
  if (Array.isArray(data.built)) for (const id of data.built) if (typeof id === "string" && known.has(id)) state.built.add(id);
  // Fields hidden at the start (iron) are on the map once their zone is built.
  for (const deposit of planet.deposits) {
    if (deposit.hidden && deposit.zone && state.built.has(deposit.zone)) state.deposits.push({ ...deposit, field: fieldKey(deposit.item, deposit.zone), amount: DEPOSIT.amount, maxAmount: DEPOSIT.amount, rubble: 0 });
  }
  restoreOrder(state, data.order);
  const suit = record(data.suit);
  for (const id of SUIT_UPGRADE_IDS) state.suit[id] = count(suit[id], SUIT_UPGRADES[id].costs.length);
  const stages = record(data.stages);
  for (const id of Object.keys(state.stages)) state.stages[id] = count(stages[id], MAX_STAGE);
  const enabled = record(data.enabled);
  for (const id of Object.keys(state.enabled)) if (typeof enabled[id] === "boolean") state.enabled[id] = enabled[id] as boolean;
  const stockpiles = record(data.stockpiles);
  for (const id of Object.keys(state.stockpiles)) state.stockpiles[id] = count(stockpiles[id], ROBOT.stockpileCapacity);
  const machines = record(data.machines);
  for (const machine of state.machines.values()) {
    const def = planet.machines.find((m) => m.id === machine.id);
    const top = def?.levels[def.levels.length - 1];
    const saved = record(machines[machine.id]);
    machine.input = count(saved.input, top?.inputCapacity ?? 0);
    machine.output = count(saved.output, top?.outputCapacity ?? 0);
    machine.processed = count(saved.processed);
  }
  if (state.built.has(planet.ridge.openId)) state.boring = 1;
  else if (typeof data.boring === "number" && planet.builds.some((b) => b.kind === "drill" && state.built.has(b.id))) state.boring = Math.min(0.99, count(data.boring * 100) / 100);
  const mined = record(data.mined);
  for (const item of ITEM_IDS) state.stats.mined[item] = count(mined[item]);
  state.objectiveIndex = count(data.objectiveIndex, planet.objectives.length);
  state.launched = data.launched === true;
  state.player.oxygen = oxygenFor(state.suit.oxygen);
  return state;
}

/** Rebuild a game on whichever planet the save was made, falling back to the first planet. */
export function restoreGame(raw: unknown): GameState {
  const planet = planetById(record(raw).planetId) ?? PLANETS[0];
  if (!planet) throw new Error("No planets defined");
  return fromSave(planet, raw);
}
