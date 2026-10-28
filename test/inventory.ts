/** Focused checks of the materials economy: backpack, orders, robots, the drone, the drill and the drill warm-up. */
import { PLAYER, ROBOT } from "../src/config";
import { MOON } from "../src/planets/moon";
import { carriedCounts, dropItems } from "../src/sim/inventory";
import { isOpenGround, oreFields } from "../src/sim/orefall";
import { orderNeeds, startBuild, startStageUpgrade, startSuitUpgrade } from "../src/sim/orders";
import { setWorkerEnabled } from "../src/sim/robots";
import { createState, isRidgeOpen, machineLevel, type GameState } from "../src/sim/state";
import { step } from "../src/sim/step";

const DT = 1 / 30;
const run = (s: GameState, seconds: number, input = { x: 0, z: 0 }) => {
  for (let t = 0; t < seconds; t += DT) step(s, input, DT);
};
const report = (name: string, ok: boolean, detail: unknown = "") => console.log(`${name}: ${JSON.stringify({ ok, detail })}`);

// Backpack: drop a pile, don't re-pick it while standing on it, pick it up after walking away and back.
const s = createState(MOON);
s.player.carry = ["carbon", "carbon", "clay", "carbon"];
console.log("counts", JSON.stringify(carriedCounts(s.player.carry)));
dropItems(s, "carbon", 2, () => undefined);
run(s, 1);
const keptPile = s.piles.length === 1 && s.player.carry.length === 2;
run(s, 0.7, { x: 0, z: -1 });
const pile = s.piles[0]!;
for (let i = 0; i < 120 && s.piles.length; i++) {
  const dx = pile.x - s.player.x, dz = pile.z - s.player.z, d = Math.hypot(dx, dz) || 1;
  step(s, d > 0.3 ? { x: dx / d, z: dz / d } : { x: 0, z: 0 }, DT);
}
report("drop and pick up", keptPile && s.piles.length === 0 && s.player.carry.length === 4);

// Drill warm-up: nothing for 2 s at a rock, then mining starts.
const w = createState(MOON);
const firstCarbon = MOON.deposits.find((d) => d.item === "carbon")!;
w.player.x = firstCarbon.x; w.player.z = firstCarbon.z + 1.4;
run(w, PLAYER.warmupSeconds - 0.2);
const coldCount = w.player.carry.length;
run(w, 1.5);
report("drill warm-up", coldCount === 0 && w.player.carry.length > 0, { cold: coldCount, after: w.player.carry.length });

// Orders: the workbench order completes when 20 carbon arrive, and only one order runs at a time.
const o = createState(MOON);
o.player.x = MOON.workbench.pad.x; o.player.z = MOON.workbench.pad.z;
o.player.carry = new Array(6).fill("carbon");
run(o, 1);
const partial = orderNeeds(o, "carbon") === 14;
o.order!.delivered.carbon = 19;
o.player.carry = ["carbon", "clay"];
run(o, 1);
const busy = startBuild(o, "smelter", () => undefined);
const second = startSuitUpgrade(o, "capacity", () => undefined);
report("orders", partial && o.built.has("workbench") && busy.ok && !second.ok && o.player.carry.join() === "clay", second.ok ? "" : second.reason);

// Robots only stockpile beside their dock; the cargo drone is the one that carries to the order.
const r = createState(MOON);
for (const id of ["workbench", "smelter", "robot-carbon"]) r.built.add(id);
r.order = null;
run(r, 60);
const stocked = r.stockpiles["robot-carbon"]!;
startBuild(r, "robot-clay", () => undefined);
r.order!.delivered.plate = 20;
run(r, 30);
const robotsAlone = (r.order as GameState["order"])?.delivered.carbon ?? -1;
r.built.add("robot-iron"); r.built.add("drone");
run(r, 90);
report("robots stockpile, drone delivers", stocked > 0 && robotsAlone === 0 && r.built.has("robot-clay"), { stocked, robotsAlone, left: r.stockpiles["robot-carbon"] });

// Switching a robot off parks it; nothing more is mined.
setWorkerEnabled(r, "robot-carbon", false);
run(r, 5);
const parkedMined = r.stats.mined.carbon;
run(r, 20);
report("robot off", r.stats.mined.carbon === parkedMined && r.robots.find((x) => x.id === "robot-carbon")?.phase === "parked");

// Cargo drone: feeds the smelter from the iron robot's stockpile.
const feed = createState(MOON);
for (const id of ["workbench", "smelter", "robot-iron", "drone"]) feed.built.add(id);
feed.order = null;
feed.player.x = MOON.spawn.x; feed.player.z = MOON.spawn.z;
run(feed, 120);
report("drone feeds the smelter", (feed.machines.get("smelter")?.processed ?? 0) > 0, { processed: feed.machines.get("smelter")?.processed, ore: feed.stockpiles["robot-iron"] });

// Cargo drone: flies smelter plates to the active order.
const d = createState(MOON);
for (const id of ["workbench", "smelter", "robot-iron", "drone"]) d.built.add(id);
d.order = null;
d.machines.get("smelter")!.output = 45;
startBuild(d, "smelter-2", () => undefined);
d.order!.delivered.carbon = 90; d.order!.delivered.clay = 25;
run(d, 60);
report("drone delivers plates", d.built.has("smelter-2") && machineLevel(d, "smelter") === 2, { left: orderNeeds(d, "plate") });

// Robot stages: an upgrade order makes the robot faster.
startStageUpgrade(d, "robot-iron", () => undefined);
const stageOrder = d.order as GameState["order"];
report("stage order", stageOrder?.kind === "stage" && stageOrder.targetId === "robot-iron");

// Mining drill: bores through the ridge and opens the way north.
const b = createState(MOON);
for (const id of ["workbench", "smelter", "robot-iron", "smelter-2"]) b.built.add(id);
b.order = null;
startBuild(b, "drill", () => undefined);
b.order!.delivered = { carbon: 150, plate: 70, clay: 39, ironOre: 0, heliumX: 0, heliumCell: 0 };
const drillSite = MOON.builds.find((x) => x.id === "drill")!.site;
b.player.x = drillSite.x; b.player.z = drillSite.z; b.player.carry = ["clay"];
run(b, 1);
const builtDrill = b.built.has("drill") && !isRidgeOpen(b);
run(b, 20);
report("drill opens the ridge", builtDrill && isRidgeOpen(b));

// Material falls back into a mined-out field, only inside the field; iron stays hidden until the smelter.
const f = createState(MOON);
const field = oreFields(MOON).find((x) => x.item === "carbon")!;
for (const node of f.deposits) if (node.item === "carbon") node.amount = 0;
run(f, 60);
const carbon = f.deposits.filter((x) => x.item === "carbon" && x.amount > 0);
const ironHidden = f.deposits.every((x) => x.item !== "ironOre");
report("ore refill", carbon.length === field.capacity && carbon.every((x) => Math.hypot(x.x - field.x, x.z - field.z) <= field.radius + 1e-6) && ironHidden, { nodes: carbon.length });

// Rock never lands in the ridge, off the map or on a building spot, at the start or when it falls.
const offGround = [...MOON.deposits, ...carbon].filter((d) => !isOpenGround(MOON, d)).map((d) => d.id);
report("rocks on open ground", offGround.length === 0, offGround);
console.log("stockpile cap", ROBOT.stockpileCapacity);
