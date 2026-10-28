import { DEPOSIT, ORE_FALL, PLAYER } from "../config";
import type { PlanetDef, Point } from "../planets/types";
import type { Emit } from "./events";
import type { Random } from "./hazards";
import { distance, fieldKey, type DepositState, type GameState } from "./state";

/** A patch of ground that ore keeps falling into; derived from the planet's starting deposits. */
export interface OreField extends Point {
  readonly id: string;
  readonly item: DepositState["item"];
  readonly zone: string | null;
  readonly radius: number;
  /** Most nodes the field holds at once, landed or still falling. */
  readonly capacity: number;
}

const fieldCache = new WeakMap<PlanetDef, OreField[]>();

export function oreFields(planet: PlanetDef): OreField[] {
  const cached = fieldCache.get(planet);
  if (cached) return cached;
  const groups = new Map<string, PlanetDef["deposits"][number][]>();
  for (const deposit of planet.deposits) {
    const key = fieldKey(deposit.item, deposit.zone);
    groups.set(key, [...(groups.get(key) ?? []), deposit]);
  }
  const fields = [...groups].map(([id, members]): OreField => {
    const x = members.reduce((sum, d) => sum + d.x, 0) / members.length;
    const z = members.reduce((sum, d) => sum + d.z, 0) / members.length;
    const radius = Math.max(...members.map((d) => distance(d, { x, z }))) + ORE_FALL.fieldPadding;
    const first = members[0] as PlanetDef["deposits"][number];
    return { id, item: first.item, zone: first.zone, x, z, radius, capacity: members.length };
  });
  fieldCache.set(planet, fields);
  return fields;
}

function nextInterval(random: Random): number {
  return ORE_FALL.minIntervalSeconds + random() * (ORE_FALL.maxIntervalSeconds - ORE_FALL.minIntervalSeconds);
}

/** A free landing spot inside the field, away from other nodes, falls and the player. */
function landingSpot(state: GameState, field: OreField, random: Random): Point | null {
  for (let attempt = 0; attempt < ORE_FALL.placementAttempts; attempt += 1) {
    const angle = random() * Math.PI * 2;
    const reach = Math.sqrt(random()) * field.radius;
    const spot = { x: field.x + Math.cos(angle) * reach, z: field.z + Math.sin(angle) * reach };
    const crowded =
      state.deposits.some((d) => distance(d, spot) < ORE_FALL.spacing) ||
      state.falls.some((f) => distance(f, spot) < ORE_FALL.spacing) ||
      distance(state.player, spot) < ORE_FALL.spacing + PLAYER.radius;
    if (!crowded) return spot;
  }
  return null;
}

/** Mined-out nodes crumble; each field tops itself back up with ore dropped from the sky. */
export function updateOreFields(state: GameState, dt: number, emit: Emit, random: Random): void {
  for (const deposit of state.deposits) if (deposit.amount <= 0) deposit.rubble -= dt;
  state.deposits = state.deposits.filter((d) => d.amount > 0 || d.rubble > 0);

  for (const fall of state.falls) {
    fall.timer -= dt;
    if (fall.timer > 0) continue;
    const id = `${fall.field}#${fall.id}`;
    state.deposits.push({ id, item: fall.item, zone: fall.zone, field: fall.field, x: fall.x, z: fall.z, amount: DEPOSIT.amount, maxAmount: DEPOSIT.amount, rubble: 0 });
    emit({ type: "oreLanded", id: fall.id, depositId: id, item: fall.item, at: { x: fall.x, z: fall.z } });
  }
  state.falls = state.falls.filter((f) => f.timer > 0);

  for (const field of oreFields(state.planet)) {
    const standing = state.deposits.filter((d) => d.field === field.id && d.amount > 0).length + state.falls.filter((f) => f.field === field.id).length;
    if (standing >= field.capacity) {
      state.fallTimers[field.id] = Math.max(state.fallTimers[field.id] ?? 0, ORE_FALL.minIntervalSeconds);
      continue;
    }
    const timer = (state.fallTimers[field.id] ?? nextInterval(random)) - dt;
    state.fallTimers[field.id] = timer;
    if (timer > 0) continue;
    const spot = landingSpot(state, field, random);
    state.fallTimers[field.id] = spot ? nextInterval(random) : ORE_FALL.minIntervalSeconds / 2;
    if (!spot) continue;
    const fall = { id: state.nextFallId++, item: field.item, field: field.id, zone: field.zone, x: spot.x, z: spot.z, timer: ORE_FALL.fallSeconds };
    state.falls.push(fall);
    emit({ type: "oreIncoming", id: fall.id, item: fall.item, at: spot, seconds: ORE_FALL.fallSeconds });
  }
}

/** Take one unit from a node; an emptied node turns to rubble for a moment, then disappears. */
export function takeFromDeposit(deposit: DepositState): void {
  deposit.amount -= 1;
  if (deposit.amount <= 0) deposit.rubble = ORE_FALL.rubbleSeconds;
}
