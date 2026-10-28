import { DEPOSIT, ITEM_IDS, PILE, STORM, SUIT_UPGRADE_IDS, oxygenFor, type ItemId, type SuitUpgradeId } from "../config";
import type { BuildDef, PlanetDef, Point } from "../planets/types";

export interface PlayerState {
  x: number;
  z: number;
  heading: number;
  moving: boolean;
  carry: ItemId[];
  oxygen: number;
  mineTimer: number;
  transferTimer: number;
  /** Pace of taking items from a robot's stockpile. */
  stockpileTimer: number;
  /** Seconds left lying on the ground after running out of air. */
  stunned: number;
  miningTarget: string | null;
  /** Seconds the drill has been warming up; mining starts at PLAYER.warmupSeconds. */
  warmup: number;
  /** Seconds since the last rock was in reach; the drill cools down after a short grace. */
  outOfReach: number;
}

export interface DepositState extends Point {
  readonly id: string;
  readonly item: ItemId;
  readonly zone: string | null;
  /** The field this node belongs to; new nodes fall into the same field. */
  readonly field: string;
  amount: number;
  readonly maxAmount: number;
  /** Seconds the mined-out rubble stays before the node disappears. */
  rubble: number;
}

export interface MachineState {
  readonly id: string;
  input: number;
  output: number;
  /** 0..1 progress on the item being processed; null when idle. */
  progress: number | null;
  processed: number;
}

export type RobotPhase = "toDeposit" | "mining" | "toDropOff" | "unloading" | "toStockpile" | "loading" | "parked";

/** Where a robot is carrying its load. */
export type DropOff = "machine" | "order" | "stockpile";

export interface RobotState {
  readonly id: string;
  readonly item: ItemId;
  /** Machine the robot feeds, or null for material robots that supply builds. */
  readonly machineId: string | null;
  x: number;
  z: number;
  heading: number;
  carry: number;
  phase: RobotPhase;
  dropOff: DropOff;
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

/** A chunk of material on its way down from the sky. */
export interface FallState extends Point {
  readonly id: number;
  readonly item: ItemId;
  readonly field: string;
  readonly zone: string | null;
  /** Seconds until touchdown. */
  timer: number;
}

/** `restocking` takes leftover cargo back where it came from when the order no longer needs it. */
export type DronePhase = "parked" | "toSource" | "loading" | "toOrder" | "unloading" | "restocking" | "returning";

/** The cargo drone: carries plates from its machine, or a robot's stockpile, to the active order. */
export interface DroneState {
  readonly id: string;
  readonly machineId: string;
  x: number;
  z: number;
  heading: number;
  carry: number;
  cargo: ItemId | null;
  /** Robot whose stockpile it is fetching from, or null for the machine's output. */
  source: string | null;
  phase: DronePhase;
  timer: number;
}

export type StormPhase = "calm" | "warning" | "raging";

export interface StormState {
  phase: StormPhase;
  /** Seconds until the next phase change. */
  timer: number;
}

export type OrderKind = "build" | "suit" | "stage";

/** The one thing being built or upgraded right now; materials are delivered to its hologram. */
export interface OrderState {
  readonly kind: OrderKind;
  /** Build id, suit upgrade id, or the robot/drone id being upgraded. */
  readonly targetId: string;
  delivered: Record<ItemId, number>;
}

export interface Stats {
  mined: Record<ItemId, number>;
}

export interface GameState {
  readonly planet: PlanetDef;
  /** Finished builds, plus "wall" once the drill has bored through the ridge. */
  built: Set<string>;
  order: OrderState | null;
  suit: Record<SuitUpgradeId, number>;
  /** Stage 0..3 of every robot and drone, keyed by its build id. */
  stages: Record<string, number>;
  /** Whether each robot and drone is switched on. */
  enabled: Record<string, boolean>;
  /** What each material robot has stacked beside its dock. */
  stockpiles: Record<string, number>;
  player: PlayerState;
  deposits: DepositState[];
  machines: Map<string, MachineState>;
  robots: RobotState[];
  drones: DroneState[];
  piles: PileState[];
  nextPileId: number;
  falls: FallState[];
  /** Seconds until each field may drop its next node. */
  fallTimers: Record<string, number>;
  nextFallId: number;
  /** 0..1 while the drill bores through the ridge; null before it is built. */
  boring: number | null;
  storm: StormState;
  stats: Stats;
  objectiveIndex: number;
  boostSeconds: number;
  launched: boolean;
  time: number;
}

export function zeroItems(): Record<ItemId, number> {
  return Object.fromEntries(ITEM_IDS.map((id) => [id, 0])) as Record<ItemId, number>;
}

function zeroSuit(): Record<SuitUpgradeId, number> {
  return Object.fromEntries(SUIT_UPGRADE_IDS.map((id) => [id, 0])) as Record<SuitUpgradeId, number>;
}

/** Fields are grouped by material and by what unlocks them. */
export function fieldKey(item: ItemId, zone: string | null): string {
  return `${item}@${zone ?? "open"}`;
}

/** Robots and the drone are the builds that work on their own. */
export function workerBuilds(planet: PlanetDef): BuildDef[] {
  return planet.builds.filter((b) => b.kind === "robot" || b.kind === "drone");
}

export function createState(planet: PlanetDef): GameState {
  const workers = workerBuilds(planet);
  const materialRobots = workers.filter((b) => b.kind === "robot" && !b.machineId);
  return {
    planet,
    built: new Set(),
    order: { kind: "build", targetId: "workbench", delivered: zeroItems() },
    suit: zeroSuit(),
    stages: Object.fromEntries(workers.map((b) => [b.id, 0])),
    enabled: Object.fromEntries(workers.map((b) => [b.id, true])),
    stockpiles: Object.fromEntries(materialRobots.map((b) => [b.id, 0])),
    player: { x: planet.spawn.x, z: planet.spawn.z, heading: Math.PI, moving: false, carry: [], oxygen: oxygenFor(0), mineTimer: 0, transferTimer: 0, stockpileTimer: 0, stunned: 0, miningTarget: null, warmup: 0, outOfReach: 0 },
    deposits: planet.deposits.filter((d) => !d.hidden).map((d) => ({ ...d, field: fieldKey(d.item, d.zone), amount: DEPOSIT.amount, maxAmount: DEPOSIT.amount, rubble: 0 })),
    machines: new Map(planet.machines.map((m) => [m.id, { id: m.id, input: 0, output: 0, progress: null, processed: 0 }])),
    robots: [],
    drones: [],
    piles: [],
    nextPileId: 1,
    falls: [],
    fallTimers: {},
    nextFallId: 1,
    boring: null,
    storm: { phase: "calm", timer: STORM.firstDelaySeconds },
    stats: { mined: zeroItems() },
    objectiveIndex: 0,
    boostSeconds: 0,
    launched: false,
    time: 0,
  };
}

export function isAvailable(state: GameState, zone: string | null): boolean {
  return zone === null || state.built.has(zone);
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function buildDef(planet: PlanetDef, id: string): BuildDef | undefined {
  return planet.builds.find((b) => b.id === id);
}

/** Where a material robot stacks its haul. */
export function stockpileSpot(build: BuildDef): Point {
  return { x: build.x + PILE.stockpileOffset, z: build.z };
}

/** True while a dust storm is blowing; the player is only affected outside the dome. */
export function isStormRaging(state: GameState): boolean {
  return state.storm.phase === "raging";
}

export function isRidgeOpen(state: GameState): boolean {
  return state.built.has(state.planet.ridge.openId);
}

/** The rocket can fly once the jump drive is built. */
export function rocketReady(state: GameState): boolean {
  return state.planet.builds.some((b) => b.kind === "jumpDrive" && state.built.has(b.id));
}

/** Current level (1-based) of a machine: one more for each of its upgrades that is built. */
export function machineLevel(state: GameState, machineId: string): number {
  return 1 + state.planet.builds.filter((b) => b.kind === "machineUpgrade" && b.machineId === machineId && state.built.has(b.id)).length;
}
