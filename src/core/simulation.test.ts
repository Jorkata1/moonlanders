import { describe, expect, it } from 'vitest';
import { MOON } from '../config/planets/moon';
import type { GameEvent } from './events';
import { totalOf } from './inventory';
import { buildPadId, ROCKET_PAD_ID } from './pads';
import { LaunchOutcome, Simulation } from './simulation';
import { createInitialState } from './state';

const STILL = { x: 0, z: 0 };

function createSimulation(): { simulation: Simulation; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const simulation = new Simulation(createInitialState(), (event) => events.push(event));
  return { simulation, events };
}

function stepFor(simulation: Simulation, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.05) simulation.update(0.05, STILL);
}

describe('Simulation', () => {
  it('harvests from a deposit until the backpack is full', () => {
    const { simulation, events } = createSimulation();
    const deposit = MOON.deposits[0];
    if (!deposit) throw new Error('missing deposit');
    simulation.state.player = { ...deposit.position };
    stepFor(simulation, 10);
    expect(totalOf(simulation.state.backpack)).toBe(simulation.suitStats.capacity);
    expect(events.some((event) => event.type === 'backpackFull')).toBe(true);
  });

  it('builds a machine when its pad is fully paid', () => {
    const { simulation, events } = createSimulation();
    const drill = MOON.machines[0];
    if (!drill) throw new Error('missing machine');
    simulation.state.backpack = { regolith: 10 };
    simulation.state.player = { ...drill.position };
    stepFor(simulation, 2);
    expect(simulation.machineState(drill.id)?.built).toBe(true);
    expect(simulation.state.backpack).toEqual({});
    expect(simulation.planetState.padPayments[buildPadId(drill.id)]).toBeUndefined();
    expect(events).toContainEqual({ type: 'machineBuilt', machineId: drill.id, name: drill.name });
  });

  it('resets the player and empties the backpack when oxygen runs out', () => {
    const { simulation, events } = createSimulation();
    simulation.state.player = { x: 25, z: 0 };
    simulation.state.backpack = { regolith: 4 };
    stepFor(simulation, simulation.suitStats.oxygenMax + 1);
    expect(events).toContainEqual({ type: 'oxygenDepleted', lostItems: 4 });
    expect(simulation.state.player).toEqual(MOON.spawn);
    expect(simulation.state.backpack).toEqual({});
  });

  it('launches to the next planet only when the rocket is loaded', () => {
    const { simulation } = createSimulation();
    expect(simulation.launch()).toBe(LaunchOutcome.NotReady);
    simulation.planetState.padPayments[ROCKET_PAD_ID] = { ...MOON.rocketCost };
    expect(simulation.launch()).toBe(LaunchOutcome.NextPlanet);
    expect(simulation.planet.id).toBe('mars');
    expect(simulation.state.backpack).toEqual({});
  });

  it('pushes the player out of built machines', () => {
    const { simulation } = createSimulation();
    const drill = MOON.machines[0];
    if (!drill) throw new Error('missing machine');
    const state = simulation.machineState(drill.id);
    if (!state) throw new Error('missing state');
    state.built = true;
    simulation.state.player = { x: drill.position.x - 3, z: drill.position.z };
    for (let i = 0; i < 40; i += 1) simulation.update(0.05, { x: 1, z: 0 });
    const distance = Math.hypot(
      simulation.state.player.x - drill.position.x,
      simulation.state.player.z - drill.position.z,
    );
    expect(distance).toBeGreaterThan(1.8);
  });
});
