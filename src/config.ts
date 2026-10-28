/** Tunable numbers for the whole game. Distances in metres, times in seconds. Everything is paid for in materials. */

export const ITEM_IDS = ["carbon", "clay", "ironOre", "plate", "heliumX", "heliumCell"] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export type ItemShape = "carbon" | "clay" | "ore" | "plate" | "crystal" | "cell";

export interface ItemDef {
  readonly name: string;
  readonly plural: string;
  readonly color: number;
  readonly shape: ItemShape;
  /** Height of one item in the carried stack. */
  readonly stackHeight: number;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  carbon: { name: "Carbon", plural: "Carbon", color: 0x3a3f4c, shape: "carbon", stackHeight: 0.18 },
  clay: { name: "Moon clay", plural: "Moon clay", color: 0xb9a68d, shape: "clay", stackHeight: 0.16 },
  ironOre: { name: "Iron ore", plural: "Iron ore", color: 0xd9813f, shape: "ore", stackHeight: 0.2 },
  plate: { name: "Metal plate", plural: "Metal plates", color: 0xc9d1da, shape: "plate", stackHeight: 0.085 },
  heliumX: { name: "Helium X", plural: "Helium X", color: 0xb27bff, shape: "crystal", stackHeight: 0.16 },
  heliumCell: { name: "Helium cell", plural: "Helium cells", color: 0x6dffd2, shape: "cell", stackHeight: 0.3 },
};

/** A price in materials, e.g. { carbon: 30, clay: 20 }. */
export type MaterialCost = Readonly<Partial<Record<ItemId, number>>>;

export const PLAYER = {
  radius: 0.45,
  baseSpeed: 4.6,
  baseMineInterval: 0.45,
  mineRange: 1.7,
  transferInterval: 0.07,
  /** The drill warms up this long before the first rock of a field gives anything. */
  warmupSeconds: 2,
  /** Stepping out of reach for less than this keeps the drill warm. */
  warmupGraceSeconds: 1,
} as const;

export const OXYGEN = {
  refillPerSecond: 30,
  lowRatio: 0.25,
  respawnSeconds: 1.6,
} as const;

export const DEPOSIT = {
  amount: 6,
  radius: 0.65,
} as const;

export const MACHINE = {
  colliderRadius: 1.35,
} as const;

export const PADS = {
  radius: 1.25,
} as const;

/** Martian dust storms: a warning, then a storm that slows walking and burns air faster outside the dome. */
export const STORM = {
  firstDelaySeconds: 40,
  minCalmSeconds: 45,
  maxCalmSeconds: 70,
  warningSeconds: 6,
  durationSeconds: 18,
  oxygenDrainMultiplier: 2,
  speedMultiplier: 0.7,
} as const;

/** Fresh material drops from the sky into each field; mined-out nodes crumble instead of regrowing. */
export const ORE_FALL = {
  minIntervalSeconds: 1.5,
  maxIntervalSeconds: 3,
  /** Seconds from the landing marker appearing to touchdown. */
  fallSeconds: 1.6,
  /** A mined-out node lingers as rubble this long before it disappears. */
  rubbleSeconds: 2.5,
  /** New nodes keep at least this far from other nodes and from the player. */
  spacing: 1.6,
  /** How far beyond the outermost starting node a field reaches. */
  fieldPadding: 0.8,
  placementAttempts: 12,
} as const;

/** Robots and the cargo drone improve in stages; each stage raises speed, work rate and capacity together. */
export const STAGE_BONUS = [0, 0.2, 0.4, 0.6] as const;
export const MAX_STAGE = STAGE_BONUS.length - 1;

/** STAGE_COSTS[n] is the price of going from stage n to n + 1. */
export const STAGE_COSTS: readonly MaterialCost[] = [
  { carbon: 70, plate: 25, clay: 10 },
  { carbon: 84, plate: 30, clay: 12 },
  { carbon: 126, plate: 45, clay: 18 },
];

function bonus(stage: number): number {
  return 1 + (STAGE_BONUS[Math.min(MAX_STAGE, Math.max(0, stage))] ?? 0);
}

export const ROBOT = {
  speed: 2.8,
  capacity: 8,
  mineInterval: 0.4,
  unloadInterval: 0.1,
  /** Robots stack what they mine beside their dock, up to this many; the cargo drone carries it on. */
  stockpileCapacity: 100,
} as const;

export function robotSpeedFor(stage: number): number {
  return ROBOT.speed * bonus(stage);
}

export function robotCapacityFor(stage: number): number {
  return Math.round(ROBOT.capacity * bonus(stage));
}

export function robotMineIntervalFor(stage: number): number {
  return ROBOT.mineInterval / bonus(stage);
}

/** The cargo drone ferries plates (and robot stockpiles) to whatever is being built. */
export const DRONE = {
  speed: 5.5,
  capacity: 10,
  loadInterval: 0.1,
  unloadInterval: 0.08,
  /** Cruising height while flying. */
  flightHeight: 2.6,
} as const;

export function droneSpeedFor(stage: number): number {
  return DRONE.speed * bonus(stage);
}

export function droneCapacityFor(stage: number): number {
  return Math.round(DRONE.capacity * bonus(stage));
}

export const PILE = {
  /** Walk this close to a pile (dropped or a robot's stockpile) to pick it up. */
  pickupRadius: 0.9,
  /** A pile you just dropped stays put until you have stepped this far away from it. */
  releaseRadius: 1.6,
  mergeRadius: 1.0,
  dropDistance: 0.9,
  /** A robot's stockpile sits this far east of its dock. */
  stockpileOffset: 1.5,
} as const;

/** The mining drill bores through the ridge over this long once it is built. */
export const DRILL = {
  boreSeconds: 18,
} as const;

export const BOOST = {
  multiplier: 2,
  seconds: 120,
} as const;

export const SUIT_UPGRADE_IDS = ["mining", "capacity", "oxygen", "speed"] as const;
export type SuitUpgradeId = (typeof SUIT_UPGRADE_IDS)[number];

export interface SuitUpgradeDef {
  readonly name: string;
  /** What the next level gives, indexed by the current level. */
  readonly effects: readonly string[];
  /** costs[n] is the price of going from level n to n + 1; the array length is the max level. */
  readonly costs: readonly MaterialCost[];
}

export const SUIT_UPGRADES: Record<SuitUpgradeId, SuitUpgradeDef> = {
  mining: {
    name: "Laser drill",
    effects: ["Mine 25% faster", "Mine 50% faster", "Mine 80% faster"],
    costs: [{ carbon: 25, clay: 15 }, { carbon: 70, plate: 30 }, { carbon: 150, plate: 70, clay: 25 }],
  },
  capacity: {
    name: "Bigger backpack",
    effects: ["Carry 25", "Carry 35"],
    costs: [{ carbon: 30, clay: 15 }, { carbon: 75, plate: 40 }],
  },
  oxygen: {
    name: "Oxygen tank",
    effects: ["70 s of air", "95 s of air", "125 s of air"],
    costs: [{ carbon: 25, clay: 25 }, { carbon: 60, plate: 30 }, { carbon: 135, plate: 60, clay: 30 }],
  },
  speed: {
    name: "Jet boots",
    effects: ["Walk 15% faster", "Walk 30% faster"],
    costs: [{ carbon: 45, plate: 15 }, { carbon: 120, plate: 55 }],
  },
};

const CAPACITY_BY_LEVEL = [15, 25, 35] as const;
const MINING_RATE_BY_LEVEL = [1, 1.25, 1.5, 1.8] as const;
const OXYGEN_BY_LEVEL = [50, 70, 95, 125] as const;

function byLevel(table: readonly number[], level: number): number {
  return table[Math.min(table.length - 1, Math.max(0, level))] ?? (table[0] as number);
}

export function speedFor(level: number): number {
  return PLAYER.baseSpeed * (1 + 0.15 * level);
}

export function capacityFor(level: number): number {
  return byLevel(CAPACITY_BY_LEVEL, level);
}

export function mineIntervalFor(level: number): number {
  return PLAYER.baseMineInterval / byLevel(MINING_RATE_BY_LEVEL, level);
}

export function oxygenFor(level: number): number {
  return byLevel(OXYGEN_BY_LEVEL, level);
}
