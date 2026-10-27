import type { ItemId, RobotUpgradeId, UpgradeId } from "../config";
import type { Point } from "../planets/types";

/** Everything the simulation reports to the view and audio layers each frame. */
export type SimEvent =
  | { type: "mined"; item: ItemId; from: Point; robotId: string | null }
  | { type: "sold"; item: ItemId; credits: number }
  | { type: "delivered"; item: ItemId; to: Point }
  | { type: "pickedUp"; item: ItemId; from: Point }
  | { type: "robotUnloaded"; robotId: string; item: ItemId; to: Point }
  | { type: "paying"; padId: string }
  | { type: "unlocked"; id: string }
  | { type: "upgraded"; id: UpgradeId; level: number }
  | { type: "robotUpgraded"; robotId: string; id: RobotUpgradeId; level: number }
  | { type: "dropped"; item: ItemId; at: Point }
  | { type: "meteorWarning"; id: number; at: Point }
  | { type: "meteorImpact"; id: number; at: Point; hitPlayer: boolean; itemsLost: number }
  | { type: "oxygenLow" }
  | { type: "oxygenOut"; itemsLost: number }
  | { type: "backpackFull" }
  | { type: "objective"; index: number }
  | { type: "rocketComplete" }
  | { type: "launch" };

export type Emit = (event: SimEvent) => void;
