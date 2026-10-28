import type { ItemId, MaterialCost, SuitUpgradeId } from "../config";

export interface Point {
  readonly x: number;
  readonly z: number;
}

export interface DepositDef extends Point {
  readonly id: string;
  readonly item: ItemId;
  /** Build (or "wall") that makes this field reachable; null when available from the start. */
  readonly zone: string | null;
  /** Not on the map at all until its zone is available; then it falls in from the sky. */
  readonly hidden?: boolean;
}

export type MachineModelId = "smelter" | "refinery";

/** What a machine can hold and how fast it works at one level. */
export interface MachineLevel {
  readonly inputCapacity: number;
  readonly outputCapacity: number;
  readonly secondsPerItem: number;
}

export interface MachineDef extends Point {
  readonly id: string;
  readonly name: string;
  readonly model: MachineModelId;
  readonly input: ItemId;
  /** Input consumed per finished item (2 Helium X make one helium cell). */
  readonly inputPerItem: number;
  readonly output: ItemId;
  /** Level 1 first; each built machine upgrade moves it up one level. */
  readonly levels: readonly MachineLevel[];
  readonly inputPad: Point;
  readonly outputPad: Point;
}

export type BuildKind = "workbench" | "machine" | "machineUpgrade" | "robot" | "drone" | "drill" | "jumpDrive";

/**
 * Anything made at the workbench. `x, z` is where it stands; `site` is where its hologram
 * collects materials (in front of it, so you can reach it).
 */
export interface BuildDef extends Point {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly kind: BuildKind;
  readonly cost: MaterialCost;
  /** All of these must be built before this one can be ordered. */
  readonly requires: readonly string[];
  readonly site: Point;
  /** Machine built, upgraded or served (robots feed it, the drone unloads it). */
  readonly machineId?: string;
  /** What a robot mines. */
  readonly item?: ItemId;
}

export type ObjectiveCheck =
  | { kind: "mined"; item: ItemId; count: number }
  | { kind: "built"; id: string }
  | { kind: "builtAny"; ids: readonly string[] }
  | { kind: "processed"; machineId: string; count: number }
  | { kind: "suitUpgraded"; id: SuitUpgradeId }
  | { kind: "launched" };

export interface ObjectiveDef {
  readonly text: string;
  readonly target: Point;
  readonly check: ObjectiveCheck;
}

/** A building you stand in front of to use: `pad` is where the panel opens. */
export interface StationDef extends Point {
  readonly pad: Point;
}

export interface PlanetPalette {
  /** Fog and particle colour while a dust storm rages. */
  readonly dust: number;
  readonly groundLow: number;
  readonly groundHigh: number;
  readonly rock: number;
  readonly sky: number;
  readonly fog: number;
  readonly sun: number;
  readonly hemiSky: number;
  readonly hemiGround: number;
}

export interface CraterDef extends Point {
  readonly radius: number;
}

export type DecorKind = "solarFarm" | "antenna" | "crates" | "flag" | "fuelTanks" | "lamp" | "debris";

export interface DecorDef extends Point {
  readonly kind: DecorKind;
  readonly rotation?: number;
}

/** Set dressing that has no gameplay effect. */
export interface SceneryDef {
  readonly craters: readonly CraterDef[];
  /** Big boulders that frame the map edge: x, z, scale. */
  readonly edgeBoulders: ReadonlyArray<readonly [number, number, number]>;
  readonly decor: readonly DecorDef[];
  readonly cables: ReadonlyArray<readonly [Point, Point]>;
  /** Blinking posts either side of the ridge gap. */
  readonly beaconRows: readonly number[];
  readonly starCount: number;
}

/** How the start screen presents this planet. */
export interface RouteCardDef {
  readonly label: string;
  readonly resources: string;
  readonly dot: readonly [string, string];
}

export interface PlanetDef {
  readonly id: string;
  readonly name: string;
  /** The name as it reads mid-sentence, e.g. "the Moon". */
  readonly phrase: string;
  readonly palette: PlanetPalette;
  readonly bounds: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number };
  /** Ridge that blocks the way north until `openId` is in the built set (the drill bores it open). */
  readonly ridge: { readonly z: number; readonly gapHalfWidth: number; readonly openId: string };
  readonly dome: Point & { readonly radius: number };
  readonly spawn: Point;
  /** Where your escape pod lands, inside the dome. */
  readonly podSpot: Point;
  readonly suitStation: StationDef;
  /** The workbench; its own build is the first order of the game. */
  readonly workbench: StationDef;
  readonly rocket: Point & { readonly pad: Point };
  readonly deposits: readonly DepositDef[];
  readonly machines: readonly MachineDef[];
  readonly builds: readonly BuildDef[];
  readonly objectives: readonly ObjectiveDef[];
  /** Dust storms start once this build exists. */
  readonly storms: { readonly after: string } | null;
  readonly scenery: SceneryDef;
  readonly route: RouteCardDef;
  /** Captions for the opening cinematic. */
  readonly arrivalCaptions: readonly string[];
  /** Which ambient soundtrack plays here. */
  readonly music: "moon" | "mars";
}
