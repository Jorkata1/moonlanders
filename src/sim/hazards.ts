import { METEOR, OXYGEN, PLAYER, STORM, oxygenFor } from "../config";
import type { Point } from "../planets/types";
import type { Emit } from "./events";
import { distance, isStormRaging, type GameState } from "./state";

export type Random = () => number;

const SAFE_MARGIN_FROM_DOME = 1;
const AIM_ATTEMPTS = 8;

export function isInsideDome(state: GameState, point: Point): boolean {
  return distance(point, state.planet.dome) <= state.planet.dome.radius;
}

function respawnInDome(state: GameState): void {
  const { player, planet } = state;
  player.x = planet.spawn.x;
  player.z = planet.spawn.z;
  player.carry = [];
  player.oxygen = oxygenFor(state.upgrades.oxygen);
}

export function updateOxygen(state: GameState, dt: number, emit: Emit): void {
  const player = state.player;
  const max = oxygenFor(state.upgrades.oxygen);
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

/** Pick an impact point near the player but never inside the dome, which shields them. */
function aimMeteor(state: GameState, random: Random): Point | null {
  const { bounds, dome } = state.planet;
  for (let attempt = 0; attempt < AIM_ATTEMPTS; attempt += 1) {
    const angle = random() * Math.PI * 2;
    const reach = random() * METEOR.aimJitter;
    const x = Math.min(bounds.maxX - 1, Math.max(bounds.minX + 1, state.player.x + Math.cos(angle) * reach));
    const z = Math.min(bounds.maxZ - 1, Math.max(bounds.minZ + 1, state.player.z + Math.sin(angle) * reach));
    if (distance({ x, z }, dome) > dome.radius + METEOR.radius + SAFE_MARGIN_FROM_DOME) return { x, z };
  }
  return null;
}

function nextInterval(random: Random): number {
  return METEOR.minIntervalSeconds + random() * (METEOR.maxIntervalSeconds - METEOR.minIntervalSeconds);
}

export function updateMeteors(state: GameState, dt: number, emit: Emit, random: Random): void {
  const meteors = state.planet.meteors;
  if (!meteors || !state.unlocked.has(meteors.after)) {
    state.meteorTimer = METEOR.firstDelaySeconds;
    return;
  }

  state.meteorTimer -= dt;
  if (state.meteorTimer <= 0) {
    state.meteorTimer = nextInterval(random);
    const at = isInsideDome(state, state.player) ? null : aimMeteor(state, random);
    if (at) {
      const id = state.nextMeteorId++;
      state.meteors.push({ id, x: at.x, z: at.z, warning: METEOR.warningSeconds });
      emit({ type: "meteorWarning", id, at });
    }
  }

  for (const meteor of state.meteors) {
    meteor.warning -= dt;
    if (meteor.warning > 0) continue;
    const player = state.player;
    const hitPlayer = player.stunned <= 0 && distance(player, meteor) <= METEOR.radius + PLAYER.radius;
    let itemsLost = 0;
    if (hitPlayer) {
      itemsLost = Math.ceil(player.carry.length * METEOR.carryLossRatio);
      player.carry.splice(player.carry.length - itemsLost, itemsLost);
      player.stunned = PLAYER.knockdownSeconds;
    }
    // The meteor leaves a chunk of ore behind: danger with a reward.
    state.deposits.push({
      id: `meteor-${meteor.id}`,
      item: meteors.reward,
      zone: null,
      x: meteor.x,
      z: meteor.z,
      amount: METEOR.rewardOre,
      maxAmount: METEOR.rewardOre,
      regrowTimer: 0,
      temporary: true,
      lifetime: METEOR.chunkLifetimeSeconds,
    });
    emit({ type: "meteorImpact", id: meteor.id, at: meteor, hitPlayer, itemsLost });
  }
  state.meteors = state.meteors.filter((m) => m.warning > 0);
}

/** Calm → warning → raging → calm. Storms only start once the planet's trigger unlock is bought. */
export function updateStorm(state: GameState, dt: number, emit: Emit, random: Random): void {
  const storms = state.planet.storms;
  const storm = state.storm;
  if (!storms || !state.unlocked.has(storms.after)) {
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
