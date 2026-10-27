import { getPlanet } from '../config/planets';
import type { PlanetDefinition, Vec2 } from '../config/planets/types';
import type { ResourceBag } from '../config/resources';
import { createSuitLevels, oxygenCapacity, type SuitLevels } from './suit';

export const SAVE_VERSION = 1;

export interface MachineState {
  built: boolean;
  level: number;
  input: ResourceBag;
  output: number;
  /** True once inputs for the current cycle have been consumed. */
  running: boolean;
  /** Fraction of the current cycle completed, in [0, 1). */
  progress: number;
  feedTimer: number;
}

export interface PlanetState {
  machines: Record<string, MachineState>;
  /** Partial payments towards pads, keyed by pad id. */
  padPayments: Record<string, ResourceBag>;
}

export interface GameState {
  version: typeof SAVE_VERSION;
  planetIndex: number;
  completed: boolean;
  suit: SuitLevels;
  backpack: ResourceBag;
  oxygen: number;
  player: Vec2;
  planets: Record<string, PlanetState>;
}

export function createMachineState(): MachineState {
  return { built: false, level: 1, input: {}, output: 0, running: false, progress: 0, feedTimer: 0 };
}

export function createPlanetState(planet: PlanetDefinition): PlanetState {
  const machines: Record<string, MachineState> = {};
  for (const machine of planet.machines) machines[machine.id] = createMachineState();
  return { machines, padPayments: {} };
}

export function createInitialState(): GameState {
  const planet = getPlanet(0);
  const suit = createSuitLevels();
  return {
    version: SAVE_VERSION,
    planetIndex: 0,
    completed: false,
    suit,
    backpack: {},
    oxygen: oxygenCapacity(suit.oxygen),
    player: { ...planet.spawn },
    planets: { [planet.id]: createPlanetState(planet) },
  };
}

/**
 * Returns the state for `planet`, creating it (or any machine entries added
 * to the config since the save was written) on demand.
 */
export function ensurePlanetState(state: GameState, planet: PlanetDefinition): PlanetState {
  const existing = state.planets[planet.id];
  if (!existing) {
    const created = createPlanetState(planet);
    state.planets[planet.id] = created;
    return created;
  }
  for (const machine of planet.machines) {
    existing.machines[machine.id] ??= createMachineState();
  }
  return existing;
}
