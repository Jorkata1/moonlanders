import { DRONE_UPGRADES, DRONE_UPGRADE_IDS, PADS, ROBOT_UPGRADES, ROBOT_UPGRADE_IDS, UPGRADES, UPGRADE_IDS, type DroneUpgradeId, type RobotUpgradeId, type UpgradeId } from "./config";
import { buyDroneUpgrade, isDroneEnabled, setDroneEnabled } from "./sim/drones";
import { buyUpgrade } from "./sim/economy";
import type { Emit } from "./sim/events";
import { buyRobotUpgrade } from "./sim/inventory";
import type { UpgradePanel } from "./hud";
import { DRONE_ICONS, ROBOT_ICONS, WORKSHOP_ICONS } from "./upgradeIcons";
import type { Point } from "./planets/types";
import { distance, type GameState } from "./sim/state";

/** The upgrade panel for wherever the player stands: the workshop, a robot's dock, or nothing. */
export function activePanel(state: GameState, workshopSpot: Point, robotDock: (id: string) => Point | null): UpgradePanel | null {
  if (state.unlocked.has("workshop") && distance(state.player, workshopSpot) <= PADS.radius) {
    return {
      key: "workshop",
      title: "Workshop",
      rows: UPGRADE_IDS.map((id) => ({ id, icon: WORKSHOP_ICONS[id], name: UPGRADES[id].name, description: UPGRADES[id].description, level: state.upgrades[id], max: UPGRADES[id].costs.length, cost: UPGRADES[id].costs[state.upgrades[id]] ?? null })),
    };
  }
  for (const robot of state.robots) {
    const dock = robotDock(robot.id);
    const levels = state.robotUpgrades[robot.id];
    if (!dock || !levels || distance(state.player, dock) > PADS.radius) continue;
    return {
      key: robot.id,
      title: state.planet.unlocks.find((u) => u.id === robot.id)?.label ?? "Robot",
      rows: ROBOT_UPGRADE_IDS.map((id) => ({ id, icon: ROBOT_ICONS[id], name: ROBOT_UPGRADES[id].name, description: ROBOT_UPGRADES[id].description, level: levels[id], max: ROBOT_UPGRADES[id].costs.length, cost: ROBOT_UPGRADES[id].costs[levels[id]] ?? null })),
    };
  }
  for (const drone of state.drones) {
    const dock = robotDock(drone.id);
    const levels = state.droneUpgrades[drone.id];
    if (!dock || !levels || distance(state.player, dock) > PADS.radius) continue;
    return {
      key: drone.id,
      title: state.planet.unlocks.find((u) => u.id === drone.id)?.label ?? "Trader drone",
      toggle: { on: isDroneEnabled(state, drone.id), label: isDroneEnabled(state, drone.id) ? "Selling" : "Paused" },
      rows: DRONE_UPGRADE_IDS.map((id) => ({ id, icon: DRONE_ICONS[id], name: DRONE_UPGRADES[id].name, description: DRONE_UPGRADES[id].description, level: levels[id], max: DRONE_UPGRADES[id].costs.length, cost: DRONE_UPGRADES[id].costs[levels[id]] ?? null })),
    };
  }
  return null;
}

/** Flip a drone between selling and paused from its panel. */
export function toggleFromPanel(state: GameState, key: string): void {
  setDroneEnabled(state, key, !isDroneEnabled(state, key));
}

/** Buy an upgrade from whichever panel the click came from. */
export function buyFromPanel(state: GameState, key: string, id: string, emit: Emit): { ok: true } | { ok: false; reason: string } {
  if (key === "workshop") {
    return (UPGRADE_IDS as readonly string[]).includes(id) ? buyUpgrade(state, id as UpgradeId, emit) : { ok: false, reason: "Unknown upgrade" };
  }
  if (key in state.droneUpgrades) {
    return (DRONE_UPGRADE_IDS as readonly string[]).includes(id) ? buyDroneUpgrade(state, key, id as DroneUpgradeId, emit) : { ok: false, reason: "Unknown upgrade" };
  }
  return (ROBOT_UPGRADE_IDS as readonly string[]).includes(id) ? buyRobotUpgrade(state, key, id as RobotUpgradeId, emit) : { ok: false, reason: "Unknown upgrade" };
}
