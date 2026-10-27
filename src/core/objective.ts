import type { MachineDefinition, PlanetDefinition, Vec2 } from '../config/planets/types';
import { resourceName, type ResourceBag, type ResourceId } from '../config/resources';
import { countOf, entriesOf, hasAll, totalOf } from './inventory';
import { acceptsInput } from './machines';
import { PadType, ROCKET_PAD_ID, remainingCost, type Pad } from './pads';
import type { PlanetState } from './state';

export interface Objective {
  readonly text: string;
  readonly target: Vec2 | null;
}

export interface ObjectiveContext {
  readonly planet: PlanetDefinition;
  readonly planetState: PlanetState;
  readonly pads: readonly Pad[];
  readonly backpack: Readonly<ResourceBag>;
  readonly capacity: number;
  readonly isRocketReady: boolean;
  readonly recyclerPosition: Vec2;
}

interface Step extends Objective {
  /** True when completing the step needs free backpack space. */
  readonly needsSpace: boolean;
}

const MAX_PLAN_DEPTH = 4;

function builtProducers(context: ObjectiveContext, resource: ResourceId): MachineDefinition[] {
  return context.planet.machines.filter(
    (machine) => machine.recipe.output === resource && context.planetState.machines[machine.id]?.built === true,
  );
}

/** Works backwards from `resource` to the first thing the player can do right now. */
function planFor(context: ObjectiveContext, resource: ResourceId, depth: number): Step | null {
  if (depth > MAX_PLAN_DEPTH) return null;
  const { planetState, backpack } = context;
  const producers = builtProducers(context, resource);
  const name = resourceName(resource);

  const stocked = producers.find((machine) => (planetState.machines[machine.id]?.output ?? 0) > 0);
  if (stocked) return { text: `Collect ${name} from the ${stocked.name}`, target: stocked.position, needsSpace: true };

  const deposit = context.planet.deposits.find((candidate) => candidate.resource === resource);
  if (deposit) return { text: `Dig ${name} in the marked field`, target: deposit.position, needsSpace: true };

  for (const machine of producers) {
    const state = planetState.machines[machine.id];
    if (!state) continue;
    const carriedInput = entriesOf(machine.recipe.inputs).find(
      ([id]) => countOf(backpack, id) > 0 && acceptsInput(machine, state, id),
    );
    if (carriedInput) {
      return { text: `Bring ${resourceName(carriedInput[0])} to the ${machine.name}`, target: machine.position, needsSpace: false };
    }
    if (state.running || hasAll(state.input, machine.recipe.inputs)) {
      return { text: `Wait at the ${machine.name} for ${name}`, target: machine.position, needsSpace: true };
    }
    const missing = entriesOf(machine.recipe.inputs).find(([id, amount]) => countOf(state.input, id) < amount);
    if (missing) {
      const upstream = planFor(context, missing[0], depth + 1);
      if (upstream) return upstream;
    }
  }
  return null;
}

function goalName(pad: Pad, planet: PlanetDefinition): string {
  if (pad.type === PadType.Rocket) return 'the rocket';
  const machine = planet.machines.find((candidate) => candidate.id === pad.machineId);
  return machine ? `the ${machine.name}` : pad.title;
}

/** The single next step shown to the player, plus where to walk. */
export function getObjective(context: ObjectiveContext): Objective {
  const { planet, planetState, pads, backpack } = context;
  if (context.isRocketReady) {
    return { text: `Rocket ready! Launch to ${planet.destinationName}`, target: planet.rocketPosition };
  }

  const goalPad = pads.find((pad) => pad.type === PadType.Build) ?? pads.find((pad) => pad.id === ROCKET_PAD_ID);
  if (!goalPad) return { text: 'Explore the base', target: null };

  const name = goalName(goalPad, planet);
  const remaining = entriesOf(remainingCost(goalPad.cost, planetState.padPayments[goalPad.id] ?? {}));
  if (remaining.some(([id]) => countOf(backpack, id) > 0)) {
    const verb = goalPad.type === PadType.Rocket ? 'Load' : 'Build';
    return { text: `${verb} ${name}: stand on its pad`, target: goalPad.position };
  }

  const isFull = totalOf(backpack) >= context.capacity;
  for (const [resource] of remaining) {
    const step = planFor(context, resource, 0);
    if (!step) continue;
    if (step.needsSpace && isFull) {
      return { text: 'Backpack full: dump extras in the recycler', target: context.recyclerPosition };
    }
    return { text: step.text, target: step.target };
  }
  return { text: `Head to ${name}`, target: goalPad.position };
}
