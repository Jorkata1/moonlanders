import {
  MACHINE_MAX_LEVEL,
  PAD_RADIUS,
  ROCKET_INTERACT_RADIUS,
  SUIT_PAD_OFFSETS,
  UPGRADE_PAD_OFFSET,
} from '../config/balance';
import type { PlanetDefinition, Vec2 } from '../config/planets/types';
import type { ResourceBag, ResourceId } from '../config/resources';
import { offsetBy } from './geometry';
import { addTo, countOf, entriesOf, takeFrom } from './inventory';
import type { PlanetState } from './state';
import {
  SUIT_STATS,
  SUIT_STAT_LABEL,
  describeNextSuitLevel,
  isSuitStatMaxed,
  suitUpgradeCost,
  type SuitLevels,
  type SuitStat,
} from './suit';

export const PadType = {
  Build: 'build',
  Upgrade: 'upgrade',
  Suit: 'suit',
  Rocket: 'rocket',
} as const;
export type PadType = (typeof PadType)[keyof typeof PadType];

export const ROCKET_PAD_ID = 'rocket';

export interface Pad {
  readonly id: string;
  readonly type: PadType;
  readonly title: string;
  readonly subtitle: string;
  readonly position: Vec2;
  readonly radius: number;
  readonly cost: Readonly<ResourceBag>;
  readonly machineId?: string;
  readonly suitStat?: SuitStat;
}

export function buildPadId(machineId: string): string {
  return `build:${machineId}`;
}

export function upgradePadId(machineId: string): string {
  return `upgrade:${machineId}`;
}

export function suitPadId(stat: SuitStat): string {
  return `suit:${stat}`;
}

function machinePads(planet: PlanetDefinition, planetState: PlanetState): Pad[] {
  const pads: Pad[] = [];
  for (const machine of planet.machines) {
    const state = planetState.machines[machine.id];
    if (!state) continue;

    if (!state.built) {
      const unlocked = machine.requires.every((id) => planetState.machines[id]?.built === true);
      if (!unlocked) continue;
      pads.push({
        id: buildPadId(machine.id),
        type: PadType.Build,
        title: `Build ${machine.name}`,
        subtitle: 'Construction site',
        position: machine.position,
        radius: PAD_RADIUS * 1.2,
        cost: machine.buildCost,
        machineId: machine.id,
      });
      continue;
    }

    const upgradeCost = machine.upgradeCosts[state.level - 1];
    if (state.level >= MACHINE_MAX_LEVEL || !upgradeCost) continue;
    const addsConveyor = machine.autoFeedFrom !== undefined && state.level === 1;
    pads.push({
      id: upgradePadId(machine.id),
      type: PadType.Upgrade,
      title: `${machine.name} Lv${state.level + 1}`,
      subtitle: addsConveyor ? 'Faster + conveyor link' : 'Faster production',
      position: offsetBy(machine.position, UPGRADE_PAD_OFFSET),
      radius: PAD_RADIUS,
      cost: upgradeCost,
      machineId: machine.id,
    });
  }
  return pads;
}

function suitPads(planet: PlanetDefinition, suit: Readonly<SuitLevels>): Pad[] {
  const pads: Pad[] = [];
  SUIT_STATS.forEach((stat, index) => {
    const offset = SUIT_PAD_OFFSETS[index];
    if (!offset || isSuitStatMaxed(suit, stat)) return;
    pads.push({
      id: suitPadId(stat),
      type: PadType.Suit,
      title: `${SUIT_STAT_LABEL[stat]} Lv${suit[stat] + 1}`,
      subtitle: describeNextSuitLevel(stat, suit[stat]),
      position: offsetBy(planet.suitStationPosition, offset),
      radius: PAD_RADIUS,
      cost: suitUpgradeCost(planet, suit[stat]),
      suitStat: stat,
    });
  });
  return pads;
}

function rocketPad(planet: PlanetDefinition): Pad {
  return {
    id: ROCKET_PAD_ID,
    type: PadType.Rocket,
    title: 'Rocket',
    subtitle: `Destination: ${planet.destinationName}`,
    position: planet.rocketPosition,
    radius: ROCKET_INTERACT_RADIUS,
    cost: planet.rocketCost,
  };
}

/** All pads currently accepting payment on this planet. */
export function getActivePads(planet: PlanetDefinition, planetState: PlanetState, suit: Readonly<SuitLevels>): Pad[] {
  return [...machinePads(planet, planetState), ...suitPads(planet, suit), rocketPad(planet)];
}

export function remainingCost(cost: Readonly<ResourceBag>, paid: Readonly<ResourceBag>): ResourceBag {
  const remaining: ResourceBag = {};
  for (const [id, amount] of entriesOf(cost)) {
    const left = amount - countOf(paid, id);
    if (left > 0) remaining[id] = left;
  }
  return remaining;
}

export function isCostPaid(cost: Readonly<ResourceBag>, paid: Readonly<ResourceBag>): boolean {
  return entriesOf(remainingCost(cost, paid)).length === 0;
}

/** Fraction of the total cost already paid, in [0, 1]. */
export function paymentProgress(cost: Readonly<ResourceBag>, paid: Readonly<ResourceBag>): number {
  let total = 0;
  let done = 0;
  for (const [id, amount] of entriesOf(cost)) {
    total += amount;
    done += Math.min(amount, countOf(paid, id));
  }
  return total === 0 ? 1 : done / total;
}

/** Moves one needed unit from the backpack into `paid`. */
export function payOneUnit(
  cost: Readonly<ResourceBag>,
  paid: ResourceBag,
  backpack: ResourceBag,
): ResourceId | null {
  for (const [id] of entriesOf(remainingCost(cost, paid))) {
    if (takeFrom(backpack, id, 1) === 0) continue;
    addTo(paid, id, 1);
    return id;
  }
  return null;
}
