import { MARS } from "./mars";
import { MOON } from "./moon";
import type { PlanetDef, RouteCardDef } from "./types";

/** Playable planets in travel order. */
export const PLANETS: readonly PlanetDef[] = [MOON, MARS];

/** Planets announced on the start screen but not playable yet. */
export const UPCOMING: readonly RouteCardDef[] = [{ label: "Ice moon", resources: "Coming soon", dot: ["#c8f0ff", "#5a6fd0"] }];

export function planetById(id: unknown): PlanetDef | null {
  return PLANETS.find((planet) => planet.id === id) ?? null;
}

export function planetIndex(planet: PlanetDef): number {
  return PLANETS.findIndex((candidate) => candidate.id === planet.id);
}

/** The planet the rocket flies to next, or null when there is none yet. */
export function nextPlanet(planet: PlanetDef): PlanetDef | null {
  return PLANETS[planetIndex(planet) + 1] ?? null;
}
