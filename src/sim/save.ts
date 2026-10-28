import { DRONE_UPGRADES, DRONE_UPGRADE_IDS, ITEM_IDS, MACHINE, ROBOT_UPGRADES, ROBOT_UPGRADE_IDS, UPGRADES, UPGRADE_IDS, oxygenFor, type DroneUpgradeId, type ItemId, type RobotUpgradeId, type UpgradeId } from "../config";
import { PLANETS, planetById } from "../planets";
import type { PlanetDef } from "../planets/types";
import { createState, type GameState } from "./state";

const SAVE_VERSION = 2;

/** What survives a reload. Positions, carried items and hazards reset to keep saves simple and fair. */
export interface SaveData {
  version: number;
  planetId: string;
  credits: number;
  unlocked: string[];
  paid: Record<string, number>;
  upgrades: Record<UpgradeId, number>;
  robotUpgrades: Record<string, Record<RobotUpgradeId, number>>;
  /** Added in 1.3; older saves simply have no drones. */
  droneUpgrades?: Record<string, Record<DroneUpgradeId, number>>;
  droneEnabled?: Record<string, boolean>;
  rocket: Record<ItemId, number>;
  machines: Record<string, { input: number; secondInput: number; output: number; processed: number }>;
  mined: Record<ItemId, number>;
  earned: number;
  objectiveIndex: number;
  launched: boolean;
}

export function toSave(state: GameState): SaveData {
  return {
    version: SAVE_VERSION,
    planetId: state.planet.id,
    credits: state.credits,
    unlocked: [...state.unlocked],
    paid: Object.fromEntries(state.paid),
    upgrades: { ...state.upgrades },
    robotUpgrades: JSON.parse(JSON.stringify(state.robotUpgrades)) as Record<string, Record<RobotUpgradeId, number>>,
    droneUpgrades: JSON.parse(JSON.stringify(state.droneUpgrades)) as Record<string, Record<DroneUpgradeId, number>>,
    droneEnabled: { ...state.droneEnabled },
    rocket: { ...state.rocket },
    machines: Object.fromEntries([...state.machines.values()].map((m) => [m.id, { input: m.input, secondInput: m.secondInput, output: m.output, processed: m.processed }])),
    mined: { ...state.stats.mined },
    earned: state.stats.earned,
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

/** Rebuild a game from untrusted saved JSON, ignoring anything malformed or unknown. */
export function fromSave(planet: PlanetDef, raw: unknown): GameState {
  const state = createState(planet);
  const data = record(raw);
  if (data.planetId !== planet.id) return state;

  const knownUnlocks = new Set(planet.unlocks.map((u) => u.id));
  state.credits = count(data.credits);
  if (Array.isArray(data.unlocked)) for (const id of data.unlocked) if (typeof id === "string" && knownUnlocks.has(id)) state.unlocked.add(id);
  for (const [id, paid] of Object.entries(record(data.paid))) {
    const unlock = planet.unlocks.find((u) => u.id === id);
    if (unlock && !state.unlocked.has(id)) state.paid.set(id, count(paid, unlock.cost - 1));
  }
  const upgrades = record(data.upgrades);
  for (const id of UPGRADE_IDS) state.upgrades[id] = count(upgrades[id], UPGRADES[id].costs.length);
  const robotUpgrades = record(data.robotUpgrades);
  for (const [robotId, levels] of Object.entries(state.robotUpgrades)) {
    const saved = record(robotUpgrades[robotId]);
    for (const id of ROBOT_UPGRADE_IDS) levels[id] = count(saved[id], ROBOT_UPGRADES[id].costs.length);
  }
  const droneUpgrades = record(data.droneUpgrades);
  const droneEnabled = record(data.droneEnabled);
  for (const [droneId, levels] of Object.entries(state.droneUpgrades)) {
    const saved = record(droneUpgrades[droneId]);
    for (const id of DRONE_UPGRADE_IDS) levels[id] = count(saved[id], DRONE_UPGRADES[id].costs.length);
    if (typeof droneEnabled[droneId] === "boolean") state.droneEnabled[droneId] = droneEnabled[droneId] as boolean;
  }
  const rocket = record(data.rocket);
  const mined = record(data.mined);
  for (const item of ITEM_IDS) {
    state.rocket[item] = count(rocket[item], planet.rocket.parts[item] ?? 0);
    state.stats.mined[item] = count(mined[item]);
  }
  const machines = record(data.machines);
  for (const machine of state.machines.values()) {
    const saved = record(machines[machine.id]);
    machine.input = count(saved.input, MACHINE.inputCapacity);
    machine.secondInput = count(saved.secondInput, MACHINE.inputCapacity);
    machine.output = count(saved.output, MACHINE.outputCapacity);
    machine.processed = count(saved.processed);
  }
  state.stats.earned = count(data.earned);
  state.objectiveIndex = count(data.objectiveIndex, planet.objectives.length);
  state.launched = data.launched === true;
  state.player.oxygen = oxygenFor(state.upgrades.oxygen);
  return state;
}

/** Rebuild a game on whichever planet the save was made, falling back to the first planet. */
export function restoreGame(raw: unknown): GameState {
  const planet = planetById(record(raw).planetId) ?? PLANETS[0];
  if (!planet) throw new Error("No planets defined");
  return fromSave(planet, raw);
}
