import { describe, expect, it } from 'vitest';
import { PLANETS } from '../config/planets';
import type { GameEvent } from './events';
import { LaunchOutcome, Simulation } from './simulation';
import { createInitialState } from './state';

const STEP_SECONDS = 0.05;
const STILL = { x: 0, z: 0 };
const MAX_ACTIONS = 4000;

function stepFor(simulation: Simulation, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP_SECONDS) simulation.update(STEP_SECONDS, STILL);
}

/**
 * A bot that only ever does what the on-screen objective says. If the
 * campaign completes, the objective guidance can never dead-end a player.
 */
describe('full campaign', () => {
  it('can be completed by following the objective alone', () => {
    const events: GameEvent[] = [];
    const simulation = new Simulation(createInitialState(), (event) => events.push(event));
    const launches: string[] = [];

    for (let action = 0; action < MAX_ACTIONS && !simulation.state.completed; action += 1) {
      if (simulation.isRocketReady) {
        launches.push(simulation.planet.id);
        const outcome = simulation.launch();
        expect(outcome).not.toBe(LaunchOutcome.NotReady);
        continue;
      }
      const { target, text } = simulation.objective;
      if (!target) throw new Error(`Objective has no target: ${text}`);
      simulation.state.player = { ...target };
      stepFor(simulation, 2);
      // Return to the dome to refill so the bot is never rescued mid-task.
      simulation.state.player = { ...simulation.planet.spawn };
      stepFor(simulation, 1.5);
    }

    expect(simulation.state.completed).toBe(true);
    expect(launches).toEqual(PLANETS.map((planet) => planet.id));
    expect(events.some((event) => event.type === 'oxygenDepleted')).toBe(false);
  });
});
