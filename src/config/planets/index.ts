import { EUROPA } from './europa';
import { MARS } from './mars';
import { MOON } from './moon';
import type { MachineDefinition, PlanetDefinition } from './types';

/** Planets in campaign order. */
export const PLANETS: readonly PlanetDefinition[] = [MOON, MARS, EUROPA];

export function getPlanet(index: number): PlanetDefinition {
  const planet = PLANETS[index];
  if (!planet) throw new RangeError(`No planet at campaign index ${index}`);
  return planet;
}

export function isFinalPlanet(index: number): boolean {
  return index === PLANETS.length - 1;
}

export function findMachine(planet: PlanetDefinition, machineId: string): MachineDefinition | undefined {
  return planet.machines.find((machine) => machine.id === machineId);
}
