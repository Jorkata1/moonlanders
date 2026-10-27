import { MOON } from "../src/planets/moon";
import { createState } from "../src/sim/state";
import { dropItems, carriedCounts, buyRobotUpgrade } from "../src/sim/inventory";
import { step } from "../src/sim/step";

const s = createState(MOON);
s.player.carry = ["ironOre", "ironOre", "plate", "ironOre"];
const events: string[] = [];
console.log("counts", JSON.stringify(carriedCounts(s.player.carry)));
console.log("drop", JSON.stringify(dropItems(s, "ironOre", 2, (e) => events.push(e.type))), JSON.stringify(s.player.carry), "piles", s.piles.length, s.piles[0]?.items);
console.log("drop missing", JSON.stringify(dropItems(s, "water", 1, () => {})));
// standing still: pile must not be picked back up
for (let i = 0; i < 30; i++) step(s, { x: 0, z: 0 }, 1 / 30);
console.log("after standing", s.player.carry.length, "pile", s.piles[0]?.items.length);
// walk away then back over it
for (let i = 0; i < 20; i++) step(s, { x: 0, z: -1 }, 1 / 30);
const pile = s.piles[0]!;
for (let i = 0; i < 120 && s.piles.length; i++) { const dx = pile.x - s.player.x, dz = pile.z - s.player.z, d = Math.hypot(dx, dz) || 1; step(s, d > 0.3 ? { x: dx / d, z: dz / d } : { x: 0, z: 0 }, 1 / 30); }
console.log("after returning", JSON.stringify(s.player.carry), "piles", s.piles.length);
s.credits = 500;
console.log("robot upgrade locked:", JSON.stringify(buyRobotUpgrade(s, "robot-smelter", "speed", () => {})));
s.unlocked.add("robot-smelter");
console.log("robot upgrade:", JSON.stringify(buyRobotUpgrade(s, "robot-smelter", "speed", () => {})), s.robotUpgrades["robot-smelter"], s.credits);
