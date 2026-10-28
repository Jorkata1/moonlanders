/** Headless bot that plays every planet in order, to check each one can be finished and how long it takes. */
import { PLANETS } from "../src/planets";
import { MOON } from "../src/planets/moon";
import { fromSave, restoreGame, toSave } from "../src/sim/save";
import { createState, type GameState } from "../src/sim/state";
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
      if (e.type === "orderComplete") timeline.push(`${t.toFixed(0)}s built ${e.kind}:${e.targetId}`);
      if (e.type === "wallOpen" || e.type === "launch") timeline.push(`${t.toFixed(0)}s ${e.type}`);
      if (e.type === "objective") timeline.push(`${t.toFixed(0)}s objective ${e.index}`);
    }
  }
  console.log(`\n[${state.planet.name}]`);
  console.log(timeline.join("\n"));
  console.log(`${state.planet.id} finished:`, state.launched, "at", t.toFixed(0), "s; suit", JSON.stringify(state.suit), "stages", JSON.stringify(state.stages));
  console.log("mined:", JSON.stringify(state.stats.mined));
  console.log("events:", JSON.stringify(counts));
  if (!state.launched) console.log("stuck:", JSON.stringify({ order: state.order, carry: state.player.carry, pos: [state.player.x.toFixed(1), state.player.z.toFixed(1)], machines: [...state.machines.values()], stockpiles: state.stockpiles, objective: state.objectiveIndex }));
  const restored = fromSave(state.planet, JSON.parse(JSON.stringify(toSave(state))));
  console.log(`${state.planet.id} save roundtrip ok:`, JSON.stringify(toSave(restored)) === JSON.stringify(toSave(state)));
  return state.launched;
}

let state: GameState | null = createState(PLANETS[0]!);
let allFinished = true;
while (state) {
  allFinished = play(state) && allFinished;
  state = state.launched ? startNextPlanet(state) : null;
  if (state) console.log(`travelled to ${state.planet.id} with suit`, JSON.stringify(state.suit));
}
console.log("\nfinished:", allFinished);

console.log("bad save tolerated:", fromSave(MOON, { version: 3, planetId: "moon", built: ["nope", 3, "smelter"], suit: { speed: 99 } }).suit.speed === 2);
// A save from the credits economy (version 2) starts a fresh game instead of loading half-understood data.
const legacy = restoreGame({ version: 2, planetId: "moon", credits: 12, unlocked: ["smelter"], upgrades: { speed: 1 } });
console.log("legacy save starts fresh:", legacy.built.size === 0 && legacy.order?.targetId === "workbench");
console.log("unknown planet falls back:", restoreGame({ planetId: "pluto" }).planet.id === PLANETS[0]!.id);
