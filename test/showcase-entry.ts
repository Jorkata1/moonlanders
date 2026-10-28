// Model showcase: each old model beside its redesign, under the same light, for side-by-side review.
import { Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, Vector3, type Object3D } from "three";
import { astronautModel, robotModel } from "../src/view/characters";
import { smelterModel } from "../src/view/machines";
import { createRenderPipeline, enableShadows } from "../src/view/render";
import { rocketModel } from "../src/view/rocket";
import { regolithNormalTexture, regolithTexture } from "../src/view/textures";
import { astronautModelV2 } from "../src/view/v2/astronaut";
import { droneModelV2 } from "../src/view/v2/drone";
import { robotModelV2 } from "../src/view/v2/robot";
import { rocketModelV2 } from "../src/view/v2/rocket";
import { smelterModelV2 } from "../src/view/v2/smelter";
import { box, glow, mesh, surface } from "../src/view/materials";
import { CylinderGeometry, SphereGeometry, TorusGeometry } from "three";

const canvas = document.createElement("canvas");
canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%";
document.body.style.margin = "0";
document.body.append(canvas);
const scene = new Scene();
scene.background = new Color(0x070914);
const camera = new PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 400);
const quality = { tier: "high" as const, pixelRatio: 1, shadowLights: 1, shadowMapSize: 2048, bloom: true, msaaSamples: 4 };
const pipeline = createRenderPipeline(canvas, scene, camera, quality);
pipeline.renderer.toneMappingExposure = 0.72;

const groundMaterial = new MeshStandardMaterial({ color: 0x6a6d82, map: regolithTexture(12), normalMap: regolithNormalTexture(16), roughness: 0.95 });
groundMaterial.normalScale.set(2.4, 2.4);
const ground = new Mesh(new PlaneGeometry(120, 120).rotateX(-Math.PI / 2), groundMaterial);
ground.receiveShadow = true;
scene.add(ground);
scene.add(new HemisphereLight(0x8a9cff, 0x241e2a, 0.3));
const sun = new DirectionalLight(0xffe0bc, 3.8);
sun.position.set(-13, 13, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
const rim = new DirectionalLight(0x86a2ff, 1.5);
rim.position.set(6, 10, -18);
scene.add(sun, rim);

/** The current drone, rebuilt here because the game keeps it private to its view. */
function droneOld(): Group {
  const body = new Group();
  const shell = surface({ color: 0xffc83d, roughness: 0.35, metalness: 0.4, reflective: true, envMapIntensity: 0.6 });
  body.add(mesh(new SphereGeometry(0.34, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), shell, 0, 0.1, 0));
  body.add(mesh(new CylinderGeometry(0.36, 0.3, 0.14, 20), surface({ color: 0xf1f3f7, roughness: 0.45 }), 0, 0.04, 0));
  body.add(box(0.22, 0.08, 0.05, glow(0x4de3ff, 2.6), 0, 0.2, 0.3, 0.02));
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.sin(angle) * 0.62;
    const z = Math.cos(angle) * 0.62;
    const arm = box(0.62, 0.05, 0.07, surface({ color: 0x2c3240, roughness: 0.55 }), x / 2, 0.06, z / 2, 0.02);
    arm.rotation.y = angle + Math.PI / 2;
    body.add(arm, mesh(new TorusGeometry(0.24, 0.025, 6, 20), shell, x, 0.12, z).rotateX(Math.PI / 2));
  }
  body.add(box(0.5, 0.14, 0.5, surface({ color: 0x9aa3b0, roughness: 0.35, metalness: 0.7 }), 0, -0.23, 0, 0.01));
  return body;
}

interface Pair {
  readonly old: Object3D;
  readonly next: Object3D;
  readonly spread: number;
  readonly lift: number;
  /** Close shot: distance and height of the camera, and the height it looks at. */
  readonly close: readonly [number, number, number];
}

const smelterOld = smelterModel();
const smelterNew = smelterModelV2();
const feederModels = (["funnel", "hatch", "hoist", "crusher"] as const).map((kind) => smelterModelV2(kind));
const rocketOld = rocketModel();
const rocketNew = rocketModelV2();
const pairs: Record<string, Pair> = {
  astronaut: { old: astronautModel().root, next: astronautModelV2().root, spread: 0.85, lift: 0, close: [3.6, 1.5, 0.95] },
  robot: { old: robotModel(0x6f8cff).root, next: robotModelV2(0x6f8cff).root, spread: 0.95, lift: 0, close: [3.6, 1.6, 0.45] },
  drone: { old: droneOld(), next: droneModelV2().root, spread: 0.95, lift: 1.1, close: [3.4, 2.2, 1.1] },
  smelter: { old: smelterOld.root, next: smelterNew.root, spread: 2.9, lift: 0, close: [9.5, 5.2, 1.4] },
  feedA: { old: feederModels[0]!.root, next: feederModels[1]!.root, spread: 2.9, lift: 0, close: [9.5, 5.2, 1.4] },
  feedB: { old: feederModels[2]!.root, next: feederModels[3]!.root, spread: 2.9, lift: 0, close: [9.5, 5.2, 1.4] },
  rocket: { old: rocketOld.root, next: rocketNew.root, spread: 2.6, lift: 0, close: [10.5, 4.2, 2.6] },
};

const holders = new Map<string, Group>();
for (const [name, pair] of Object.entries(pairs)) {
  const holder = new Group();
  pair.old.position.set(-pair.spread, pair.lift, 0);
  pair.next.position.set(pair.spread, pair.lift, 0);
  holder.add(pair.old, pair.next);
  holder.visible = false;
  scene.add(holder);
  holders.set(name, holder);
}
enableShadows(scene);
pipeline.applyReflections(scene);
// Headlamps light the ground ahead in play; standing still in a showcase they only flare the helmets.
scene.traverse((object) => {
  if ((object as { isSpotLight?: boolean }).isSpotLight) (object as unknown as { intensity: number }).intensity = 0;
  // Smoke puffs pile up into columns when the scene is stepped without time passing.
  if ((object as { isSprite?: boolean }).isSprite) object.visible = false;
});
pipeline.resize(innerWidth, innerHeight);

/** Warm the machines up so their furnaces glow and the press is mid-stamp. */
function animate(time: number): void {
  for (const model of [smelterOld, smelterNew, ...feederModels]) {
    model.update(time, 1 / 30, true, 0.92);
    model.rig.update("working", time, 1 / 30);
  }
  for (const rocket of [rocketOld, rocketNew]) rocket.setBuild(0.5, false, time, 1 / 30);
}

const GAME_OFFSET = new Vector3(0, 11.5, 8.2);

(window as unknown as { show: (name: string, view: "close" | "game" | "left") => void }).show = (name, view) => {
  for (const [key, holder] of holders) holder.visible = key === name;
  const pair = pairs[name];
  if (!pair) return;
  for (let i = 0; i < 30; i += 1) animate(i / 30);
  if (view === "game") {
    const zoom = pair.spread > 2 ? 1.1 : 0.5;
    camera.position.copy(GAME_OFFSET).multiplyScalar(zoom);
    camera.lookAt(0, 0.6, 0);
  } else if (view === "left") {
    const [distance, height, target] = pair.close;
    camera.position.set(-distance * 0.55, height * 0.85, distance * 0.75);
    camera.lookAt(0, target, 0);
  } else {
    const [distance, height, target] = pair.close;
    camera.position.set(distance * 0.35, height, distance);
    camera.lookAt(0, target, 0);
  }
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  pipeline.render();
};

/** One feeder variant alone, seen from the front-left where the ore goes in, at a chosen moment. */
const soloHolder = new Group();
scene.add(soloHolder);
(window as unknown as { solo: (index: number, time: number) => void }).solo = (index, time) => {
  for (const holder of holders.values()) holder.visible = false;
  const model = feederModels[index];
  if (!model) return;
  soloHolder.clear();
  model.root.position.set(0, 0, 0);
  soloHolder.add(model.root);
  for (let t = Math.max(0, time - 1); t <= time; t += 1 / 30) {
    model.update(t, 1 / 30, true, 0.5);
    model.rig.update("working", t, 1 / 30);
  }
  camera.position.set(-3.6, 3.1, 3.9);
  camera.lookAt(-0.7, 1.15, 0);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  pipeline.render();
};
