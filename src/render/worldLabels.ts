import { Vector3 } from 'three';
import { MACHINE_INPUT_CAPACITY } from '../config/balance';
import type { MachineDefinition } from '../config/planets/types';
import { resourceColorCss, resourceName, type ResourceBag } from '../config/resources';
import { distanceBetween } from '../core/geometry';
import { countOf, entriesOf } from '../core/inventory';
import { PadType, type Pad } from '../core/pads';
import type { Simulation } from '../core/simulation';
import type { MachineState } from '../core/state';
import { LabelVariant, type LabelContent, type LabelLayer, type LabelLine } from './labelLayer';
import { PAD_COLORS } from './props';

const PAD_LABEL_RANGE = 15;
const MACHINE_LABEL_RANGE = 8;
const DEPOSIT_LABEL_RANGE = 9;
const PAD_LABEL_HEIGHT = 1.1;
const ROCKET_LABEL_HEIGHT = 6.4;
const MACHINE_LABEL_HEIGHT = 3.6;
const DEPOSIT_LABEL_HEIGHT = 2;
const RECYCLER_LABEL_HEIGHT = 1.4;

const anchor = new Vector3();

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function costLines(cost: Readonly<ResourceBag>, paid: Readonly<ResourceBag>): LabelLine[] {
  return entriesOf(cost).map(([id, amount]) => {
    const done = Math.min(amount, countOf(paid, id));
    return { text: `${done}/${amount} ${resourceName(id)}`, swatch: resourceColorCss(id), isDone: done >= amount };
  });
}

function padContent(pad: Pad, simulation: Simulation): LabelContent {
  const paid = simulation.planetState.padPayments[pad.id] ?? {};
  const isReadyRocket = pad.type === PadType.Rocket && simulation.isRocketReady;
  return {
    variant: LabelVariant.Pad,
    title: isReadyRocket ? 'Rocket ready!' : pad.title,
    subtitle: isReadyRocket ? `Press Launch to fly to ${simulation.planet.destinationName}` : pad.subtitle,
    lines: isReadyRocket ? [] : costLines(pad.cost, paid),
    accent: hex(PAD_COLORS[pad.type]),
  };
}

function machineContent(machine: MachineDefinition, state: MachineState): LabelContent {
  const lines: LabelLine[] = entriesOf(machine.recipe.inputs).map(([id, perCycle]) => ({
    text: `In ${countOf(state.input, id)}/${MACHINE_INPUT_CAPACITY} ${resourceName(id)} (${perCycle}/cycle)`,
    swatch: resourceColorCss(id),
  }));
  lines.push({
    text: `Out ${state.output} ${resourceName(machine.recipe.output)}`,
    swatch: resourceColorCss(machine.recipe.output),
  });
  return {
    variant: LabelVariant.Machine,
    title: `${machine.name} · Lv${state.level}`,
    lines,
  };
}

/** Refreshes every world-anchored label for the current frame. */
export function updateWorldLabels(layer: LabelLayer, simulation: Simulation): void {
  const player = simulation.state.player;
  layer.beginFrame();

  for (const pad of simulation.pads) {
    if (distanceBetween(player, pad.position) > PAD_LABEL_RANGE) continue;
    const height = pad.type === PadType.Rocket ? ROCKET_LABEL_HEIGHT : PAD_LABEL_HEIGHT;
    anchor.set(pad.position.x, height, pad.position.z);
    layer.show(`pad:${pad.id}`, anchor, padContent(pad, simulation));
  }

  for (const machine of simulation.planet.machines) {
    const state = simulation.machineState(machine.id);
    if (!state?.built || distanceBetween(player, machine.position) > MACHINE_LABEL_RANGE) continue;
    anchor.set(machine.position.x, MACHINE_LABEL_HEIGHT, machine.position.z);
    layer.show(`machine:${machine.id}`, anchor, machineContent(machine, state));
  }

  for (const deposit of simulation.planet.deposits) {
    if (distanceBetween(player, deposit.position) > DEPOSIT_LABEL_RANGE) continue;
    anchor.set(deposit.position.x, DEPOSIT_LABEL_HEIGHT, deposit.position.z);
    layer.show(`deposit:${deposit.id}`, anchor, {
      variant: LabelVariant.Deposit,
      title: resourceName(deposit.resource),
      subtitle: 'Stand inside the ring to dig',
      lines: [],
      accent: resourceColorCss(deposit.resource),
    });
  }

  const recycler = simulation.recyclerPosition;
  if (distanceBetween(player, recycler) <= PAD_LABEL_RANGE) {
    anchor.set(recycler.x, RECYCLER_LABEL_HEIGHT, recycler.z);
    layer.show('recycler', anchor, {
      variant: LabelVariant.Pad,
      title: 'Recycler',
      subtitle: 'Stand here to dump your backpack',
      lines: [],
      accent: 'var(--color-error)',
    });
  }

  layer.endFrame();
}
