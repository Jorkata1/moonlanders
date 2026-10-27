import { describe, expect, it } from 'vitest';
import { MACHINE_INPUT_CAPACITY, MACHINE_OUTPUT_CAPACITY } from '../config/balance';
import { MOON } from '../config/planets/moon';
import type { MachineDefinition } from '../config/planets/types';
import {
  collectOneOutput,
  cycleSecondsAt,
  depositOneInput,
  tickAutoFeed,
  tickMachine,
} from './machines';
import { createMachineState, type MachineState } from './state';

function machine(id: string): MachineDefinition {
  const found = MOON.machines.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`missing machine ${id}`);
  return found;
}

function builtState(overrides: Partial<MachineState> = {}): MachineState {
  return { ...createMachineState(), built: true, ...overrides };
}

describe('tickMachine', () => {
  it('extractors produce without input', () => {
    const drill = machine('regolithDrill');
    const state = builtState();
    const produced = tickMachine(drill, state, drill.recipe.cycleSeconds * 3 + 0.01);
    expect(produced).toBe(3);
    expect(state.output).toBe(3);
  });

  it('does nothing while unbuilt', () => {
    const drill = machine('regolithDrill');
    const state = createMachineState();
    expect(tickMachine(drill, state, 100)).toBe(0);
  });

  it('processors consume inputs per cycle and stop when starved', () => {
    const smelter = machine('smelter');
    const state = builtState({ input: { regolith: 5 } });
    tickMachine(smelter, state, 100);
    expect(state.output).toBe(2);
    expect(state.input.regolith).toBe(1);
  });

  it('stops when the output buffer is full', () => {
    const drill = machine('regolithDrill');
    const state = builtState();
    tickMachine(drill, state, 10_000);
    expect(state.output).toBe(MACHINE_OUTPUT_CAPACITY);
  });

  it('runs faster at higher levels', () => {
    const drill = machine('regolithDrill');
    expect(cycleSecondsAt(drill, 3)).toBeLessThan(cycleSecondsAt(drill, 1));
  });
});

describe('player transfers', () => {
  it('deposits only accepted inputs, up to capacity', () => {
    const smelter = machine('smelter');
    const state = builtState({ input: { regolith: MACHINE_INPUT_CAPACITY - 1 } });
    const backpack = { regolith: 3, ice: 2 };
    expect(depositOneInput(smelter, state, backpack)).toBe('regolith');
    expect(depositOneInput(smelter, state, backpack)).toBeNull();
    expect(backpack).toEqual({ regolith: 2, ice: 2 });
  });

  it('collects output only when the backpack has room', () => {
    const smelter = machine('smelter');
    const state = builtState({ output: 2 });
    const backpack = { regolith: 9 };
    expect(collectOneOutput(smelter, state, backpack, 10)).toBe('metal');
    expect(collectOneOutput(smelter, state, backpack, 10)).toBeNull();
    expect(state.output).toBe(1);
  });
});

describe('tickAutoFeed', () => {
  it('only feeds once the processor is upgraded', () => {
    const smelter = machine('smelter');
    const drill = machine('regolithDrill');
    const feeder = builtState({ output: 10 });
    const level1 = builtState();
    expect(tickAutoFeed(smelter, level1, drill, feeder, 5)).toBe(0);

    const level2 = builtState({ level: 2 });
    const moved = tickAutoFeed(smelter, level2, drill, feeder, 1.3);
    expect(moved).toBe(2);
    expect(feeder.output).toBe(8);
    expect(level2.input.regolith).toBe(2);
  });
});
