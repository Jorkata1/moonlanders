import { findMachine } from '../config/planets';
import type { PlanetDefinition } from '../config/planets/types';
import type { GameEvent } from './events';
import { PadType, type Pad } from './pads';
import type { GameState, PlanetState } from './state';

/**
 * Applies the reward for a fully paid pad and returns the event describing
 * it, or null if the pad refers to something that no longer exists.
 */
export function applyPadCompletion(
  pad: Pad,
  planet: PlanetDefinition,
  planetState: PlanetState,
  state: GameState,
): GameEvent | null {
  // The rocket keeps its payment so it stays "loaded"; other pads start over.
  if (pad.type === PadType.Rocket) return { type: 'rocketReady' };
  delete planetState.padPayments[pad.id];

  if (pad.type === PadType.Suit) {
    if (!pad.suitStat) return null;
    state.suit[pad.suitStat] += 1;
    return { type: 'suitUpgraded', stat: pad.suitStat, level: state.suit[pad.suitStat] };
  }

  const machine = pad.machineId ? findMachine(planet, pad.machineId) : undefined;
  const machineState = machine ? planetState.machines[machine.id] : undefined;
  if (!machine || !machineState) return null;

  if (pad.type === PadType.Build) {
    machineState.built = true;
    machineState.level = 1;
    return { type: 'machineBuilt', machineId: machine.id, name: machine.name };
  }
  machineState.level += 1;
  return { type: 'machineUpgraded', machineId: machine.id, name: machine.name, level: machineState.level };
}
