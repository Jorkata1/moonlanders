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

export interface MachineDef extends Point {
  readonly id: string;
  readonly name: string;
  readonly input: ItemId;
  readonly output: ItemId;
  readonly secondsPerItem: number;
  readonly inputPad: Point;
  readonly outputPad: Point;
}

export type UnlockKind = "machine" | "workshop" | "path" | "robot";

export interface UnlockDef extends Point {
  readonly id: string;
  readonly label: string;
  readonly kind: UnlockKind;
  readonly cost: number;
  /** All of these must be unlocked before this pad appears. */
  readonly requires: readonly string[];
  /** Machine id for machine and robot unlocks. */
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
  readonly groundLow: number;
  readonly groundHigh: number;
  readonly rock: number;
  readonly sky: number;
  readonly fog: number;
  readonly sun: number;
  readonly hemiSky: number;
  readonly hemiGround: number;
}

export interface PlanetDef {
  readonly id: string;
  readonly name: string;
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
  /** Unlock that switches meteor showers on. */
  readonly meteorsAfter: string;
}
