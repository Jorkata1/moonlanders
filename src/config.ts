/** Tunable numbers for the whole game. Distances in metres, times in seconds, money in credits. */

export const ITEM_IDS = ["ironOre", "ice", "plate", "water"] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export type ItemShape = "ore" | "ice" | "plate" | "canister";

export interface ItemDef {
  readonly name: string;
  readonly plural: string;
  readonly color: number;
  readonly sellPrice: number;
  readonly shape: ItemShape;
  /** Height of one item in the carried stack. */
  readonly stackHeight: number;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  ironOre: { name: "Iron ore", plural: "Iron ore", color: 0xd9813f, sellPrice: 1, shape: "ore", stackHeight: 0.2 },
  ice: { name: "Ice", plural: "Ice", color: 0x9fe3ff, sellPrice: 1, shape: "ice", stackHeight: 0.2 },
  plate: { name: "Metal plate", plural: "Metal plates", color: 0xc9d1da, sellPrice: 3, shape: "plate", stackHeight: 0.085 },
  water: { name: "Water tank", plural: "Water tanks", color: 0x3d8bff, sellPrice: 5, shape: "canister", stackHeight: 0.24 },
};

export const PLAYER = {
  radius: 0.45,
  baseSpeed: 4.6,
  baseCapacity: 6,
  baseMineInterval: 0.7,
  baseOxygenSeconds: 50,
  mineRange: 1.7,
  transferInterval: 0.07,
  knockdownSeconds: 1.2,
} as const;

export const OXYGEN = {
  refillPerSecond: 30,
  lowRatio: 0.25,
  respawnSeconds: 1.6,
} as const;

export const DEPOSIT = {
  amount: 5,
  regrowSeconds: 14,
  radius: 0.65,
} as const;

export const MACHINE = {
  inputCapacity: 20,
  outputCapacity: 30,
  colliderRadius: 1.35,
} as const;

export const PADS = {
  radius: 1.25,
  /** Every unlock takes about this long to pay off, however expensive. */
  paySeconds: 1.6,
  minPayPerSecond: 10,
} as const;

export const METEOR = {
  firstDelaySeconds: 30,
  minIntervalSeconds: 16,
  maxIntervalSeconds: 26,
  warningSeconds: 2.4,
  radius: 2.1,
  aimJitter: 2.5,
  rewardOre: 4,
  /** Meteor chunks crumble away if nobody mines them. */
  chunkLifetimeSeconds: 45,
  carryLossRatio: 0.5,
} as const;

export const ROBOT = {
  speed: 2.4,
  capacity: 4,
  mineInterval: 1.2,
  unloadInterval: 0.2,
} as const;

export const ROBOT_UPGRADE_IDS = ["speed", "capacity", "mining"] as const;
export type RobotUpgradeId = (typeof ROBOT_UPGRADE_IDS)[number];

export const ROBOT_UPGRADES: Record<RobotUpgradeId, UpgradeDef> = {
  speed: { name: "Servo motors", description: "+25% robot speed", costs: [90, 180, 320] },
  capacity: { name: "Cargo bay", description: "+2 robot carry slots", costs: [100, 200, 360] },
  mining: { name: "Robot drill", description: "Robot mines 25% faster", costs: [110, 220, 380] },
};

export function robotSpeedFor(level: number): number {
  return ROBOT.speed * (1 + 0.25 * level);
}

export function robotCapacityFor(level: number): number {
  return ROBOT.capacity + 2 * level;
}

export function robotMineIntervalFor(level: number): number {
  return ROBOT.mineInterval * 0.75 ** level;
}

export const PILE = {
  /** Walk this close to a dropped pile to pick it up again. */
  pickupRadius: 0.9,
  /** A pile you just dropped stays put until you have stepped this far away from it. */
  releaseRadius: 1.6,
  mergeRadius: 1.0,
  dropDistance: 0.9,
} as const;

export const BOOST = {
  multiplier: 2,
  seconds: 120,
} as const;

export const UPGRADE_IDS = ["speed", "capacity", "mining", "oxygen"] as const;
export type UpgradeId = (typeof UPGRADE_IDS)[number];

export interface UpgradeDef {
  readonly name: string;
  readonly description: string;
  readonly costs: readonly number[];
}

/** costs[n] is the price of going from level n to n + 1; the array length is the max level. */
export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  speed: { name: "Jet boots", description: "+12% walking speed", costs: [45, 110, 220, 400] },
  capacity: { name: "Bigger backpack", description: "+3 carry slots", costs: [40, 100, 210, 380] },
  mining: { name: "Laser drill", description: "Mine 18% faster", costs: [50, 120, 240, 420] },
  oxygen: { name: "Oxygen tank", description: "+20 s of air", costs: [35, 90, 180, 340] },
};

export function speedFor(level: number): number {
  return PLAYER.baseSpeed * (1 + 0.12 * level);
}

export function capacityFor(level: number): number {
  return PLAYER.baseCapacity + 3 * level;
}

export function mineIntervalFor(level: number): number {
  return PLAYER.baseMineInterval * 0.82 ** level;
}

export function oxygenFor(level: number): number {
  return PLAYER.baseOxygenSeconds + 20 * level;
}
