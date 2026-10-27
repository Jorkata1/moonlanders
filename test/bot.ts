/** Simple autopilot used by tests and screenshot harnesses. */
import { MOON } from "../src/planets/moon";
import { distance, rocketComplete, rocketNeeds, isAvailable, type GameState } from "../src/sim/state";
import { step } from "../src/sim/step";
import { carryCapacity, isPadAvailable, buyUpgrade } from "../src/sim/economy";
import { oxygenFor, ROBOT_UPGRADE_IDS, ROBOT_UPGRADES, UPGRADE_IDS, UPGRADES } from "../src/config";
import { buyRobotUpgrade } from "../src/sim/inventory";
import type { Point } from "../src/planets/types";
import type { SimEvent } from "../src/sim/events";

export function createBot(state: GameState, seed = 42) {
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  function waypoint(target: Point): Point {
    const ridge = MOON.ridge.z;
    const p = state.player;
    if ((p.z > ridge) === (target.z > ridge)) return target;
    const side = p.z > ridge ? 1 : -1;
    if (Math.abs(p.x) > 0.6) return { x: 0, z: ridge + side * 1.6 };
    return { x: 0, z: ridge - side * 1.6 };
  }

  function nearestDeposit(item: string): Point | null {
    let best: Point | null = null, bd = 1e9;
    for (const d of state.deposits) {
      if (d.item !== item || d.amount <= 0 || !isAvailable(state, d.zone)) continue;
      const dist = distance(state.player, d);
      if (dist < bd) { bd = dist; best = d; }
    }
    return best;
  }

  function decide(): Point {
    const p = state.player;
    const max = oxygenFor(state.upgrades.oxygen);
    if (p.oxygen < max * 0.3 || (distance(p, MOON.dome) < MOON.dome.radius && p.oxygen < max * 0.95)) return MOON.dome;
    if (rocketComplete(state)) return MOON.rocket.pad;
    // Follow the mission order like a player would; optional unlocks only once the main line is done.
    const goal = MOON.objectives[state.objectiveIndex]?.check;
    const mainLineDone = false;
    for (const u of MOON.unlocks) {
      const wanted = (goal?.kind === "unlocked" && goal.id === u.id) || mainLineDone;
      if (wanted && isPadAvailable(state, u) && state.credits >= u.cost - (state.paid.get(u.id) ?? 0)) return u;
    }
    const full = p.carry.length >= carryCapacity(state);
    const pathOpen = state.unlocked.has("purifier");
    if (pathOpen && p.carry.some((i) => rocketNeeds(state, i) > 0) && (full || !p.carry.some((i) => i === "ironOre" || i === "ice"))) return MOON.rocket.pad;
    const smelter = MOON.machines[0]!, purifier = MOON.machines[1]!;
    if (full || (p.carry.length > 0 && p.carry.every((i) => i === "plate" || i === "water"))) {
      if (p.carry.includes("ironOre") && state.unlocked.has("smelter") && state.machines.get("smelter")!.input < 20) return smelter.inputPad;
      if (p.carry.includes("ice") && state.unlocked.has("purifier") && state.machines.get("purifier")!.input < 20) return purifier.inputPad;
      return MOON.sellPad;
    }
    if (state.unlocked.has("purifier") && state.machines.get("purifier")!.output >= 4 && rocketNeeds(state, "water") > 0) return purifier.outputPad;
    if (state.unlocked.has("smelter") && state.machines.get("smelter")!.output >= 6 && (rocketNeeds(state, "plate") > 0 || !state.unlocked.has("purifier"))) return smelter.outputPad;
    const wantIce = state.unlocked.has("purifier") && rocketNeeds(state, "water") > 0 && state.machines.get("purifier")!.input < 15;
    return nearestDeposit(wantIce ? "ice" : "ironOre") ?? MOON.sellPad;
  }

  /** Advance one tick of bot play; returns the sim events. */
  return function tick(dt: number): SimEvent[] {
    // Like a player: grab the first backpack upgrade as soon as the workshop exists, then spend spare money.
    if (state.unlocked.has("workshop") && state.upgrades.capacity === 0 && state.credits >= UPGRADES.capacity.costs[0]!) buyUpgrade(state, "capacity", () => {});
    if (state.unlocked.has("path") && !state.unlocked.has("purifier")) for (const id of UPGRADE_IDS) { const c = UPGRADES[id].costs[state.upgrades[id]]; if (c !== undefined && state.credits > c + 150) buyUpgrade(state, id, () => {}); }
    for (const robotId of Object.keys(state.robotUpgrades)) {
      if (!state.unlocked.has(robotId) || (typeof process === "undefined" || process.env.ROBOT_UPGRADES !== "1")) continue;
      for (const id of ROBOT_UPGRADE_IDS) { const c = ROBOT_UPGRADES[id].costs[state.robotUpgrades[robotId]![id]]; if (c !== undefined && state.credits > c + 200) buyRobotUpgrade(state, robotId, id, () => {}); }
    }
    const target = waypoint(decide());
    const dx = target.x - state.player.x, dz = target.z - state.player.z;
    const d = Math.hypot(dx, dz);
    const input = d < 0.3 ? { x: 0, z: 0 } : { x: dx / d, z: dz / d };
    return step(state, input, dt, random);
  };
}
