import {
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  RepeatWrapping,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
} from "three";
import { LOOK, box, glow, mesh, surface } from "./materials";
import { canvasTexture, panelTexture } from "./textures";

export interface MachineModel {
  root: Group;
  inputTray: Group;
  outputTray: Group;
  update(time: number, dt: number, working: boolean, progress: number): void;
}

function puffTexture(): CanvasTexture {
  return canvasTexture("machine-puff", 64, 64, (ctx) => {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.9)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  });
}

function beltMaterial(): MeshStandardMaterial {
  const base = canvasTexture("conveyor-belt", 64, 64, (ctx) => {
    ctx.fillStyle = "#23262e";
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = "#3a3f4b";
    for (let y = 0; y < 64; y += 16) ctx.fillRect(0, y, 64, 6);
  });
  const map = base.clone();
  map.wrapS = RepeatWrapping;
  map.wrapT = RepeatWrapping;
  map.repeat.set(1, 4);
  map.needsUpdate = true;
  return new MeshStandardMaterial({ map, roughness: 0.8 });
}

/** Rising puffs (smoke, steam) that loop while a machine works. */
function emitter(root: Group, x: number, y: number, z: number, color: number, count: number, rise: number) {
  const puffs: Sprite[] = [];
  const holder = new Group();
  holder.userData.dynamic = true;
  root.add(holder);
  for (let i = 0; i < count; i += 1) {
    const sprite = new Sprite(new SpriteMaterial({ map: puffTexture(), color, transparent: true, depthWrite: false, opacity: 0 }));
    sprite.position.set(x, y, z);
    holder.add(sprite);
    puffs.push(sprite);
  }
  let strength = 0;
  return (time: number, dt: number, on: boolean) => {
    strength += ((on ? 1 : 0) - strength) * Math.min(1, dt * 2);
    puffs.forEach((puff, i) => {
      const phase = (time * 0.45 + i / count) % 1;
      puff.position.set(x + Math.sin(phase * 5 + i) * 0.15 * phase, y + phase * rise, z + Math.cos(phase * 4 + i) * 0.1 * phase);
      puff.scale.setScalar(0.25 + phase * 0.9);
      puff.material.opacity = (1 - phase) * 0.45 * strength;
    });
  };
}

function base(root: Group): void {
  root.add(box(2.6, 0.24, 2.4, LOOK.dark(), 0, 0.12, 0, 0.06));
  root.add(box(2.66, 0.06, 2.46, glow(0xffc83d, 0.4), 0, 0.03, 0, 0.02));
  for (const [x, z] of [[-1.15, -1.05], [1.15, -1.05], [-1.15, 1.05], [1.15, 1.05]] as const) {
    root.add(mesh(new CylinderGeometry(0.1, 0.12, 0.08, 10), LOOK.steel(), x, 0.28, z));
  }
}

/** Belt from the input pad up into the hopper, and the hopper itself. */
function intake(root: Group, belt: MeshStandardMaterial): Group {
  const conveyor = new Group();
  conveyor.add(box(0.5, 0.06, 1.4, belt, 0, 0, 0, 0.01));
  conveyor.add(box(0.06, 0.14, 1.4, LOOK.steel(), -0.28, 0.03, 0, 0.02));
  conveyor.add(box(0.06, 0.14, 1.4, LOOK.steel(), 0.28, 0.03, 0, 0.02));
  conveyor.position.set(-1.35, 0.75, 0.75);
  conveyor.rotation.x = 0.55;
  root.add(conveyor);
  for (const z of [1.25, 0.45]) root.add(box(0.08, 0.7, 0.08, LOOK.steel(), -1.35, 0.35, z, 0.02));
  const funnelMaterial = LOOK.steel().clone();
  funnelMaterial.side = DoubleSide;
  root.add(mesh(new CylinderGeometry(0.55, 0.25, 0.55, 16, 1, true), funnelMaterial, -1.3, 1.4, 0.05));
  root.add(mesh(new TorusGeometry(0.55, 0.04, 6, 20), LOOK.orange(), -1.3, 1.67, 0.05).rotateX(Math.PI / 2));
  const tray = new Group();
  tray.position.set(-1.3, 1.2, 0.05);
  tray.userData.dynamic = true;
  root.add(tray);
  return tray;
}

function outlet(root: Group): Group {
  root.add(box(1.0, 0.1, 0.9, LOOK.steel(), 1.35, 0.5, 0.85, 0.03));
  root.add(box(1.0, 0.18, 0.06, LOOK.dark(), 1.35, 0.6, 1.28, 0.02));
  root.add(box(0.06, 0.18, 0.9, LOOK.dark(), 1.83, 0.6, 0.85, 0.02));
  const chute = box(0.4, 0.06, 0.8, LOOK.steel(), 1.0, 0.85, 0.15, 0.02);
  chute.rotation.x = -0.5;
  root.add(chute);
  const tray = new Group();
  tray.position.set(1.35, 0.56, 0.85);
  tray.userData.dynamic = true;
  root.add(tray);
  return tray;
}

function consolePanel(root: Group, x: number, z: number, screenColor: number): MeshStandardMaterial {
  root.add(box(0.5, 0.7, 0.3, LOOK.panel(), x, 0.6, z, 0.04));
  const screen = surface({ color: 0x0a1612, emissive: screenColor, emissiveIntensity: 1.4, roughness: 0.2, noShadow: true }).clone();
  root.add(box(0.38, 0.24, 0.03, screen, x, 0.82, z + 0.16, 0.02).rotateX(-0.2));
  return screen;
}

export function smelterModel(): MachineModel {
  const root = new Group();
  base(root);
  const body = surface({ map: panelTexture("smelter-panels", "#8a4b2a", 4), roughness: 0.55, metalness: 0.3, reflective: true, envMapIntensity: 0.35 });
  root.add(box(1.7, 1.55, 1.5, body, 0.05, 1.0, -0.35, 0.12));
  root.add(box(1.8, 0.14, 1.6, LOOK.dark(), 0.05, 1.83, -0.35, 0.04));
  for (let i = 0; i < 5; i += 1) root.add(box(0.04, 0.5, 0.3, LOOK.dark(), -0.8, 0.95, -0.7 + i * 0.13, 0.01));

  // Furnace door with a glowing window.
  const heat = surface({ color: 0xffa040, emissive: 0xff5a10, emissiveIntensity: 1.2, roughness: 0.4, noShadow: true }).clone();
  const door = mesh(new CylinderGeometry(0.42, 0.42, 0.1, 24), LOOK.dark(), 0.05, 1.0, 0.42);
  door.rotation.x = Math.PI / 2;
  const window = mesh(new CylinderGeometry(0.3, 0.3, 0.12, 24), heat, 0.05, 1.0, 0.44);
  window.rotation.x = Math.PI / 2;
  const rim = mesh(new TorusGeometry(0.42, 0.05, 8, 24), LOOK.steel(), 0.05, 1.0, 0.48);
  root.add(door, window, rim);

  // Chimney, pipes and warning beacon.
  root.add(mesh(new CylinderGeometry(0.2, 0.26, 1.7, 14), LOOK.steel(), 0.55, 2.6, -0.65));
  for (const y of [2.1, 2.7, 3.3]) root.add(mesh(new TorusGeometry(0.22, 0.035, 6, 16), LOOK.dark(), 0.55, y, -0.65).rotateX(Math.PI / 2));
  root.add(mesh(new CylinderGeometry(0.3, 0.22, 0.12, 14), LOOK.dark(), 0.55, 3.48, -0.65));
  root.add(mesh(new CylinderGeometry(0.07, 0.07, 1.4, 8), LOOK.steel(), -0.55, 1.2, -1.15));
  root.add(mesh(new CylinderGeometry(0.07, 0.07, 1.0, 8), LOOK.steel(), 0, 1.9, -1.15).rotateZ(Math.PI / 2));
  const beacon = new Group();
  beacon.userData.dynamic = true;
  const beaconLight = surface({ color: 0xff8a2a, emissive: 0xff6a1a, emissiveIntensity: 0.3, roughness: 0.3, noShadow: true }).clone();
  beacon.add(mesh(new SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), beaconLight));
  beacon.position.set(-0.4, 1.9, -0.1);
  root.add(beacon);

  const belt = beltMaterial();
  const inputTray = intake(root, belt);
  const outputTray = outlet(root);
  const screen = consolePanel(root, 1.4, -0.75, 0x5df2a0);

  const glowLight = new PointLight(0xff7a2a, 0, 3.5, 2);
  glowLight.position.set(0.05, 1.0, 0.9);
  root.add(glowLight);
  const smoke = emitter(root, 0.55, 3.6, -0.65, 0x8a8a96, 8, 2.2);

  return {
    root,
    inputTray,
    outputTray,
    update(time, dt, working, progress) {
      const flicker = Math.sin(time * 13) * 0.3 + Math.sin(time * 31) * 0.15;
      heat.emissiveIntensity = working ? 2.6 + flicker + progress : 0.5;
      glowLight.intensity = working ? 3 + flicker * 2 : 0;
      beaconLight.emissiveIntensity = working ? 1.5 + Math.max(0, Math.sin(time * 8)) * 3 : 0.3;
      if (belt.map) belt.map.offset.y = (belt.map.offset.y - dt * (working ? 0.8 : 0)) % 1;
      screen.emissiveIntensity = 1 + Math.sin(time * 5) * 0.2;
      smoke(time, dt, working);
    },
  };
}

export function purifierModel(): MachineModel {
  const root = new Group();
  base(root);
  const glass = new MeshStandardMaterial({ color: 0xbfefff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, depthWrite: false });
  glass.userData.reflective = true;
  const water = surface({ color: 0x3aa8ff, emissive: 0x1a7ad8, emissiveIntensity: 0.9, roughness: 0.15, noShadow: true }).clone();
  const waterColumns: Mesh[] = [];
  const bubbles: Mesh[] = [];
  const bubbleGroup = new Group();
  bubbleGroup.userData.dynamic = true;
  root.add(bubbleGroup);
  for (const [x, height] of [[-0.25, 1.9], [0.75, 1.5]] as const) {
    const z = -0.45;
    root.add(mesh(new CylinderGeometry(0.5, 0.5, 0.2, 24), LOOK.steel(), x, 0.34, z));
    root.add(mesh(new CylinderGeometry(0.46, 0.46, height, 24, 1, true), glass, x, 0.44 + height / 2, z));
    const column = mesh(new CylinderGeometry(0.4, 0.4, 1, 20), water, x, 0.44, z);
    column.userData.dynamic = true;
    column.userData.maxHeight = height - 0.1;
    root.add(column);
    waterColumns.push(column);
    root.add(mesh(new SphereGeometry(0.5, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), LOOK.white(), x, 0.44 + height, z));
    for (const y of [0.9, 0.44 + height - 0.3]) root.add(mesh(new TorusGeometry(0.48, 0.04, 6, 24), LOOK.steel(), x, y, z).rotateX(Math.PI / 2));
    for (let i = 0; i < 5; i += 1) {
      const bubble = mesh(new SphereGeometry(0.04, 8, 6), glow(0xd8f6ff, 1.2), x, 0.6, z);
      bubble.userData.baseX = x + (i % 2 === 0 ? -0.15 : 0.15);
      bubble.userData.baseZ = z + (i - 2) * 0.06;
      bubble.userData.height = height;
      bubbleGroup.add(bubble);
      bubbles.push(bubble);
    }
  }
  root.add(mesh(new TorusGeometry(0.5, 0.07, 8, 20, Math.PI), LOOK.steel(), 0.25, 2.15, -0.45));

  // Ice crusher with spinning teeth above the hopper.
  const crusher = new Group();
  crusher.userData.dynamic = true;
  for (let i = 0; i < 6; i += 1) crusher.add(box(0.5, 0.06, 0.06, LOOK.teal()).rotateY((i / 6) * Math.PI));
  crusher.position.set(-1.3, 1.62, 0.05);
  root.add(crusher);

  // Pump with a spinning fan.
  root.add(box(0.6, 0.6, 0.5, LOOK.panel(), 0.85, 0.6, 0.35, 0.06));
  const fan = new Group();
  fan.userData.dynamic = true;
  for (let i = 0; i < 4; i += 1) fan.add(box(0.36, 0.08, 0.02, LOOK.dark()).rotateZ((i / 4) * Math.PI));
  fan.position.set(0.85, 0.65, 0.61);
  root.add(fan, mesh(new TorusGeometry(0.22, 0.03, 6, 16), LOOK.steel(), 0.85, 0.65, 0.61));

  const belt = beltMaterial();
  const inputTray = intake(root, belt);
  const outputTray = outlet(root);
  const screen = consolePanel(root, -0.1, 0.65, 0x4de3ff);
  const steam = emitter(root, 0.75, 2.2, -0.45, 0xe8f6ff, 6, 1.4);

  return {
    root,
    inputTray,
    outputTray,
    update(time, dt, working, progress) {
      waterColumns.forEach((column, i) => {
        const max = column.userData.maxHeight as number;
        const level = 0.35 + 0.55 * (working ? (i === 0 ? progress : 1 - progress * 0.5) : 0.5);
        column.scale.y = max * level;
        column.position.y = 0.44 + (max * level) / 2;
      });
      water.emissiveIntensity = working ? 1.4 + Math.sin(time * 6) * 0.3 : 0.6;
      bubbles.forEach((bubble, i) => {
        const height = bubble.userData.height as number;
        const phase = (time * 0.6 + i * 0.21) % 1;
        bubble.visible = working;
        bubble.position.set((bubble.userData.baseX as number) + Math.sin(time * 4 + i) * 0.04, 0.5 + phase * (height * 0.8), bubble.userData.baseZ as number);
      });
      crusher.rotation.y += dt * (working ? 6 : 0.3);
      fan.rotation.z += dt * (working ? 12 : 0.5);
      if (belt.map) belt.map.offset.y = (belt.map.offset.y - dt * (working ? 0.8 : 0)) % 1;
      screen.emissiveIntensity = 1 + Math.sin(time * 4) * 0.2;
      steam(time, dt, working);
    },
  };
}
