import { ITEM_IDS, MAX_STAGE, PADS, STAGE_BONUS, STAGE_COSTS, SUIT_UPGRADES, SUIT_UPGRADE_IDS, type ItemId, type MaterialCost, type SuitUpgradeId } from "./config";
import type { BuildDef } from "./planets/types";
import type { Emit } from "./sim/events";
import { buildLock, isBuildAvailable, orderLabel, startBuild, startStageUpgrade, startSuitUpgrade, type OrderResult } from "./sim/orders";
import { isWorkerEnabled, setWorkerEnabled } from "./sim/robots";
import { distance, workerBuilds, type GameState } from "./sim/state";
import { SUIT_ICONS, buildIcon, type UpgradeIcon } from "./upgradeIcons";

export type CardState = "ready" | "active" | "busy" | "locked" | "maxed";

export interface PanelCard {
  /** What pressing it orders: a build id, a suit upgrade id, or "stage". */
  id: string;
  icon: UpgradeIcon;
  name: string;
  description: string;
  /** Upgrade levels, when the card has them. */
  level?: { current: number; max: number };
  cost: ReadonlyArray<{ item: ItemId; amount: number }>;
  state: CardState;
  /** Why it is locked or busy, or what to do while it is the active order. */
  note?: string;
}

export interface UpgradePanel {
  /** "workbench", "suit", or the robot/drone id whose dock you stand on. */
  key: string;
  title: string;
  cards: PanelCard[];
  /** On/off switch in the panel header, for robots and the drone. */
  toggle?: { on: boolean; label: string };
}

/** At most this many not-yet-available builds are shown, so players see what comes next. */
const LOCKED_PREVIEW = 2;

function costList(cost: MaterialCost): PanelCard["cost"] {
  return ITEM_IDS.filter((item) => (cost[item] ?? 0) > 0).map((item) => ({ item, amount: cost[item] ?? 0 }));
}

/** Ready, the active order, or waiting for another order to finish. */
function orderState(state: GameState, kind: "build" | "suit" | "stage", targetId: string): Pick<PanelCard, "state" | "note"> {
  const order = state.order;
  if (!order) return { state: "ready" };
  if (order.kind === kind && order.targetId === targetId) return { state: "active", note: "Bring the materials to the hologram" };
  return { state: "busy", note: `Finish the ${orderLabel(state, order)} first` };
}

function buildCard(state: GameState, build: BuildDef): PanelCard {
  const base = { id: build.id, icon: buildIcon(build.kind, build.machineId), name: build.label, description: build.description, cost: costList(build.cost) };
  const lock = buildLock(state, build);
  return lock ? { ...base, state: "locked", note: lock } : { ...base, ...orderState(state, "build", build.id) };
}

function workbenchPanel(state: GameState): UpgradePanel {
  const open = state.planet.builds.filter((b) => b.kind !== "workbench" && !state.built.has(b.id));
  const available = open.filter((b) => isBuildAvailable(state, b));
  const locked = open.filter((b) => !isBuildAvailable(state, b)).slice(0, LOCKED_PREVIEW);
  return { key: "workbench", title: "Workbench", cards: [...available, ...locked].map((b) => buildCard(state, b)) };
}

function suitPanel(state: GameState): UpgradePanel {
  const cards = SUIT_UPGRADE_IDS.map((id): PanelCard => {
    const def = SUIT_UPGRADES[id];
    const level = state.suit[id];
    const next = def.costs[level];
    const base = { id, icon: SUIT_ICONS[id], name: def.name, level: { current: level, max: def.costs.length } };
    if (!next) return { ...base, description: "Fully upgraded", cost: [], state: "maxed" };
    return { ...base, description: def.effects[level] ?? "", cost: costList(next), ...orderState(state, "suit", id) };
  });
  return { key: "suit", title: "Suit station", cards };
}

function workerPanel(state: GameState, build: BuildDef): UpgradePanel {
  const stage = state.stages[build.id] ?? 0;
  const on = isWorkerEnabled(state, build.id);
  const toggle = { on, label: on ? "Working" : "Off" };
  const base = { id: "stage", icon: "stage" as const, name: `Stage ${Math.min(stage + 1, MAX_STAGE)}`, level: { current: stage, max: MAX_STAGE } };
  const next = STAGE_COSTS[stage];
  const card: PanelCard = next
    ? { ...base, description: `+${Math.round((STAGE_BONUS[stage + 1] ?? 0) * 100)}% speed, mining and carry`, cost: costList(next), ...orderState(state, "stage", build.id) }
    : { ...base, description: "Fully upgraded", cost: [], state: "maxed" };
  return { key: build.id, title: build.label, cards: [card], toggle };
}

/** The panel for wherever the player stands: the workbench, the suit station, a robot's dock, or nothing. */
export function activePanel(state: GameState): UpgradePanel | null {
  const { planet, player } = state;
  if (state.built.has("workbench") && distance(player, planet.workbench.pad) <= PADS.radius) return workbenchPanel(state);
  if (distance(player, planet.suitStation.pad) <= PADS.radius) return suitPanel(state);
  const dock = workerBuilds(planet).find((b) => state.built.has(b.id) && distance(player, b) <= PADS.radius);
  return dock ? workerPanel(state, dock) : null;
}

/** Switch a robot or the drone on or off from its panel. */
export function toggleFromPanel(state: GameState, key: string): void {
  setWorkerEnabled(state, key, !isWorkerEnabled(state, key));
}

/** Place the order a card stands for. */
export function orderFromPanel(state: GameState, key: string, id: string, emit: Emit): OrderResult {
  if (key === "workbench") return startBuild(state, id, emit);
  if (key === "suit") return (SUIT_UPGRADE_IDS as readonly string[]).includes(id) ? startSuitUpgrade(state, id as SuitUpgradeId, emit) : { ok: false, reason: "Unknown upgrade" };
  return startStageUpgrade(state, key, emit);
}
