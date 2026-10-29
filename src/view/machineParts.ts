import {
  CanvasTexture,
  CylinderGeometry,
  Group,
  MeshStandardMaterial,
  RepeatWrapping,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
} from "three";
import { LOOK, box, glow, mesh, surface } from "./materials";
import { canvasTexture } from "./textures";

/** What the status lamp tower shows: green working, amber waiting for input, red output full. */
export type MachineStatus = "working" | "idle" | "blocked";

/** Shared fittings every machine has: status lamp tower and a cooling fan. */
export interface BaseRig {
  update(status: MachineStatus, time: number, dt: number): void;
}

export interface MachineModel {
  root: Group;
  inputTray: Group;
  outputTray: Group;
  /** Route an item rides from the input belt's foot into the hopper, in the model's local space. */
  inputPath: readonly Vector3[];
  /** Route a finished item takes from inside the machine down the chute to the output tray. */
  outputPath: readonly Vector3[];
  rig: BaseRig;
  update(time: number, dt: number, working: boolean, progress: number): void;
}

export interface Feed {
  tray: Group;
  path: Vector3[];
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

export function beltMaterial(): MeshStandardMaterial {
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

/** Rising puffs (smoke, steam) that loop while a machine works; `size` scales the puffs and their drift, `opacity` their density. */
export function emitter(root: Group, x: number, y: number, z: number, color: number, count: number, rise: number, size = 1, opacity = 0.45) {
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
      puff.position.set(x + Math.sin(phase * 5 + i) * 0.15 * phase * size, y + phase * rise, z + Math.cos(phase * 4 + i) * 0.1 * phase * size);
      puff.scale.setScalar((0.25 + phase * 0.9) * size);
      puff.material.opacity = (1 - phase) * opacity * strength;
    });
  };
}

const LAMP_COLORS: Record<MachineStatus, number> = { blocked: 0xff4a3a, idle: 0xffb020, working: 0x46f08c };
const LAMP_ORDER: readonly MachineStatus[] = ["blocked", "idle", "working"];
const TOWER_HEIGHT = 2.2;

/** Plinth with hazard trim and bolts, a status lamp tower and a cooling fan. */
export function base(root: Group): BaseRig {
  root.add(box(2.6, 0.24, 2.4, LOOK.dark(), 0, 0.12, 0, 0.06));
  root.add(box(2.66, 0.06, 2.46, glow(0xffc83d, 0.4), 0, 0.03, 0, 0.02));
  for (const [x, z] of [[-1.15, -1.05], [1.15, -1.05], [-1.15, 1.05], [1.15, 1.05]] as const) {
    root.add(mesh(new CylinderGeometry(0.1, 0.12, 0.08, 10), LOOK.steel(), x, 0.28, z));
  }
  // Power conduit along the back edge.
  root.add(mesh(new CylinderGeometry(0.05, 0.05, 2.2, 8), LOOK.rubber(), 0, 0.3, -1.12).rotateZ(Math.PI / 2));
  root.add(box(0.26, 0.22, 0.14, LOOK.panel(), 0.9, 0.36, -1.1, 0.03));

  const tower = new Group();
  tower.position.set(-0.95, 0.24, -1.0);
  // Tall enough that the lamps clear the top of every machine body as seen from the camera.
  tower.add(mesh(new CylinderGeometry(0.035, 0.035, TOWER_HEIGHT, 8), LOOK.steel(), 0, TOWER_HEIGHT / 2, 0));
  const lamps = LAMP_ORDER.map((status, i) => {
    const lamp = surface({ color: LAMP_COLORS[status], emissive: LAMP_COLORS[status], emissiveIntensity: 0.15, roughness: 0.3, noShadow: true }).clone();
    tower.add(mesh(new CylinderGeometry(0.1, 0.1, 0.14, 12), lamp, 0, TOWER_HEIGHT + 0.08 + i * 0.15, 0));
    return { status, lamp };
  });
  tower.add(mesh(new CylinderGeometry(0.11, 0.11, 0.03, 12), LOOK.dark(), 0, TOWER_HEIGHT + 0.46, 0));
  root.add(tower);

  const fan = new Group();
  fan.userData.dynamic = true;
  for (let i = 0; i < 5; i += 1) fan.add(box(0.26, 0.05, 0.015, LOOK.dark()).rotateZ((i / 5) * Math.PI));
  fan.position.set(-0.55, 0.44, 1.12);
  root.add(fan, mesh(new TorusGeometry(0.16, 0.025, 6, 18), LOOK.steel(), -0.55, 0.44, 1.12), box(0.4, 0.4, 0.08, LOOK.panel(), -0.55, 0.44, 1.07, 0.04));

  return {
    update(status, time, dt) {
      for (const { status: own, lamp } of lamps) {
        const on = own === status;
        lamp.emissiveIntensity = on ? (status === "blocked" ? 1.6 + Math.max(0, Math.sin(time * 9)) * 2 : 2.4) : 0.12;
      }
      fan.rotation.z += dt * (status === "working" ? 14 : 1.5);
    },
  };
}

export function outlet(root: Group): Feed {
  root.add(box(1.0, 0.1, 0.9, LOOK.steel(), 1.35, 0.5, 0.85, 0.03));
  root.add(box(1.0, 0.18, 0.06, LOOK.dark(), 1.35, 0.6, 1.28, 0.02));
  root.add(box(0.06, 0.18, 0.9, LOOK.dark(), 1.83, 0.6, 0.85, 0.02));
  const chute = box(0.4, 0.06, 0.8, LOOK.steel(), 1.0, 0.85, 0.15, 0.02);
  chute.rotation.x = -0.5;
  root.add(chute);
  // Hatch the finished item drops out of.
  root.add(box(0.46, 0.34, 0.06, LOOK.dark(), 0.95, 1.12, -0.22, 0.03), box(0.4, 0.04, 0.02, glow(0x5df2a0, 2), 0.95, 1.31, -0.19, 0.01));
  const tray = new Group();
  tray.position.set(1.35, 0.56, 0.85);
  tray.userData.dynamic = true;
  root.add(tray);
  const path = [new Vector3(0.95, 1.1, -0.3), new Vector3(1.0, 1.08, -0.05), new Vector3(1.05, 0.72, 0.5), new Vector3(1.35, 0.62, 0.85)];
  return { tray, path };
}

export function consolePanel(root: Group, x: number, z: number, screenColor: number): MeshStandardMaterial {
  root.add(box(0.5, 0.7, 0.3, LOOK.panel(), x, 0.6, z, 0.04));
  const screen = surface({ color: 0x0a1612, emissive: screenColor, emissiveIntensity: 1.4, roughness: 0.2, noShadow: true }).clone();
  root.add(box(0.38, 0.24, 0.03, screen, x, 0.82, z + 0.16, 0.02).rotateX(-0.2));
  return screen;
}
