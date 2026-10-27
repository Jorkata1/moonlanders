import {
  AUTO_FEED_INTERVAL,
  AUTO_FEED_MIN_LEVEL,
  MACHINE_INPUT_CAPACITY,
  MACHINE_OUTPUT_CAPACITY,
  MACHINE_SPEED_PER_LEVEL,
} from '../config/balance';
import type { MachineDefinition } from '../config/planets/types';
import type { ResourceBag, ResourceId } from '../config/resources';
import { addTo, countOf, entriesOf, hasAll, takeFrom, totalOf } from './inventory';
import type { MachineState } from './state';

export function cycleSecondsAt(definition: MachineDefinition, level: number): number {
  return definition.recipe.cycleSeconds / (1 + MACHINE_SPEED_PER_LEVEL * (level - 1));
}

export function isExtractor(definition: MachineDefinition): boolean {
  return entriesOf(definition.recipe.inputs).length === 0;
}

function hasOutputRoom(definition: MachineDefinition, state: MachineState): boolean {
  return state.output + definition.recipe.outputAmount <= MACHINE_OUTPUT_CAPACITY;
}

function tryStartCycle(definition: MachineDefinition, state: MachineState): boolean {
  if (!hasOutputRoom(definition, state)) return false;
  if (!hasAll(state.input, definition.recipe.inputs)) return false;
  for (const [id, amount] of entriesOf(definition.recipe.inputs)) takeFrom(state.input, id, amount);
  state.running = true;
  state.progress = 0;
  return true;
}

/** Advances production by `dt` seconds and returns the units produced. */
export function tickMachine(definition: MachineDefinition, state: MachineState, dt: number): number {
  if (!state.built) return 0;
  const cycleSeconds = cycleSecondsAt(definition, state.level);
  let remaining = dt;
  let produced = 0;

  while (remaining > 0) {
    if (!state.running && !tryStartCycle(definition, state)) break;
    const secondsToFinish = (1 - state.progress) * cycleSeconds;
    if (remaining < secondsToFinish) {
      state.progress += remaining / cycleSeconds;
      break;
    }
    remaining -= secondsToFinish;
    state.running = false;
    state.progress = 0;
    state.output += definition.recipe.outputAmount;
    produced += definition.recipe.outputAmount;
  }
  return produced;
}

export function acceptsInput(definition: MachineDefinition, state: MachineState, id: ResourceId): boolean {
  if (!state.built || !definition.recipe.inputs[id]) return false;
  return countOf(state.input, id) < MACHINE_INPUT_CAPACITY;
}

/** Moves one accepted unit from the backpack into the machine. */
export function depositOneInput(
  definition: MachineDefinition,
  state: MachineState,
  backpack: ResourceBag,
): ResourceId | null {
  for (const [id] of entriesOf(definition.recipe.inputs)) {
    if (!acceptsInput(definition, state, id) || countOf(backpack, id) === 0) continue;
    takeFrom(backpack, id, 1);
    addTo(state.input, id, 1);
    return id;
  }
  return null;
}

/** Moves one finished unit from the machine into the backpack if there is room. */
export function collectOneOutput(
  definition: MachineDefinition,
  state: MachineState,
  backpack: ResourceBag,
  capacity: number,
): ResourceId | null {
  if (!state.built || state.output <= 0 || totalOf(backpack) >= capacity) return null;
  state.output -= 1;
  addTo(backpack, definition.recipe.output, 1);
  return definition.recipe.output;
}

export function isAutoFeedActive(definition: MachineDefinition, state: MachineState, feeder: MachineState): boolean {
  return state.built && feeder.built && state.level >= AUTO_FEED_MIN_LEVEL && Boolean(definition.autoFeedFrom);
}

/** Conveyor transfer from `feeder` output into `state` input. Returns units moved. */
export function tickAutoFeed(
  definition: MachineDefinition,
  state: MachineState,
  feederDefinition: MachineDefinition,
  feeder: MachineState,
  dt: number,
): number {
  if (!isAutoFeedActive(definition, state, feeder)) {
    state.feedTimer = 0;
    return 0;
  }
  const resource = feederDefinition.recipe.output;
  state.feedTimer = Math.min(state.feedTimer + dt, AUTO_FEED_INTERVAL * 4);
  let moved = 0;
  while (state.feedTimer >= AUTO_FEED_INTERVAL && feeder.output > 0 && acceptsInput(definition, state, resource)) {
    state.feedTimer -= AUTO_FEED_INTERVAL;
    feeder.output -= 1;
    addTo(state.input, resource, 1);
    moved += 1;
  }
  return moved;
}
