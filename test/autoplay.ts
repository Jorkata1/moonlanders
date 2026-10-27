/** Headless bot that plays every planet in order, to check each one can be finished and how long it takes. */
import { PLANETS } from "../src/planets";
import { MOON } from "../src/planets/moon";
import { createState, type GameState } from "../src/sim/state";
import { toSave, fromSave, restoreGame } from "../src/sim/save";
import { startNextPlanet } from "../src/sim/travel";
import { createBot } from "./bot";

const DT = 1 / 30;
const MAX_SECONDS = 3600;

function play(state: GameState): boolean {
  const tick = createBot(state);
  const counts: Record<string, number> = {};
  const timeline: string[] = [];
  let t = 0;
  for (; t < MAX_SECONDS && !state.launched; t += DT) {
    for (const e of tick(DT)) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
      if (e.type === "unlocked" || e.type === "objective" || e.type === "launch" || e.type === "rocketComplete") timeline.push(`${t.toFixed(0)}s ${e.type} ${"id" in e ? e.id : "index" in e ? e.index : ""}`);
    }
  }
  console.log(`\n[${state.planet.name}]`);
  console.log(timeline.join("\n"));
  console.log(`${state.planet.id} finished:`, state.launched, "at", t.toFixed(0), "s; credits", state.credits, "upgrades", JSON.stringify(state.upgrades));
  console.log("events:", JSON.stringify(counts));
  if (!state.launched) console.log("stuck:", JSON.stringify({ rocket: state.rocket, carry: state.player.carry, pos: [state.player.x.toFixed(1), state.player.z.toFixed(1)], machines: [...state.machines.values()], objective: state.objectiveIndex }));
  const restored = fromSave(state.planet, JSON.parse(JSON.stringify(toSave(state))));
  console.log(`${state.planet.id} save roundtrip ok:`, JSON.stringify(toSave(restored)) === JSON.stringify(toSave(state)));
  return state.launched;
}

let state: GameState | null = createState(PLANETS[0]!);
let allFinished = true;
while (state) {
  allFinished = play(state) && allFinished;
  state = state.launched ? startNextPlanet(state) : null;
  if (state) console.log(`travelled to ${state.planet.id} with`, state.credits, "credits and upgrades", JSON.stringify(state.upgrades));
}
console.log("\nfinished:", allFinished);

console.log("bad save tolerated:", fromSave(MOON, { planetId: "moon", credits: -5, unlocked: ["nope", 3], upgrades: { speed: 99 } }).upgrades.speed);
// A save written by version 1.1 (Moon only, no second inputs) must still load.
const legacy = { version: 2, planetId: "moon", credits: 12, unlocked: ["smelter"], paid: {}, upgrades: { speed: 1, capacity: 2, mining: 0, oxygen: 1 }, robotUpgrades: {}, rocket: { plate: 25, water: 16 }, machines: { smelter: { input: 3, output: 1, processed: 9 } }, mined: { ironOre: 40 }, earned: 300, objectiveIndex: 12, launched: true };
const migrated = restoreGame(legacy);
const arrived = migrated.launched ? startNextPlanet(migrated) : null;
console.log("legacy save ok:", migrated.planet.id === "moon" && migrated.machines.get("smelter")?.input === 3 && arrived?.planet.id === "mars" && arrived.credits === 12 && arrived.upgrades.capacity === 2);
console.log("unknown planet falls back:", restoreGame({ planetId: "pluto" }).planet.id === PLANETS[0]!.id);
