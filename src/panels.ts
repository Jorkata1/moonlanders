import { PADS, ROBOT_UPGRADES, ROBOT_UPGRADE_IDS, UPGRADES, UPGRADE_IDS, type RobotUpgradeId, type UpgradeId } from "./config";
import { buyUpgrade } from "./sim/economy";
import type { Emit } from "./sim/events";
import { buyRobotUpgrade } from "./sim/inventory";
import type { UpgradePanel } from "./hud";
import type { Point } from "./planets/types";
import { distance, type GameState } from "./sim/state";

/** The upgrade panel for wherever the player stands: the workshop, a robot's dock, or nothing. */
export function activePanel(state: GameState, workshopSpot: Point, robotDock: (id: string) => Point | null): UpgradePanel | null {
  if (state.unlocked.has("workshop") && distance(state.player, workshopSpot) <= PADS.radius) {
    return {
      key: "workshop",
      title: "Workshop",
      rows: UPGRADE_IDS.map((id) => ({ id, name: UPGRADES[id].name, description: UPGRADES[id].description, level: state.upgrades[id], max: UPGRADES[id].costs.length, cost: UPGRADES[id].costs[state.upgrades[id]] ?? null })),
    };
  }
  for (const robot of state.robots) {
    const dock = robotDock(robot.id);
    const levels = state.robotUpgrades[robot.id];
    if (!dock || !levels || distance(state.player, dock) > PADS.radius) continue;
    return {
      key: robot.id,
      title: state.planet.unlocks.find((u) => u.id === robot.id)?.label ?? "Robot",
      rows: ROBOT_UPGRADE_IDS.map((id) => ({ id, name: ROBOT_UPGRADES[id].name, description: ROBOT_UPGRADES[id].description, level: levels[id], max: ROBOT_UPGRADES[id].costs.length, cost: ROBOT_UPGRADES[id].costs[levels[id]] ?? null })),
    };
  }
  return null;
}

/** Buy an upgrade from whichever panel the click came from. */
export function buyFromPanel(state: GameState, key: string, id: string, emit: Emit): { ok: true } | { ok: false; reason: string } {
  if (key === "workshop") {
    return (UPGRADE_IDS as readonly string[]).includes(id) ? buyUpgrade(state, id as UpgradeId, emit) : { ok: false, reason: "Unknown upgrade" };
  }
  return (ROBOT_UPGRADE_IDS as readonly string[]).includes(id) ? buyRobotUpgrade(state, key, id as RobotUpgradeId, emit) : { ok: false, reason: "Unknown upgrade" };
}
