import { OXYGEN, STORM, oxygenFor } from "../config";
import type { Point } from "../planets/types";
import type { Emit } from "./events";
import { distance, isStormRaging, type GameState } from "./state";

export type Random = () => number;


export function isInsideDome(state: GameState, point: Point): boolean {
  return distance(point, state.planet.dome) <= state.planet.dome.radius;
}

function respawnInDome(state: GameState): void {
  const { player, planet } = state;
  player.x = planet.spawn.x;
  player.z = planet.spawn.z;
  player.carry = [];
  player.oxygen = oxygenFor(state.suit.oxygen);
}

export function updateOxygen(state: GameState, dt: number, emit: Emit): void {
  const player = state.player;
  const max = oxygenFor(state.suit.oxygen);
  if (isInsideDome(state, player)) {
    player.oxygen = Math.min(max, player.oxygen + OXYGEN.refillPerSecond * dt);
    return;
  }
  const before = player.oxygen;
  const drain = isStormRaging(state) ? STORM.oxygenDrainMultiplier : 1;
  player.oxygen = Math.max(0, player.oxygen - dt * drain);
  const lowLine = max * OXYGEN.lowRatio;
  if (before > lowLine && player.oxygen <= lowLine) emit({ type: "oxygenLow" });
  if (player.oxygen > 0 || before <= 0) return;
  const itemsLost = player.carry.length;
  emit({ type: "oxygenOut", itemsLost });
  respawnInDome(state);
  player.stunned = OXYGEN.respawnSeconds;
}

/** Calm → warning → raging → calm. Storms only start once the planet's trigger build exists. */
export function updateStorm(state: GameState, dt: number, emit: Emit, random: Random): void {
  const storms = state.planet.storms;
  const storm = state.storm;
  if (!storms || !state.built.has(storms.after)) {
    storm.phase = "calm";
    storm.timer = STORM.firstDelaySeconds;
    return;
  }
  storm.timer -= dt;
  if (storm.timer > 0) return;
  switch (storm.phase) {
    case "calm":
      storm.phase = "warning";
      storm.timer = STORM.warningSeconds;
      emit({ type: "stormWarning", seconds: STORM.warningSeconds });
      return;
    case "warning":
      storm.phase = "raging";
      storm.timer = STORM.durationSeconds;
      emit({ type: "stormStart" });
      return;
    case "raging":
      storm.phase = "calm";
      storm.timer = STORM.minCalmSeconds + random() * (STORM.maxCalmSeconds - STORM.minCalmSeconds);
      emit({ type: "stormEnd" });
  }
}
