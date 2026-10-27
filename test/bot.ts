/** Simple autopilot used by tests and screenshot harnesses. Works on any planet by reading its PlanetDef. */
import { distance, rocketComplete, rocketNeeds, isAvailable, type GameState } from "../src/sim/state";
import { step } from "../src/sim/step";
import { carryCapacity, isPadAvailable, buyUpgrade } from "../src/sim/economy";
import { MACHINE, oxygenFor, ROBOT_UPGRADE_IDS, ROBOT_UPGRADES, UPGRADE_IDS, UPGRADES, type ItemId } from "../src/config";
import { buyRobotUpgrade } from "../src/sim/inventory";
import type { MachineDef, Point } from "../src/planets/types";
import type { SimEvent } from "../src/sim/events";

const FEED_ROOM = MACHINE.inputCapacity;
const KEEP_FED = 15;
const COLLECT_AT = 4;

export function createBot(state: GameState, seed = 42) {
  const planet = state.planet;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rawItems = new Set(planet.deposits.map((d) => d.item));
  const built = (def: MachineDef) => state.unlocked.has(def.id);
  const machine = (def: MachineDef) => state.machines.get(def.id)!;
  const lastMachine = planet.machines[planet.machines.length - 1]!;

  function waypoint(target: Point): Point {
    const ridge = planet.ridge.z;
    const p = state.player;
    if ((p.z > ridge) === (target.z > ridge)) return target;
    const side = p.z > ridge ? 1 : -1;
    if (Math.abs(p.x) > 0.6) return { x: 0, z: ridge + side * 1.6 };
    return { x: 0, z: ridge - side * 1.6 };
  }

  function nearestDeposit(item: ItemId): Point | null {
    let best: Point | null = null, bd = 1e9;
    for (const d of state.deposits) {
      if (d.item !== item || d.amount <= 0 || !isAvailable(state, d.zone)) continue;
      const dist = distance(state.player, d);
      if (dist < bd) { bd = dist; best = d; }
    }
    return best;
  }

  /** Something still needs this item: the rocket, or a built machine with room for it. */
  function wanted(item: ItemId): boolean {
    if (rocketNeeds(state, item) > 0) return true;
    return planet.machines.some((def) => built(def) && ((def.input === item && machine(def).input < KEEP_FED) || (def.secondInput?.item === item && machine(def).secondInput < KEEP_FED)));
  }

  function feedPad(): Point | null {
    const carry = state.player.carry;
    for (const def of planet.machines) {
      if (!built(def)) continue;
      if (carry.includes(def.input) && machine(def).input < FEED_ROOM) return def.inputPad;
      if (def.secondInput && carry.includes(def.secondInput.item) && machine(def).secondInput < FEED_ROOM) return def.secondInput.pad;
    }
    return null;
  }

  function decide(): Point {
    const p = state.player;
    const max = oxygenFor(state.upgrades.oxygen);
    const stormy = state.storm.phase !== "calm";
    if (p.oxygen < max * (stormy ? 0.55 : 0.3) || (distance(p, planet.dome) < planet.dome.radius && p.oxygen < max * 0.95)) return planet.dome;
    if (rocketComplete(state)) return planet.rocket.pad;
    // Follow the mission order like a player would.
    const goal = planet.objectives[state.objectiveIndex]?.check;
    for (const u of planet.unlocks) {
      const isGoal = goal?.kind === "unlocked" && goal.id === u.id;
      if (isGoal && isPadAvailable(state, u) && state.credits >= u.cost - (state.paid.get(u.id) ?? 0)) return u;
    }
    const full = p.carry.length >= carryCapacity(state);
    const rocketOpen = built(lastMachine);
    const carriesRaw = p.carry.some((i) => rawItems.has(i));
    if (rocketOpen && p.carry.some((i) => rocketNeeds(state, i) > 0) && (full || !carriesRaw)) return planet.rocket.pad;
    if (full || (p.carry.length > 0 && !carriesRaw)) return feedPad() ?? planet.sellPad;
    for (const def of planet.machines) {
      if (!built(def) || machine(def).output < COLLECT_AT) continue;
      if (wanted(def.output) || !rocketOpen) return def.outputPad;
    }
    // Mine whatever raw material a hungry machine wants; otherwise the first raw item, for cash.
    const hungry = planet.machines.find((def) => built(def) && rawItems.has(def.input) && machine(def).input < KEEP_FED && wanted(def.output));
    const first = planet.deposits[0]!.item;
    return nearestDeposit(hungry?.input ?? first) ?? nearestDeposit(first) ?? planet.sellPad;
  }

  /** Advance one tick of bot play; returns the sim events. */
  return function tick(dt: number): SimEvent[] {
    // Like a player: grab the first backpack upgrade as soon as the workshop exists, then spend spare money.
    if (state.unlocked.has("workshop") && state.upgrades.capacity === 0 && state.credits >= UPGRADES.capacity.costs[0]!) buyUpgrade(state, "capacity", () => {});
    if (state.unlocked.has(planet.ridge.unlockId) && !built(lastMachine)) for (const id of UPGRADE_IDS) { const c = UPGRADES[id].costs[state.upgrades[id]]; if (c !== undefined && state.credits > c + 150) buyUpgrade(state, id, () => {}); }
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
