import type { ItemId, UpgradeId } from "../config";

export interface Point {
  readonly x: number;
  readonly z: number;
}

export interface DepositDef extends Point {
  readonly id: string;
  readonly item: ItemId;
  /** Unlock that makes this deposit reachable; null when available from the start. */
  readonly zone: string | null;
}

export type MachineModelId = "smelter" | "purifier" | "wireMill" | "fuelSynth" | "engineWorks";

export interface MachineDef extends Point {
  readonly id: string;
  readonly name: string;
  readonly model: MachineModelId;
  readonly input: ItemId;
  /** Assemblers need one of each input per item; robots only ever feed the first input. */
  readonly secondInput?: { readonly item: ItemId; readonly pad: Point };
  readonly output: ItemId;
  readonly secondsPerItem: number;
  readonly inputPad: Point;
  readonly outputPad: Point;
}

export type UnlockKind = "machine" | "workshop" | "path" | "robot" | "drone";

export interface UnlockDef extends Point {
  readonly id: string;
  readonly label: string;
  readonly kind: UnlockKind;
  readonly cost: number;
  /** All of these must be unlocked before this pad appears. */
  readonly requires: readonly string[];
  /** Machine id for machine, robot and drone unlocks (a drone sells that machine's output). */
  readonly machineId?: string;
}

export type ObjectiveCheck =
  | { kind: "mined"; item: ItemId; count: number }
  | { kind: "earned"; credits: number }
  | { kind: "unlocked"; id: string }
  | { kind: "processed"; machineId: string; count: number }
  | { kind: "carrying"; item: ItemId }
  | { kind: "upgraded"; id: UpgradeId }
  | { kind: "rocketComplete" }
  | { kind: "launched" };

export interface ObjectiveDef {
  readonly text: string;
  readonly target: Point;
  readonly check: ObjectiveCheck;
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

export type DecorKind = "solarFarm" | "antenna" | "crates" | "flag" | "fuelTanks";

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
  /** Ridge that blocks the way north until the path unlock is bought. */
  readonly ridge: { readonly z: number; readonly gapHalfWidth: number; readonly unlockId: string };
  readonly dome: Point & { readonly radius: number };
  readonly spawn: Point;
  readonly sellPad: Point;
  /** The trader's stall, just behind the trade pad. */
  readonly trader: Point;
  readonly workshop: Point;
  readonly rocket: Point & { readonly pad: Point; readonly parts: Readonly<Partial<Record<ItemId, number>>> };
  readonly deposits: readonly DepositDef[];
  readonly machines: readonly MachineDef[];
  readonly unlocks: readonly UnlockDef[];
  readonly objectives: readonly ObjectiveDef[];
  /** Dust storms start once this unlock is bought. */
  readonly storms: { readonly after: string } | null;
  readonly scenery: SceneryDef;
  readonly route: RouteCardDef;
  /** Captions for the pod-landing cinematic when the player arrives. */
  readonly arrivalCaptions: readonly string[];
  /** Which ambient soundtrack plays here. */
  readonly music: "moon" | "mars";
}
