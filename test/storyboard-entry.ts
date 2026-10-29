// Intro storyboards: stages single frames of possible intro cinematics with the real models and
// world, for review before any of them is built. Call frame(name) to render one.
import {
  AdditiveBlending,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Sprite,
  SpriteMaterial,
  TubeGeometry,
  Vector3,
  type Object3D,
} from "three";
import { MOON } from "../src/planets/moon";
import { createState } from "../src/sim/state";
import { astronautModel } from "../src/view/astronaut";
import { createEffects } from "../src/view/fx";
import { ItemPool } from "../src/view/items";
import { box, glow, mesh, surface } from "../src/view/materials";
import { createRenderPipeline, enableShadows } from "../src/view/render";
import { rocketModel } from "../src/view/rocket";
import { landerModel } from "../src/view/structures";
import { canvasTexture } from "../src/view/textures";
import { buildWorld } from "../src/view/world";

const STEP = 1 / 30;
const canvas = document.createElement("canvas");
canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%";
document.body.style.margin = "0";
document.body.append(canvas);
const scene = new Scene();
const camera = new PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 2000);
const pipeline = createRenderPipeline(canvas, scene, camera, { tier: "high", pixelRatio: 1, shadowLights: 1, shadowMapSize: 2048, bloom: true, msaaSamples: 4 });
// Close cinematic shots of white hulls need a little less exposure than the high gameplay camera.
pipeline.renderer.toneMappingExposure = 0.68;
const pool = new ItemPool();
const state = createState(MOON);
state.order = null;
const world = buildWorld(scene, state, pool, 2048);
const fx = createEffects(scene, pool);
const worldFog = scene.fog;
const worldBackground = (scene.background as Color).clone();

// ---------- Space set: the Moon from orbit, Earth, the stricken rocket and the escape pod ----------
const space = new Group();
space.visible = false;
scene.add(space);

function moonTexture(): CanvasTexture {
  return canvasTexture("story-moon", 1024, 512, (ctx) => {
    ctx.fillStyle = "#8d8f9e";
    ctx.fillRect(0, 0, 1024, 512);
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i += 1) {
      ctx.fillStyle = `rgba(60,62,78,${0.25 + random() * 0.3})`;
      ctx.beginPath();
      ctx.ellipse(random() * 1024, random() * 512, 40 + random() * 140, 20 + random() * 70, random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 600; i += 1) {
      const x = random() * 1024;
      const y = random() * 512;
      const r = 1 + random() ** 3 * 22;
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      g.addColorStop(0, "rgba(40,40,50,0.5)");
      g.addColorStop(0.8, "rgba(80,80,95,0.25)");
      g.addColorStop(1, "rgba(230,230,240,0.5)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

const moonBall = new Mesh(new IcosahedronGeometry(60, 6), new MeshStandardMaterial({ map: moonTexture(), roughness: 1 }));
space.add(moonBall);
const earthBall = new Mesh(new IcosahedronGeometry(14, 5), new MeshStandardMaterial({ color: 0x2d6cc0, emissive: 0x16305a, emissiveIntensity: 0.4, roughness: 0.6 }));
earthBall.position.set(-170, 90, -420);
earthBall.add(new Mesh(new IcosahedronGeometry(14.8, 5), new MeshBasicMaterial({ color: 0x7fc0ff, transparent: true, opacity: 0.2, depthWrite: false })));
space.add(earthBall);
const spaceSun = new DirectionalLight(0xfff0dc, 2.4);
spaceSun.position.set(-80, 60, 120);
space.add(spaceSun, new HemisphereLight(0x8a9cff, 0x000000, 0.15));

const spaceRocket = rocketModel();
for (let i = 0; i < 40; i += 1) spaceRocket.setBuild(0.25, false, i * STEP, STEP);
const ship = spaceRocket.ship;
ship.removeFromParent();
spaceRocket.flame.visible = true;
spaceRocket.flame.scale.set(1.4, 2.2, 1.4);
space.add(ship);
const spacePod = landerModel();
spacePod.flame.visible = true;
space.add(spacePod.root);

/** Blue-white electric arcs crawling over the failing jump drive. */
function arcs(count: number, radius: number, seed: number): Group {
  const group = new Group();
  const material = new MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false });
  let s = seed;
  const random = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i += 1) {
    const angle = random() * Math.PI * 2;
    const points: Vector3[] = [];
    for (let k = 0; k < 7; k += 1) {
      const a = angle + k * 0.18;
      const r = radius + (random() - 0.5) * 0.35 + k * 0.08;
      points.push(new Vector3(Math.sin(a) * r, 0.75 + (random() - 0.5) * 0.5 + k * 0.06, Math.cos(a) * r));
    }
    group.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(points), 24, 0.025, 4), material));
  }
  return group;
}
const driveArcs = arcs(9, 1.25, 11);
ship.add(driveArcs);

/** A soft round puff texture for smoke and fire sprites. */
const puffTexture = canvasTexture("story-puff", 64, 64, (ctx) => {
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
});

/** A column (or trail) of puffs from `from` along `direction`, growing and fading. */
function plume(from: Vector3, direction: Vector3, count: number, length: number, color: number, size: number, additive = false, opacity = 0.6): Group {
  const group = new Group();
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const material = new SpriteMaterial({ map: puffTexture, color, transparent: true, opacity: opacity * (1 - t * 0.8), depthWrite: false });
    if (additive) material.blending = AdditiveBlending;
    const sprite = new Sprite(material);
    sprite.position.copy(from).addScaledVector(direction, t * length).add(new Vector3(Math.sin(i * 2.3) * t * 0.6, 0, Math.cos(i * 1.7) * t * 0.6));
    sprite.scale.setScalar(size * (0.6 + t * 2.4));
    group.add(sprite);
  }
  return group;
}
const shipFire = plume(new Vector3(0, -1.4, 0), new Vector3(0, -1, 0), 14, 9, 0xff8a3a, 1.1, true, 0.8);
const shipSmoke = plume(new Vector3(0, -2.5, 0), new Vector3(0, -1, 0), 18, 22, 0x5a5560, 1.6);
ship.add(shipFire, shipSmoke);
shipSmoke.visible = false;

// ---------- Cockpit set: a window frame and a console that ride with the camera ----------
function screen(key: string, lines: readonly string[], color: string, flash: boolean): MeshStandardMaterial {
  const map = canvasTexture(key, 256, 128, (ctx) => {
    ctx.fillStyle = flash ? "#3a0608" : "#04121a";
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = color;
    ctx.font = "bold 30px sans-serif";
    lines.forEach((line, i) => ctx.fillText(line, 14, 40 + i * 34));
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, 248, 120);
  });
  return surface({ color: 0xffffff, map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 1.3, roughness: 0.3, noShadow: true });
}

function cockpit(stage: "alarm" | "eject"): Group {
  const group = new Group();
  const frame = surface({ color: 0x2a2f3c, roughness: 0.5, metalness: 0.5 });
  const trim = surface({ color: 0xff7a1f, roughness: 0.4 });
  // Window struts at the edges of view.
  group.add(box(0.1, 2.4, 0.1, frame, -0.36, 0, -1.2, 0.04).rotateZ(0.12), box(0.1, 2.4, 0.1, frame, 0.36, 0, -1.2, 0.04).rotateZ(-0.12));
  group.add(box(1.2, 0.12, 0.12, frame, 0, 0.66, -1.2, 0.04), box(1.2, 0.04, 0.05, trim, 0, 0.6, -1.18, 0.01));
  // Console below the window.
  const console = new Group();
  console.position.set(0, -0.5, -0.85);
  console.rotation.x = 0.75;
  console.add(box(0.9, 0.06, 0.5, frame, 0, 0, 0, 0.03), box(0.92, 0.03, 0.04, trim, 0, 0.04, 0.24, 0.01));
  const alarm = stage === "alarm";
  console.add(box(0.27, 0.02, 0.15, screen(`story-screen-a-${stage}`, alarm ? ["JUMP DRIVE", "FAILURE"] : ["HULL BREACH", "EJECT NOW"], "#ff4a3a", true), -0.15, 0.04, -0.06, 0.01));
  console.add(box(0.27, 0.02, 0.15, screen(`story-screen-b-${stage}`, alarm ? ["ALT 42 km", "DESCENT ▼▼"] : ["ALT 1.8 km", "POD READY"], alarm ? "#ffc23d" : "#5df2a0", false), 0.15, 0.04, -0.06, 0.01));
  for (let i = 0; i < 6; i += 1) console.add(mesh(new IcosahedronGeometry(0.018, 1), glow([0xff4a3a, 0xffc23d, 0x5df2a0][i % 3] as number, 3), -0.2 + i * 0.08, 0.05, 0.14));
  if (!alarm) console.add(box(0.1, 0.05, 0.1, glow(0xff4a3a, 2.4), 0, 0.06, 0.16, 0.03));
  group.add(console);
  // Alarm light washes the cabin red.
  const red = new MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: alarm ? 0.16 : 0.24, blending: AdditiveBlending, depthWrite: false });
  group.add(mesh(new IcosahedronGeometry(0.4, 1), red, 0, 0, -0.3));
  return group;
}
const cockpitAlarm = cockpit("alarm");
const cockpitEject = cockpit("eject");

// ---------- World set helpers ----------
const lander = landerModel();
scene.add(lander.root);
const hero = astronautModel();
scene.add(hero.root);
const props = world.introProps();
const crashSmoke = plume(world.groundAt(MOON.rocket).add(new Vector3(0, 3, 0)), new Vector3(0.25, 1, 0.1).normalize(), 30, 26, 0xa8a4b4, 2.6, false, 0.55);
const fallingTrail = new Group();
scene.add(crashSmoke, fallingTrail);
enableShadows(scene);
pipeline.applyReflections(scene);
pipeline.resize(innerWidth, innerHeight);

function useSpace(on: boolean): void {
  for (const child of scene.children) {
    if (child === space || child === camera) continue;
    if (on && child.visible) {
      child.userData.storyHidden = true;
      child.visible = false;
    } else if (!on && child.userData.storyHidden === true) {
      child.userData.storyHidden = false;
      child.visible = true;
    }
  }
  space.visible = on;
  scene.fog = on ? null : worldFog;
  (scene.background as Color).copy(on ? new Color(0x020308) : worldBackground);
}

function look(position: Vector3, target: Vector3, fov = 50): void {
  camera.fov = fov;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  camera.position.copy(position);
  camera.lookAt(target);
}

function attachToCamera(object: Object3D | null): void {
  for (const c of [cockpitAlarm, cockpitEject]) c.removeFromParent();
  if (!object) return;
  camera.add(object);
  if (!camera.parent) scene.add(camera);
}

/** Settle the world for a frame: kit unfolded or not, pod and hero placed, rocket where the shot needs it. */
function stageWorld(opts: { kit: boolean; podY: number; podFlame: boolean; hero: "hidden" | "lying" | "standing"; rocket: "crashed" | "falling"; smoke: boolean }): void {
  useSpace(false);
  for (const prop of props) prop.object.visible = opts.kit;
  const pod = world.groundAt(MOON.podSpot);
  lander.root.position.copy(pod).add(new Vector3(0, opts.podY, 0));
  lander.flame.visible = opts.podFlame;
  lander.flame.scale.set(1, 1.6, 1);
  hero.root.visible = opts.hero !== "hidden";
  const spot = pod.clone().add(new Vector3(1.6, 0, 1.4));
  hero.root.position.copy(spot);
  hero.root.rotation.set(opts.hero === "lying" ? -Math.PI / 2 + 0.1 : 0, opts.hero === "lying" ? 0.6 : -2.4, 0);
  if (opts.hero === "lying") hero.root.position.y += 0.28;
  hero.drill.root.visible = true;
  hero.headlamp.intensity = 0;
  crashSmoke.visible = opts.smoke;
  fallingTrail.clear();
  const ship = world.rocket.ship;
  ship.visible = true;
  world.rocket.flame.visible = opts.rocket === "falling";
  if (opts.rocket === "falling") {
    const offset = new Vector3(9, 11, 12);
    ship.position.copy(offset);
    ship.rotation.set(0.6, 0, -0.65);
    const trailFrom = world.groundAt(MOON.rocket).add(offset);
    fallingTrail.add(plume(trailFrom, new Vector3(0.6, 0.55, 0.55).normalize(), 26, 26, 0x6a6570, 1.4, false, 0.55));
    fallingTrail.add(plume(trailFrom, new Vector3(0.6, 0.55, 0.55).normalize(), 10, 5, 0xff8a3a, 1.0, true, 0.9));
  } else {
    ship.position.set(0, 0.6, 0);
    ship.rotation.set(0.12, 0, 0.18);
  }
  for (let i = 0; i < 60; i += 1) world.sync(state, STEP, i * STEP);
}

const frames: Record<string, () => void> = {
  smoke: () => {
    stageWorld({ kit: true, podY: 0, podFlame: false, hero: "hidden", rocket: "crashed", smoke: false });
    for (let i = 0; i < 90; i += 1) world.sync(state, STEP, 3 + i * STEP);
    const at = world.groundAt(MOON.rocket);
    let shown = 0;
    world.rocket.root.traverse((o) => { if ((o as { isSprite?: boolean }).isSprite && o.visible) shown += 1; });
    console.log("rocket sprites", shown);
    look(at.clone().add(new Vector3(8, 6, 14)), at.clone().add(new Vector3(0, 4, 0)), 50);
  },
  // A: From orbit.
  "orbit-1": () => {
    useSpace(true);
    attachToCamera(null);
    moonBall.position.set(10, -95, -110);
    ship.position.set(0, 0, 0);
    ship.rotation.set(0.9, 0.3, -0.5);
    spacePod.root.visible = false;
    driveArcs.visible = true;
    shipFire.visible = true;
    look(new Vector3(4.5, 4, 9.5), new Vector3(0, -2.2, -1), 45);
  },
  "orbit-2": () => {
    useSpace(true);
    attachToCamera(null);
    moonBall.position.set(0, -85, -80);
    ship.position.set(-1.8, 2.6, -5);
    ship.rotation.set(1.2, 0.3, -0.9);
    spacePod.root.visible = true;
    spacePod.root.position.set(1.2, -1.2, 2.2);
    spacePod.root.rotation.set(-0.5, 0, 0.5);
    driveArcs.visible = true;
    look(new Vector3(3.2, 1.5, 8.5), new Vector3(0, -0.4, -1), 50);
  },
  "orbit-3": () => {
    stageWorld({ kit: false, podY: 7, podFlame: true, hero: "hidden", rocket: "falling", smoke: false });
    attachToCamera(null);
    const base = world.groundAt(MOON.dome);
    look(base.clone().add(new Vector3(-6, 16, 22)), base.clone().add(new Vector3(-2, 2, -10)), 52);
  },
  // B: Cockpit.
  "cockpit-1": () => {
    useSpace(true);
    moonBall.position.set(0, -75, -150);
    ship.position.set(0, 400, 0);
    spacePod.root.visible = false;
    look(new Vector3(0, 0, 0), new Vector3(0, -0.2, -1), 62);
    attachToCamera(cockpitAlarm);
  },
  "cockpit-2": () => {
    useSpace(true);
    moonBall.position.set(0, -52, -95);
    ship.position.set(0, 400, 0);
    spacePod.root.visible = false;
    look(new Vector3(0, 0, 0), new Vector3(0, -0.3, -1), 62);
    camera.rotation.z = 0.12;
    attachToCamera(cockpitEject);
  },
  "cockpit-3": () => {
    useSpace(true);
    attachToCamera(null);
    moonBall.position.set(0, -80, -70);
    ship.position.set(-2, 3, -6);
    ship.rotation.set(1.3, 0.2, -0.7);
    driveArcs.visible = true;
    spacePod.root.visible = true;
    spacePod.root.position.set(0.6, -0.4, 1.5);
    spacePod.root.rotation.set(-0.6, 0.4, 0.3);
    look(new Vector3(-1.5, 1.2, 6.5), new Vector3(0, -0.6, 0), 50);
  },
  // C: Wake up.
  "wake-1": () => {
    stageWorld({ kit: false, podY: 0, podFlame: false, hero: "lying", rocket: "crashed", smoke: true });
    attachToCamera(null);
    const at = hero.root.position.clone();
    look(at.clone().add(new Vector3(1.4, 1.0, 2.6)), at.clone().add(new Vector3(-0.6, 0.3, -0.6)), 45);
  },
  "wake-2": () => {
    stageWorld({ kit: false, podY: 0, podFlame: false, hero: "standing", rocket: "crashed", smoke: true });
    attachToCamera(null);
    for (let i = 0; i < 8; i += 1) fx.dust(world.groundAt(MOON.podSpot).add(new Vector3(0, 1.4 + i * 0.2, 0)), 3, 0x6a6570);
    for (let i = 0; i < 20; i += 1) fx.update(STEP);
    const at = hero.root.position.clone();
    look(at.clone().add(new Vector3(-0.8, 1.3, 4.2)), at.clone().add(new Vector3(-0.6, 1.6, -8)), 50);
  },
  "wake-3": () => {
    stageWorld({ kit: true, podY: 0, podFlame: false, hero: "standing", rocket: "crashed", smoke: true });
    attachToCamera(null);
    const at = hero.root.position.clone();
    look(at.clone().add(new Vector3(-3, 9, 9)), at.clone().add(new Vector3(-7, 3, -22)), 50);
  },
};

(window as unknown as { frame: (name: string) => boolean }).frame = (name) => {
  const setup = frames[name];
  if (!setup) return false;
  camera.rotation.z = 0;
  setup();
  pipeline.render();
  return true;
};
