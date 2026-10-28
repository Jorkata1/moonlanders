import { DEPOSIT, DRONE_UPGRADE_IDS, ITEM_IDS, STORM, ROBOT_UPGRADE_IDS, UPGRADE_IDS, oxygenFor, type DroneUpgradeId, type ItemId, type RobotUpgradeId, type UpgradeId } from "../config";
import type { PlanetDef, Point } from "../planets/types";

export interface PlayerState {
  x: number;
  z: number;
  heading: number;
  moving: boolean;
  carry: ItemId[];
  oxygen: number;
  mineTimer: number;
  transferTimer: number;
  /** Seconds left lying on the ground after running out of air. */
  stunned: number;
  miningTarget: string | null;
}

export interface DepositState extends Point {
  readonly id: string;
  readonly item: ItemId;
  readonly zone: string | null;
  /** The ore field this node belongs to; new nodes fall into the same field. */
  readonly field: string;
  amount: number;
  readonly maxAmount: number;
  /** Seconds the mined-out rubble stays before the node disappears. */
  rubble: number;
}

export interface MachineState {
  readonly id: string;
  input: number;
  /** Stock of the machine's second input; always 0 for single-input machines. */
  secondInput: number;
  output: number;
  /** 0..1 progress on the item being processed; null when idle. */
  progress: number | null;
  processed: number;
}

export type RobotPhase = "toDeposit" | "mining" | "toMachine" | "unloading";

export interface RobotState {
  readonly id: string;
  readonly machineId: string;
  x: number;
  z: number;
  heading: number;
  carry: number;
  phase: RobotPhase;
  depositId: string | null;
  timer: number;
}

export interface PileState extends Point {
  readonly id: number;
  items: ItemId[];
  /** True until the player who dropped it walks away, so it is not instantly picked back up. */
  held: boolean;
  pickupTimer?: number;
}

/** A chunk of ore on its way down from the sky. */
export interface FallState extends Point {
  readonly id: number;
  readonly item: ItemId;
  readonly field: string;
  readonly zone: string | null;
  /** Seconds until touchdown. */
  timer: number;
}

export type DronePhase = "toMachine" | "loading" | "toTrader" | "selling" | "returning" | "parked";

/** A trader drone that ferries a machine's output to the sell pad. */
export interface DroneState {
  readonly id: string;
  readonly machineId: string;
  x: number;
  z: number;
  heading: number;
  carry: number;
  phase: DronePhase;
  timer: number;
  /** Fraction of a credit left over from haggled sales. */
  cashRemainder: number;
}

export type StormPhase = "calm" | "warning" | "raging";

export interface StormState {
  phase: StormPhase;
  /** Seconds until the next phase change. */
  timer: number;
}

export interface Stats {
  mined: Record<ItemId, number>;
  earned: number;
}

export interface GameState {
  readonly planet: PlanetDef;
  credits: number;
  unlocked: Set<string>;
  paid: Map<string, number>;
  upgrades: Record<UpgradeId, number>;
  player: PlayerState;
  deposits: DepositState[];
  machines: Map<string, MachineState>;
  robots: RobotState[];
  /** Upgrade levels per robot, keyed by the robot's unlock id. */
  robotUpgrades: Record<string, Record<RobotUpgradeId, number>>;
  piles: PileState[];
  nextPileId: number;
  rocket: Record<ItemId, number>;
  falls: FallState[];
  /** Seconds until each ore field may drop its next node. */
  fallTimers: Record<string, number>;
  nextFallId: number;
  drones: DroneState[];
  droneUpgrades: Record<string, Record<DroneUpgradeId, number>>;
  /** Whether each trader drone is allowed to sell. */
  droneEnabled: Record<string, boolean>;
  storm: StormState;
  stats: Stats;
  objectiveIndex: number;
  boostSeconds: number;
  /** Fractional credits owed to the pad being paid, so payments flow smoothly. */
  payAccumulator: number;
  launched: boolean;
  time: number;
}

function zeroItems(): Record<ItemId, number> {
  return Object.fromEntries(ITEM_IDS.map((id) => [id, 0])) as Record<ItemId, number>;
}

function zeroUpgrades(): Record<UpgradeId, number> {
  return Object.fromEntries(UPGRADE_IDS.map((id) => [id, 0])) as Record<UpgradeId, number>;
}

export function zeroRobotUpgrades(): Record<RobotUpgradeId, number> {
  return Object.fromEntries(ROBOT_UPGRADE_IDS.map((id) => [id, 0])) as Record<RobotUpgradeId, number>;
}

export function zeroDroneUpgrades(): Record<DroneUpgradeId, number> {
  return Object.fromEntries(DRONE_UPGRADE_IDS.map((id) => [id, 0])) as Record<DroneUpgradeId, number>;
}

/** Deposits of the same item behind the same unlock form one field. */
export function fieldKey(item: ItemId, zone: string | null): string {
  return `${item}@${zone ?? "open"}`;
}

export function createState(planet: PlanetDef): GameState {
  return {
    planet,
    credits: 0,
    unlocked: new Set(),
    paid: new Map(),
    upgrades: zeroUpgrades(),
    player: { x: planet.spawn.x, z: planet.spawn.z, heading: Math.PI, moving: false, carry: [], oxygen: oxygenFor(0), mineTimer: 0, transferTimer: 0, stunned: 0, miningTarget: null },
    deposits: planet.deposits.map((d) => ({ ...d, field: fieldKey(d.item, d.zone), amount: DEPOSIT.amount, maxAmount: DEPOSIT.amount, rubble: 0 })),
    machines: new Map(planet.machines.map((m) => [m.id, { id: m.id, input: 0, secondInput: 0, output: 0, progress: null, processed: 0 }])),
    robots: [],
    robotUpgrades: Object.fromEntries(planet.unlocks.filter((u) => u.kind === "robot").map((u) => [u.id, zeroRobotUpgrades()])),
    piles: [],
    nextPileId: 1,
    rocket: zeroItems(),
    falls: [],
    fallTimers: {},
    nextFallId: 1,
    drones: [],
    droneUpgrades: Object.fromEntries(planet.unlocks.filter((u) => u.kind === "drone").map((u) => [u.id, zeroDroneUpgrades()])),
    droneEnabled: Object.fromEntries(planet.unlocks.filter((u) => u.kind === "drone").map((u) => [u.id, true])),
    storm: { phase: "calm", timer: STORM.firstDelaySeconds },
    stats: { mined: zeroItems(), earned: 0 },
    objectiveIndex: 0,
    boostSeconds: 0,
    payAccumulator: 0,
    launched: false,
    time: 0,
  };
}

export function isAvailable(state: GameState, zone: string | null): boolean {
  return zone === null || state.unlocked.has(zone);
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** True while a dust storm is blowing; the player is only affected outside the dome. */
export function isStormRaging(state: GameState): boolean {
  return state.storm.phase === "raging";
}

export function rocketComplete(state: GameState): boolean {
  return Object.entries(state.planet.rocket.parts).every(([item, needed]) => state.rocket[item as ItemId] >= (needed ?? 0));
}

export function rocketNeeds(state: GameState, item: ItemId): number {
  return Math.max(0, (state.planet.rocket.parts[item] ?? 0) - state.rocket[item]);
}
