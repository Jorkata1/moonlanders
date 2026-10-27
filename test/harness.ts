/** Renders the real scene after the bot has played for a while, from fixed viewpoints, for visual review. */
import { PerspectiveCamera, Scene, Vector3 } from "three";
import { MOON } from "../src/planets/moon";
import { createState } from "../src/sim/state";
import { createBot } from "./bot";
import { buildWorld } from "../src/view/world";
import { createPlayerView, createRobotsView } from "../src/view/actors";
import { createEffects } from "../src/view/fx";
import { ItemPool } from "../src/view/items";
import { createRenderPipeline, enableShadows } from "../src/view/render";
import { landerModel } from "../src/view/structures";

const params = new URLSearchParams(location.search);
const seconds = Number(params.get("t") ?? "0");
const state = createState(MOON);
const tick = createBot(state);
for (let t = 0; t < seconds; t += 1 / 30) tick(1 / 30);
if (params.get("robots")) {
  state.unlocked.add("robot-smelter");
  state.unlocked.add("robot-purifier");
  state.launched = false;
  state.rocket.plate = 0;
  for (let t = 0; t < 25; t += 1 / 30) tick(1 / 30);
}

const canvas = document.createElement("canvas");
canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%";
document.body.style.margin = "0";
document.body.append(canvas);
const scene = new Scene();
const camera = new PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 400);
const quality = { tier: "high" as const, pixelRatio: 1, shadowLights: 1, shadowMapSize: 2048, bloom: true, msaaSamples: 4 };
const pipeline = createRenderPipeline(canvas, scene, camera, quality);
const pool = new ItemPool();
const world = buildWorld(scene, state, pool, 2048);
const fx = createEffects(scene, pool);
const player = createPlayerView(scene, pool, fx);
const robots = createRobotsView(scene, pool, MOON, fx);
const lander = landerModel();
lander.root.position.copy(world.groundAt({ x: MOON.dome.x + 1.6, z: MOON.dome.z - 0.9 }));
scene.add(lander.root);
enableShadows(scene);
pipeline.applyReflections(scene);
pipeline.resize(innerWidth, innerHeight);

(window as unknown as { show: (x: number, z: number, zoom: number) => void }).show = (x, z, zoom) => {
  state.player.x = x === 999 ? state.player.x : state.player.x;
  for (let i = 0; i < 40; i += 1) {
    world.sync(state, 1 / 30, i / 30);
    player.sync(state, 1 / 30, i / 30);
    robots.sync(state, 1 / 30, i / 30);
    fx.update(1 / 30);
  }
  const target = x === 999 ? new Vector3(state.player.x, 0, state.player.z) : new Vector3(x, 0, z);
  camera.position.copy(target).add(new Vector3(0, 11.5, 8.2).multiplyScalar(zoom));
  camera.lookAt(target.x, 0.6, target.z);
  pipeline.renderer.info.autoReset = false;
  pipeline.renderer.info.reset();
  pipeline.render();
};
(window as unknown as { info: () => string }).info = () => JSON.stringify({ calls: pipeline.renderer.info.render.calls, triangles: pipeline.renderer.info.render.triangles, objects: (() => { let n = 0; scene.traverse(() => n++); return n; })(), unlocked: [...state.unlocked], credits: state.credits, player: [state.player.x.toFixed(1), state.player.z.toFixed(1)], carry: state.player.carry.length, robots: state.robots.length });

(window as unknown as { state: typeof state }).state = state;

(window as unknown as { breakdown: () => string }).breakdown = () => {
  const rows: string[] = [];
  scene.children.forEach((child, index) => {
    let meshes = 0;
    child.traverseVisible((o) => { if ((o as { isMesh?: boolean }).isMesh || (o as { isSprite?: boolean }).isSprite) meshes += 1; });
    if (meshes > 8) rows.push(`${index}:${child.type}:${child.name || child.children.length}:${meshes}`);
  });
  let total = 0;
  scene.traverseVisible((o) => { if ((o as { isMesh?: boolean }).isMesh || (o as { isSprite?: boolean }).isSprite) total += 1; });
  return `total ${total} | ` + rows.join(" ");
};
