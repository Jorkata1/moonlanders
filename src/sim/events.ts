import type { DroneUpgradeId, ItemId, RobotUpgradeId, UpgradeId } from "../config";
import type { Point } from "../planets/types";

/** Everything the simulation reports to the view and audio layers each frame. */
export type SimEvent =
  | { type: "mined"; item: ItemId; from: Point; robotId: string | null }
  | { type: "sold"; item: ItemId; credits: number }
  /** `feed` is set when the item went into a machine: which machine and which of its inputs. */
  | { type: "delivered"; item: ItemId; to: Point; feed?: { machineId: string; second: boolean } }
  | { type: "pickedUp"; item: ItemId; from: Point }
  | { type: "robotUnloaded"; robotId: string; item: ItemId; to: Point; machineId: string }
  | { type: "paying"; padId: string }
  | { type: "unlocked"; id: string }
  | { type: "upgraded"; id: UpgradeId; level: number }
  | { type: "robotUpgraded"; robotId: string; id: RobotUpgradeId; level: number }
  | { type: "dropped"; item: ItemId; at: Point }
  | { type: "oreIncoming"; id: number; item: ItemId; at: Point; seconds: number }
  | { type: "oreLanded"; id: number; depositId: string; item: ItemId; at: Point }
  | { type: "droneLoaded"; droneId: string; item: ItemId; from: Point }
  | { type: "droneSold"; droneId: string; item: ItemId; credits: number }
  | { type: "droneUpgraded"; droneId: string; id: DroneUpgradeId; level: number }
  | { type: "stormWarning"; seconds: number }
  | { type: "stormStart" }
  | { type: "stormEnd" }
  | { type: "oxygenLow" }
  | { type: "oxygenOut"; itemsLost: number }
  | { type: "backpackFull" }
  | { type: "objective"; index: number }
  | { type: "rocketComplete" }
  | { type: "launch" };

export type Emit = (event: SimEvent) => void;
