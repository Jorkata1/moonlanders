import { PILE, PLAYER, type ItemId } from "../config";
import { carryCapacity } from "./economy";
import type { Emit } from "./events";
import { buildDef, distance, stockpileSpot, type GameState, type PileState } from "./state";

/** Count of each item type in the backpack, in the order they were first picked up. */
export function carriedCounts(carry: readonly ItemId[]): Array<{ item: ItemId; count: number }> {
  const counts = new Map<ItemId, number>();
  for (const item of carry) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts].map(([item, count]) => ({ item, count }));
}

export type DropResult = { ok: true } | { ok: false; reason: string };

/** Drop items of one type on the ground behind the player, where they can be picked up again. */
export function dropItems(state: GameState, item: ItemId, amount: number, emit: Emit): DropResult {
  const player = state.player;
  if (player.stunned > 0) return { ok: false, reason: "Get back on your feet first" };
  const behind = { x: player.x - Math.sin(player.heading) * PILE.dropDistance, z: player.z - Math.cos(player.heading) * PILE.dropDistance };
  let pile: PileState | undefined = state.piles.find((p) => distance(p, behind) < PILE.mergeRadius);
  if (!pile) {
    pile = { id: state.nextPileId++, x: behind.x, z: behind.z, items: [], held: true };
    state.piles.push(pile);
  }
  pile.held = true;
  let dropped = 0;
  for (let i = player.carry.length - 1; i >= 0 && dropped < amount; i -= 1) {
    if (player.carry[i] !== item) continue;
    player.carry.splice(i, 1);
    pile.items.push(item);
    dropped += 1;
    emit({ type: "dropped", item, at: pile });
  }
  if (dropped === 0) return { ok: false, reason: "You aren't carrying that" };
  state.piles = state.piles.filter((p) => p.items.length > 0);
  return { ok: true };
}

/** Standing on a robot's stockpile fills the backpack from it, one item per transfer tick. */
function pickFromStockpiles(state: GameState, dt: number, emit: Emit): void {
  const player = state.player;
  const robotId = Object.keys(state.stockpiles).find((id) => {
    const build = buildDef(state.planet, id);
    return build !== undefined && state.built.has(id) && (state.stockpiles[id] ?? 0) > 0 && distance(player, stockpileSpot(build)) <= PILE.pickupRadius;
  });
  const build = robotId ? buildDef(state.planet, robotId) : undefined;
  if (!robotId || !build?.item) {
    player.stockpileTimer = 0;
    return;
  }
  player.stockpileTimer += dt;
  while (player.stockpileTimer >= PLAYER.transferInterval && (state.stockpiles[robotId] ?? 0) > 0 && player.carry.length < carryCapacity(state)) {
    player.stockpileTimer -= PLAYER.transferInterval;
    state.stockpiles[robotId] = (state.stockpiles[robotId] ?? 0) - 1;
    player.carry.push(build.item);
    emit({ type: "pickedUp", item: build.item, from: stockpileSpot(build) });
  }
}

/** Walking over a pile picks it back up, one item per transfer tick. */
export function updatePiles(state: GameState, dt: number, emit: Emit): void {
  const player = state.player;
  for (const pile of state.piles) {
    const d = distance(player, pile);
    if (pile.held && d > PILE.releaseRadius) pile.held = false;
  }
  if (player.stunned > 0) return;
  pickFromStockpiles(state, dt, emit);
  const pile = state.piles.find((p) => !p.held && distance(player, p) <= PILE.pickupRadius);
  if (!pile) return;
  pile.pickupTimer = (pile.pickupTimer ?? 0) + dt;
  while ((pile.pickupTimer ?? 0) >= PLAYER.transferInterval && pile.items.length > 0 && player.carry.length < carryCapacity(state)) {
    pile.pickupTimer = (pile.pickupTimer ?? 0) - PLAYER.transferInterval;
    const item = pile.items.pop() as ItemId;
    player.carry.push(item);
    emit({ type: "pickedUp", item, from: pile });
  }
  state.piles = state.piles.filter((p) => p.items.length > 0);
}
