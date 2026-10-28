import { ITEMS, type ItemId } from "../config";

/** Mission text listing the rocket's parts, built from the same numbers the game checks. */
export function rocketPartsText(verb: string, parts: Readonly<Partial<Record<ItemId, number>>>): string {
  const list = (Object.entries(parts) as Array<[ItemId, number]>).map(([item, count]) => `${count} ${ITEMS[item].plural.toLowerCase()}`);
  return `${verb}: ${list.join(" and ")}`;
}
