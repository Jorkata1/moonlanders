/** Headless bot that plays the Moon to the end, to check the progression can be completed and how long it takes. */
import { MOON } from "../src/planets/moon";
import { createState } from "../src/sim/state";
import { toSave, fromSave } from "../src/sim/save";
import { createBot } from "./bot";

const state = createState(MOON);
const tick = createBot(state);
const DT = 1 / 30;
const counts: Record<string, number> = {};
const timeline: string[] = [];
let t = 0;
for (; t < 3600 && !state.launched; t += DT) {
  for (const e of tick(DT)) {
    counts[e.type] = (counts[e.type] ?? 0) + 1;
    if (e.type === "unlocked" || e.type === "objective" || e.type === "launch" || e.type === "rocketComplete") timeline.push(`${t.toFixed(0)}s ${e.type} ${"id" in e ? e.id : "index" in e ? e.index : ""}`);
  }
}
console.log(timeline.join("\n"));
console.log("finished:", state.launched, "at", t.toFixed(0), "s; credits", state.credits, "upgrades", JSON.stringify(state.upgrades));
console.log("events:", JSON.stringify(counts));
const restored = fromSave(MOON, JSON.parse(JSON.stringify(toSave(state))));
console.log("save roundtrip ok:", JSON.stringify(toSave(restored)) === JSON.stringify(toSave(state)));
console.log("bad save tolerated:", fromSave(MOON, { planetId: "moon", credits: -5, unlocked: ["nope", 3], upgrades: { speed: 99 } }).upgrades.speed);
if (!state.launched) console.log("stuck:", JSON.stringify({ rocket: state.rocket, carry: state.player.carry, pos: [state.player.x.toFixed(1), state.player.z.toFixed(1)], machines: [...state.machines.values()], objective: state.objectiveIndex }));
