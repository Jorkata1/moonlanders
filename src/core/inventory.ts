import { RESOURCE_IDS, type ResourceBag, type ResourceId } from '../config/resources';

export function countOf(bag: Readonly<ResourceBag>, id: ResourceId): number {
  return bag[id] ?? 0;
}

export function totalOf(bag: Readonly<ResourceBag>): number {
  let total = 0;
  for (const id of RESOURCE_IDS) total += bag[id] ?? 0;
  return total;
}

export function addTo(bag: ResourceBag, id: ResourceId, amount: number): void {
  if (amount <= 0) return;
  bag[id] = countOf(bag, id) + amount;
}

/** Removes up to `amount` of `id` and returns how many were actually taken. */
export function takeFrom(bag: ResourceBag, id: ResourceId, amount: number): number {
  const available = countOf(bag, id);
  const taken = Math.min(available, amount);
  if (taken <= 0) return 0;
  const remaining = available - taken;
  if (remaining === 0) delete bag[id];
  else bag[id] = remaining;
  return taken;
}

/** Non-zero entries in canonical resource order, for stable display. */
export function entriesOf(bag: Readonly<ResourceBag>): Array<[ResourceId, number]> {
  const entries: Array<[ResourceId, number]> = [];
  for (const id of RESOURCE_IDS) {
    const amount = bag[id] ?? 0;
    if (amount > 0) entries.push([id, amount]);
  }
  return entries;
}

export function hasAll(bag: Readonly<ResourceBag>, required: Readonly<ResourceBag>): boolean {
  return entriesOf(required).every(([id, amount]) => countOf(bag, id) >= amount);
}

/** Expands a bag into one entry per unit, in canonical order. */
export function unitsOf(bag: Readonly<ResourceBag>): ResourceId[] {
  const units: ResourceId[] = [];
  for (const [id, amount] of entriesOf(bag)) {
    for (let i = 0; i < amount; i += 1) units.push(id);
  }
  return units;
}
