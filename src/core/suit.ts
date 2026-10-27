import type { PlanetDefinition } from '../config/planets/types';
import type { ResourceBag } from '../config/resources';

export const SuitStat = {
  Capacity: 'capacity',
  Speed: 'speed',
  Oxygen: 'oxygen',
} as const;
export type SuitStat = (typeof SuitStat)[keyof typeof SuitStat];

export const SUIT_STATS: readonly SuitStat[] = [SuitStat.Capacity, SuitStat.Speed, SuitStat.Oxygen];

export type SuitLevels = Record<SuitStat, number>;

export const SUIT_MAX_LEVEL: Readonly<Record<SuitStat, number>> = {
  capacity: 6,
  speed: 5,
  oxygen: 5,
};

export const SUIT_STAT_LABEL: Readonly<Record<SuitStat, string>> = {
  capacity: 'Backpack',
  speed: 'Boots',
  oxygen: 'Oxygen Tank',
};

export interface SuitStats {
  readonly capacity: number;
  readonly speed: number;
  readonly oxygenMax: number;
}

export function backpackCapacity(level: number): number {
  return 10 + (level - 1) * 6;
}

export function moveSpeed(level: number): number {
  return 5 + (level - 1) * 0.9;
}

export function oxygenCapacity(level: number): number {
  return 28 + (level - 1) * 14;
}

export function suitStatsOf(levels: Readonly<SuitLevels>): SuitStats {
  return {
    capacity: backpackCapacity(levels.capacity),
    speed: moveSpeed(levels.speed),
    oxygenMax: oxygenCapacity(levels.oxygen),
  };
}

export function createSuitLevels(): SuitLevels {
  return { capacity: 1, speed: 1, oxygen: 1 };
}

export function isSuitStatMaxed(levels: Readonly<SuitLevels>, stat: SuitStat): boolean {
  return levels[stat] >= SUIT_MAX_LEVEL[stat];
}

/** Cost to raise `stat` from `currentLevel` to the next level on `planet`. */
export function suitUpgradeCost(planet: PlanetDefinition, currentLevel: number): ResourceBag {
  const amount = Math.round((4 + currentLevel * 4) * planet.suitCostMultiplier);
  return { [planet.suitResource]: amount };
}

/** Short description of what the next level grants, for pad labels. */
export function describeNextSuitLevel(stat: SuitStat, currentLevel: number): string {
  switch (stat) {
    case SuitStat.Capacity:
      return `Carry ${backpackCapacity(currentLevel)} → ${backpackCapacity(currentLevel + 1)}`;
    case SuitStat.Speed:
      return `Speed ${moveSpeed(currentLevel).toFixed(1)} → ${moveSpeed(currentLevel + 1).toFixed(1)}`;
    case SuitStat.Oxygen:
      return `Air ${oxygenCapacity(currentLevel)}s → ${oxygenCapacity(currentLevel + 1)}s`;
  }
}
