import { PADS } from "../config";
import type { ObjectiveCheck } from "../planets/types";
import { updateBoring } from "./drill";
import { updateDrones } from "./drones";
import { updateMachines, updatePlayerMining, updateTransfers } from "./economy";
import { updateOreFields } from "./orefall";
import type { Emit, SimEvent } from "./events";
import { updateOxygen, updateStorm, type Random } from "./hazards";
import { movePlayer, type MoveInput } from "./movement";
import { updatePiles } from "./inventory";
import { updateRobots } from "./robots";
import { distance, rocketReady, type GameState } from "./state";

const MAX_STEP_SECONDS = 0.05;

function objectiveMet(state: GameState, check: ObjectiveCheck): boolean {
  switch (check.kind) {
    case "mined":
      return state.stats.mined[check.item] >= check.count;
    case "built":
      return state.built.has(check.id);
    case "builtAny":
      return check.ids.some((id) => state.built.has(id));
    case "processed":
      return (state.machines.get(check.machineId)?.processed ?? 0) >= check.count;
    case "suitUpgraded":
      return state.suit[check.id] > 0;
    case "launched":
      return state.launched;
  }
}

function updateObjectives(state: GameState, emit: Emit): void {
  const objectives = state.planet.objectives;
  while (state.objectiveIndex < objectives.length) {
    const current = objectives[state.objectiveIndex];
    if (!current || !objectiveMet(state, current.check)) return;
    state.objectiveIndex += 1;
    emit({ type: "objective", index: state.objectiveIndex });
  }
}

function updateLaunch(state: GameState, emit: Emit): void {
  if (state.launched || !rocketReady(state) || state.player.stunned > 0) return;
  if (distance(state.player, state.planet.rocket.pad) > PADS.radius) return;
  state.launched = true;
  emit({ type: "launch" });
}

function stepOnce(state: GameState, input: MoveInput, dt: number, emit: Emit, random: Random): void {
  state.time += dt;
  state.boostSeconds = Math.max(0, state.boostSeconds - dt);
  state.player.stunned = Math.max(0, state.player.stunned - dt);
  movePlayer(state, input, dt);
  updateOreFields(state, dt, emit, random);
  updatePlayerMining(state, dt, emit);
  updateTransfers(state, dt, emit);
  updatePiles(state, dt, emit);
  updateMachines(state, dt);
  updateBoring(state, dt, emit);
  updateRobots(state, dt, emit);
  updateOxygen(state, dt, emit);
  updateDrones(state, dt, emit);
  updateStorm(state, dt, emit, random);
  updateLaunch(state, emit);
  updateObjectives(state, emit);
}

/** Advance the simulation, splitting long frames so nothing tunnels or skips. Returns this frame's events. */
export function step(state: GameState, input: MoveInput, dt: number, random: Random = Math.random): SimEvent[] {
  const events: SimEvent[] = [];
  if (state.launched) return events;
  const emit: Emit = (event) => events.push(event);
  let remaining = dt;
  while (remaining > 1e-6) {
    const slice = Math.min(MAX_STEP_SECONDS, remaining);
    stepOnce(state, input, slice, emit, random);
    remaining -= slice;
    if (state.launched) break;
  }
  return events;
}
