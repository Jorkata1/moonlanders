import { MOON } from "../src/planets/moon";
import { createState } from "../src/sim/state";
import { dropItems, carriedCounts, buyRobotUpgrade } from "../src/sim/inventory";
import { step } from "../src/sim/step";
import { setDroneEnabled } from "../src/sim/drones";
import { oreFields } from "../src/sim/orefall";

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

// Trader drone: sells smelter output to Zix while enabled, stops when paused.
const d = createState(MOON);
d.unlocked.add("smelter");
d.unlocked.add("drone-smelter");
d.machines.get("smelter")!.output = 6;
for (let i = 0; i < 30 * 40; i++) step(d, { x: 0, z: 0 }, 1 / 30);
console.log("drone sold:", JSON.stringify({ ok: d.credits > 0 && d.machines.get("smelter")!.output === 0, credits: d.credits, phase: d.drones[0]?.phase }));
setDroneEnabled(d, "drone-smelter", false);
d.machines.get("smelter")!.output = 6;
const before = d.credits;
for (let i = 0; i < 30 * 20; i++) step(d, { x: 0, z: 0 }, 1 / 30);
console.log("drone paused:", JSON.stringify({ ok: d.credits === before && d.machines.get("smelter")!.output === 6, phase: d.drones[0]?.phase }));

// Ore falls: mine a field empty and new nodes drop back in, only inside the field.
const f = createState(MOON);
const field = oreFields(MOON).find((x) => x.item === "ironOre")!;
for (const node of f.deposits) if (node.item === "ironOre") node.amount = 0;
f.player.x = 0; f.player.z = 3;
for (let i = 0; i < 30 * 60; i++) step(f, { x: 0, z: 0 }, 1 / 30);
const iron = f.deposits.filter((x) => x.item === "ironOre" && x.amount > 0);
console.log("ore refill:", JSON.stringify({ ok: iron.length === field.capacity && iron.every((x) => Math.hypot(x.x - field.x, x.z - field.z) <= field.radius + 1e-6), nodes: iron.length }));
