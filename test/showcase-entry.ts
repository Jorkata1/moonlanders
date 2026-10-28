// Model showcase: one model at a time on a patch of regolith under the game's light, for visual review.
// Build with `node test/build-entry.mjs test/showcase-entry.ts dist/showcase.html`, then call show(name, view).
import { Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, type Object3D } from "three";
import { astronautModel } from "../src/view/astronaut";
import { droneModel } from "../src/view/droneModel";
import { refineryModel } from "../src/view/refinery";
import { createRenderPipeline, enableShadows } from "../src/view/render";
import { robotModel } from "../src/view/robot";
import { rocketModel } from "../src/view/rocket";
import { smelterModel } from "../src/view/smelter";
import { suitStationModel } from "../src/view/suitStation";
import { regolithNormalTexture, regolithTexture } from "../src/view/textures";
import { workbenchModel } from "../src/view/workbench";

const STEP = 1 / 30;

const canvas = document.createElement("canvas");
canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%";
document.body.style.margin = "0";
document.body.append(canvas);
const scene = new Scene();
scene.background = new Color(0x070914);
const camera = new PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 400);
const pipeline = createRenderPipeline(canvas, scene, camera, { tier: "high", pixelRatio: 1, shadowLights: 1, shadowMapSize: 2048, bloom: true, msaaSamples: 4 });

const groundMaterial = new MeshStandardMaterial({ color: 0x6a6d82, map: regolithTexture(12), normalMap: regolithNormalTexture(16), roughness: 0.95 });
groundMaterial.normalScale.set(2.4, 2.4);
const ground = new Mesh(new PlaneGeometry(120, 120).rotateX(-Math.PI / 2), groundMaterial);
ground.receiveShadow = true;
scene.add(ground, new HemisphereLight(0x8a9cff, 0x241e2a, 0.3));
const sun = new DirectionalLight(0xffe0bc, 3.8);
sun.position.set(-13, 13, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 60 });
const rim = new DirectionalLight(0x86a2ff, 1.5);
rim.position.set(6, 10, -18);
scene.add(sun, rim);

interface Exhibit {
  readonly object: Object3D;
  /** Close shot: camera distance, camera height and the height it looks at. */
  readonly close: readonly [number, number, number];
  animate(time: number): void;
}

const smelter = smelterModel();
const refinery = refineryModel();
const rocket = rocketModel();
const suit = suitStationModel();
const bench = workbenchModel();
const machine = (model: typeof smelter) => (time: number) => {
  model.update(time, STEP, true, (time / 2) % 1);
  model.rig.update("working", time, STEP);
};
const exhibits: Record<string, Exhibit> = {
  astronaut: { object: astronautModel().root, close: [3, 1.4, 0.9], animate: () => undefined },
  robot: { object: robotModel(0x6f8cff).root, close: [3, 1.5, 0.45], animate: () => undefined },
  drone: { object: droneModel().root, close: [3, 2.2, 0.6], animate: () => undefined },
  smelter: { object: smelter.root, close: [6.5, 4.4, 1.2], animate: machine(smelter) },
  refinery: { object: refinery.root, close: [6.5, 4.4, 1.2], animate: machine(refinery) },
  workbench: { object: bench.root, close: [5, 3.2, 1], animate: (time) => bench.update(time, STEP, true) },
  suit: { object: suit.root, close: [5.5, 3.2, 1.2], animate: (time) => suit.update(time, STEP, true) },
  rocket: { object: rocket.root, close: [8.5, 4, 2.6], animate: (time) => rocket.setBuild(0.5, false, time, STEP) },
};
const stage = new Group();
scene.add(stage);
enableShadows(scene);
for (const exhibit of Object.values(exhibits)) pipeline.applyReflections(exhibit.object);
pipeline.resize(innerWidth, innerHeight);

/** Show one exhibit after `time` seconds of animation, from close up or from the game's camera angle. */
(window as unknown as { show: (name: string, view: "close" | "game", time?: number) => void }).show = (name, view, time = 1) => {
  const exhibit = exhibits[name];
  if (!exhibit) return;
  stage.clear();
  stage.add(exhibit.object);
  exhibit.object.traverse((object) => {
    // Smoke puffs pile into columns when time jumps; the headlamp only flares a standing helmet.
    if ((object as { isSprite?: boolean }).isSprite || (object as { isSpotLight?: boolean }).isSpotLight) object.visible = false;
  });
  for (let t = Math.max(0, time - 1); t <= time; t += STEP) exhibit.animate(t);
  const [distance, height, target] = exhibit.close;
  if (view === "game") camera.position.set(0, distance * 1.4, distance);
  else camera.position.set(distance * 0.45, height, distance);
  camera.lookAt(0, target, 0);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  pipeline.render();
};
