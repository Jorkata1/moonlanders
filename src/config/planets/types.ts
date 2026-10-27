import type { ResourceBag, ResourceId } from '../resources';

export interface Vec2 {
  x: number;
  z: number;
}

export const MachineKind = {
  Drill: 'drill',
  Furnace: 'furnace',
  Refinery: 'refinery',
  Assembler: 'assembler',
} as const;
export type MachineKind = (typeof MachineKind)[keyof typeof MachineKind];

export interface Recipe {
  /** Consumed per cycle. Empty for extractors (drills). */
  readonly inputs: Readonly<ResourceBag>;
  readonly output: ResourceId;
  readonly outputAmount: number;
  /** Seconds per cycle at level 1. */
  readonly cycleSeconds: number;
}

export interface MachineDefinition {
  readonly id: string;
  readonly name: string;
  readonly kind: MachineKind;
  readonly position: Vec2;
  readonly recipe: Recipe;
  readonly buildCost: Readonly<ResourceBag>;
  /** Index 0 upgrades level 1 → 2, index 1 upgrades 2 → 3. */
  readonly upgradeCosts: readonly Readonly<ResourceBag>[];
  /** Machines that must be built before this one's build pad appears. */
  readonly requires: readonly string[];
  /** Once upgraded, this machine pulls its input from the named machine via conveyor. */
  readonly autoFeedFrom?: string;
}

export interface DepositDefinition {
  readonly id: string;
  readonly resource: ResourceId;
  readonly position: Vec2;
  readonly radius: number;
}

export interface PlanetPalette {
  readonly ground: number;
  readonly groundAlt: number;
  readonly rock: number;
  readonly sky: number;
  readonly accent: number;
  readonly sunColor: number;
  readonly ambientSky: number;
  readonly ambientGround: number;
}

export const PlanetId = {
  Moon: 'moon',
  Mars: 'mars',
  Europa: 'europa',
} as const;
export type PlanetId = (typeof PlanetId)[keyof typeof PlanetId];

export interface PlanetDefinition {
  readonly id: PlanetId;
  readonly name: string;
  readonly tagline: string;
  readonly destinationName: string;
  readonly palette: PlanetPalette;
  readonly domeRadius: number;
  readonly oxygenDrainMultiplier: number;
  readonly spawn: Vec2;
  readonly rocketPosition: Vec2;
  readonly suitStationPosition: Vec2;
  readonly deposits: readonly DepositDefinition[];
  readonly machines: readonly MachineDefinition[];
  readonly rocketCost: Readonly<ResourceBag>;
  /** Suit upgrades on this planet are paid in this resource. */
  readonly suitResource: ResourceId;
  readonly suitCostMultiplier: number;
  /** Seed for deterministic decoration scatter. */
  readonly decorationSeed: number;
}
