import { PLANETS } from '../config/planets';
import { isResourceId, type ResourceBag } from '../config/resources';
import { SAVE_VERSION, type GameState, type MachineState, type PlanetState } from './state';
import { SUIT_MAX_LEVEL, SUIT_STATS, type SuitLevels } from './suit';

const SAVE_KEY = 'moonlanders:save';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseBag(value: unknown): ResourceBag | null {
  if (!isRecord(value)) return null;
  const bag: ResourceBag = {};
  for (const [key, amount] of Object.entries(value)) {
    if (!isResourceId(key) || !isFiniteNumber(amount) || amount < 0) return null;
    if (amount > 0) bag[key] = Math.floor(amount);
  }
  return bag;
}

function parseMachine(value: unknown): MachineState | null {
  if (!isRecord(value)) return null;
  const input = parseBag(value.input);
  const { built, level, output, running, progress, feedTimer } = value;
  if (typeof built !== 'boolean' || typeof running !== 'boolean' || !input) return null;
  if (!isFiniteNumber(level) || !isFiniteNumber(output) || !isFiniteNumber(progress) || !isFiniteNumber(feedTimer)) {
    return null;
  }
  return {
    built,
    level: Math.max(1, Math.floor(level)),
    input,
    output: Math.max(0, Math.floor(output)),
    running,
    progress: Math.min(Math.max(progress, 0), 0.999),
    feedTimer: Math.max(0, feedTimer),
  };
}

function parsePlanet(value: unknown): PlanetState | null {
  if (!isRecord(value) || !isRecord(value.machines) || !isRecord(value.padPayments)) return null;
  const machines: Record<string, MachineState> = {};
  for (const [id, raw] of Object.entries(value.machines)) {
    const machine = parseMachine(raw);
    if (!machine) return null;
    machines[id] = machine;
  }
  const padPayments: Record<string, ResourceBag> = {};
  for (const [id, raw] of Object.entries(value.padPayments)) {
    const bag = parseBag(raw);
    if (!bag) return null;
    padPayments[id] = bag;
  }
  return { machines, padPayments };
}

function parseSuit(value: unknown): SuitLevels | null {
  if (!isRecord(value)) return null;
  const levels: Partial<SuitLevels> = {};
  for (const stat of SUIT_STATS) {
    const level = value[stat];
    if (!isFiniteNumber(level)) return null;
    levels[stat] = Math.min(Math.max(1, Math.floor(level)), SUIT_MAX_LEVEL[stat]);
  }
  return levels as SuitLevels;
}

/** Validates untrusted JSON into a GameState, or returns null if it is not one. */
export function parseGameState(value: unknown): GameState | null {
  if (!isRecord(value) || value.version !== SAVE_VERSION) return null;
  const { planetIndex, completed, oxygen, player } = value;
  if (!isFiniteNumber(planetIndex) || planetIndex < 0 || planetIndex >= PLANETS.length) return null;
  if (typeof completed !== 'boolean' || !isFiniteNumber(oxygen)) return null;
  if (!isRecord(player) || !isFiniteNumber(player.x) || !isFiniteNumber(player.z)) return null;

  const suit = parseSuit(value.suit);
  const backpack = parseBag(value.backpack);
  if (!suit || !backpack || !isRecord(value.planets)) return null;

  const planets: Record<string, PlanetState> = {};
  for (const [id, raw] of Object.entries(value.planets)) {
    const planet = parsePlanet(raw);
    if (!planet) return null;
    planets[id] = planet;
  }

  return {
    version: SAVE_VERSION,
    planetIndex: Math.floor(planetIndex),
    completed,
    suit,
    backpack,
    oxygen: Math.max(0, oxygen),
    player: { x: player.x, z: player.z },
    planets,
  };
}

function getStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch (error) {
    console.warn('[moonlanders] localStorage unavailable; progress will not persist.', error);
    return null;
  }
}

export function loadGame(): GameState | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = parseGameState(JSON.parse(raw));
    if (!parsed) console.warn('[moonlanders] Ignoring incompatible or corrupted save.');
    return parsed;
  } catch (error) {
    console.error('[moonlanders] Failed to read save.', error);
    return null;
  }
}

export function saveGame(state: GameState): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error('[moonlanders] Failed to write save.', error);
    return false;
  }
}

export function clearSave(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(SAVE_KEY);
  } catch (error) {
    console.error('[moonlanders] Failed to clear save.', error);
  }
}
