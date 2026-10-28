/** Simple autopilot used by tests and screenshot harnesses: plays the materials economy like a player would. */
import { PADS, oxygenFor, type ItemId, type SuitUpgradeId } from "../src/config";
import type { MachineDef, Point } from "../src/planets/types";
import { carryCapacity, machineStats } from "../src/sim/economy";
import { carriedCounts, dropItems } from "../src/sim/inventory";
import type { SimEvent } from "../src/sim/events";
import { routeToward } from "../src/sim/movement";
import { orderNeeds, orderSite, startBuild, startStageUpgrade, startSuitUpgrade } from "../src/sim/orders";
import { buildDef, distance, isAvailable, rocketReady, stockpileSpot, type GameState } from "../src/sim/state";
import { step } from "../src/sim/step";

type Plan = { kind: "build"; id: string } | { kind: "suit"; id: SuitUpgradeId } | { kind: "stage"; id: string };

/** The order a sensible player builds things in. */
const PLAN: readonly Plan[] = [
  { kind: "build", id: "workbench" },
  { kind: "build", id: "smelter" },
  { kind: "suit", id: "capacity" },
  { kind: "build", id: "robot-carbon" },
  { kind: "build", id: "robot-iron" },
  { kind: "build", id: "drone" },
  { kind: "suit", id: "oxygen" },
  { kind: "build", id: "robot-clay" },
  { kind: "build", id: "smelter-2" },
  { kind: "stage", id: "robot-carbon" },
  { kind: "suit", id: "capacity" },
  { kind: "suit", id: "oxygen" },
  { kind: "build", id: "drill" },
  { kind: "stage", id: "robot-carbon" },
  { kind: "stage", id: "drone" },
  { kind: "build", id: "refinery" },
  { kind: "build", id: "jumpDrive" },
];

/** Gather the slowest-to-make materials first. */
const PRIORITY: readonly ItemId[] = ["heliumCell", "plate", "clay", "carbon"];

export function createBot(state: GameState, seed = 42) {
  const planet = state.planet;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let planIndex = 0;
  const machineFor = (output: ItemId): MachineDef | undefined => planet.machines.find((m) => m.output === output);
  const carried = (item: ItemId) => state.player.carry.filter((i) => i === item).length;

  /** How many times this plan's upgrade appears up to and including it, i.e. the level it aims for. */
  function targetLevel(index: number): number {
    const plan = PLAN[index] as Plan;
    return PLAN.slice(0, index + 1).filter((p) => p.kind === plan.kind && p.id === plan.id).length;
  }

  function planDone(index: number): boolean {
    const plan = PLAN[index] as Plan;
    if (plan.kind === "build") return state.built.has(plan.id);
    if (plan.kind === "suit") return state.suit[plan.id] >= targetLevel(index);
    return (state.stages[plan.id] ?? 0) >= targetLevel(index);
  }

  /** Walk to where the next order is placed, and place it once there. */
  function orderNext(): Point | null {
    while (planIndex < PLAN.length && planDone(planIndex)) planIndex += 1;
    const plan = PLAN[planIndex];
    if (!plan) return null;
    const station = plan.kind === "suit" ? planet.suitStation.pad : plan.kind === "stage" ? (buildDef(planet, plan.id)?.site ?? planet.workbench.pad) : planet.workbench.pad;
    if (distance(state.player, station) > PADS.radius) return station;
    const ignore = () => undefined;
    if (plan.kind === "build") startBuild(state, plan.id, ignore);
    else if (plan.kind === "suit") startSuitUpgrade(state, plan.id, ignore);
    else startStageUpgrade(state, plan.id, ignore);
    return station;
  }

  function nearestDeposit(item: ItemId): Point | null {
    let best: Point | null = null;
    let bestDistance = Infinity;
    for (const d of state.deposits) {
      if (d.item !== item || d.amount <= 0 || !isAvailable(state, d.zone)) continue;
      const dist = distance(state.player, d);
      if (dist < bestDistance) {
        bestDistance = dist;
        best = d;
      }
    }
    return best;
  }

  /** A robot stockpile of `item` worth walking to. */
  function stockpileOf(item: ItemId, want: number): Point | null {
    for (const id of Object.keys(state.stockpiles)) {
      const build = buildDef(planet, id);
      if (build?.item === item && (state.stockpiles[id] ?? 0) >= Math.min(want, 6)) return stockpileSpot(build);
    }
    return null;
  }

  /** Get a machine's output: collect it if there is some, otherwise mine a full load and feed the input. */
  function produce(def: MachineDef, wanted: number): Point {
    const machine = state.machines.get(def.id);
    if (!machine || machine.output > 0) return def.outputPad;
    const free = carryCapacity(state) - state.player.carry.length;
    const stillToFeed = Math.max(0, wanted * def.inputPerItem - machine.input);
    const room = machineStats(state, def).inputCapacity - machine.input;
    const load = carried(def.input);
    if (load > 0 && room > 0 && (free === 0 || load >= Math.min(stillToFeed, room))) return def.inputPad;
    if (stillToFeed > load) return nearestDeposit(def.input) ?? def.outputPad;
    return load > 0 ? def.inputPad : def.outputPad;
  }

  function decide(): Point {
    const p = state.player;
    const max = oxygenFor(state.suit.oxygen);
    if (p.oxygen < max * 0.3 || (distance(p, planet.dome) < planet.dome.radius && p.oxygen < max * 0.95)) return planet.dome;
    if (rocketReady(state)) return planet.rocket.pad;
    if (!state.order) return orderNext() ?? planet.workbench.pad;

    const full = p.carry.length >= carryCapacity(state);
    const site = orderSite(state, state.order);
    const remaining = (item: ItemId) => orderNeeds(state, item) - carried(item);
    const carriesNeeded = p.carry.some((item) => orderNeeds(state, item) > 0);
    const want = PRIORITY.find((item) => remaining(item) > 0);
    // Once at the hologram, stay until everything useful is handed over.
    if (carriesNeeded && (full || !want || distance(p, site) <= PADS.radius)) return site;
    // Raw inputs go into their machine once the backpack is full (and are all unloaded once there).
    for (const def of planet.machines) {
      if (!state.built.has(def.id) || carried(def.input) === 0) continue;
      const room = (state.machines.get(def.id)?.input ?? 0) < machineStats(state, def).inputCapacity;
      if (room && (full || distance(p, def.inputPad) <= PADS.radius)) return def.inputPad;
    }
    if (!want) return site;
    const maker = machineFor(want);
    if (maker) return state.built.has(maker.id) ? produce(maker, remaining(want)) : site;
    return stockpileOf(want, remaining(want)) ?? nearestDeposit(want) ?? site;
  }

  /** Advance one tick of bot play; returns the sim events. */
  /** A backpack full of things nothing wants (picked up by walking over a stockpile) gets emptied. */
  function dropUseless(): void {
    const p = state.player;
    if (p.carry.length < carryCapacity(state)) return;
    const useful = (item: ItemId) => orderNeeds(state, item) > 0 || planet.machines.some((m) => state.built.has(m.id) && m.input === item);
    if (p.carry.some(useful)) return;
    const most = carriedCounts(p.carry).sort((a, b) => b.count - a.count)[0];
    if (most) dropItems(state, most.item, most.count, () => undefined);
  }

  return function tick(dt: number): SimEvent[] {
    dropUseless();
    const goal = decide();
    const target = routeToward(state, state.player, goal);
    const dx = target.x - state.player.x;
    const dz = target.z - state.player.z;
    const d = Math.hypot(dx, dz);
    const input = d < 0.3 ? { x: 0, z: 0 } : { x: dx / d, z: dz / d };
    return step(state, input, dt, random);
  };
}
