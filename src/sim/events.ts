import type { ItemId } from "../config";
import type { Point } from "../planets/types";
import type { OrderKind } from "./state";

/** Everything the simulation reports to the view and audio layers each frame. */
export type SimEvent =
  | { type: "mined"; item: ItemId; from: Point; robotId: string | null }
  /** The drill finished warming up and locked onto a rock. */
  | { type: "drillLocked"; at: Point }
  /** An item went into a machine's input; `by` is the robot id, or null for the player. */
  | { type: "fed"; item: ItemId; machineId: string; to: Point; by: string | null }
  | { type: "pickedUp"; item: ItemId; from: Point }
  | { type: "orderStarted"; kind: OrderKind; targetId: string }
  /** `by` is the robot or drone id, or null for the player. */
  | { type: "orderDelivered"; item: ItemId; from: Point; to: Point; by: string | null }
  | { type: "orderComplete"; kind: OrderKind; targetId: string; at: Point }
  | { type: "stockpiled"; robotId: string; item: ItemId; to: Point }
  | { type: "droneLoaded"; droneId: string; item: ItemId; from: Point }
  | { type: "dropped"; item: ItemId; at: Point }
  | { type: "oreIncoming"; id: number; item: ItemId; at: Point; seconds: number }
  | { type: "oreLanded"; id: number; depositId: string; item: ItemId; at: Point }
  | { type: "wallOpen" }
  | { type: "stormWarning"; seconds: number }
  | { type: "stormStart" }
  | { type: "stormEnd" }
  | { type: "oxygenLow" }
  | { type: "oxygenOut"; itemsLost: number }
  | { type: "backpackFull" }
  | { type: "objective"; index: number }
  | { type: "launch" };

export type Emit = (event: SimEvent) => void;
