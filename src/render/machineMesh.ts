import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Material,
  type MeshBasicMaterial,
} from 'three';
import { MACHINE_MAX_LEVEL, MACHINE_OUTPUT_CAPACITY } from '../config/balance';
import { MachineKind } from '../config/planets/types';
import { ItemStack } from './itemStack';
import { HAZARD_YELLOW, STEEL_DARK, STEEL_MID, glow, surface, uniqueGlow } from './materials';

const IDLE_LIGHT = 0x475569;
const WORK_GLOW = 0xff7a1a;

type Animator = (time: number, dt: number, running: boolean) => void;

function mesh(geometry: BufferGeometry, material: Material, x = 0, y = 0, z = 0): Mesh {
  const result = new Mesh(geometry, material);
  result.position.set(x, y, z);
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

function buildDrill(group: Group, accent: number): Animator {
  const frame = surface(STEEL_MID);
  for (const [x, z] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]] as const) {
    const leg = mesh(new BoxGeometry(0.16, 2.6, 0.16), frame, x * 0.8, 1.45, z * 0.8);
    leg.rotation.set(z * -0.12, 0, x * 0.12);
    group.add(leg);
  }
  group.add(mesh(new BoxGeometry(1.1, 0.6, 1.1), surface(accent), 0, 2.75, 0));
  group.add(mesh(new BoxGeometry(1.15, 0.12, 1.15), surface(HAZARD_YELLOW), 0, 2.4, 0));
  const bit = new Group();
  bit.add(mesh(new CylinderGeometry(0.18, 0.18, 1.4, 6), frame, 0, 1.5, 0));
  bit.add(mesh(new ConeGeometry(0.34, 0.9, 6), surface(0xd4d4d8), 0, 0.55, 0));
  bit.children[1]?.rotateX(Math.PI);
  group.add(bit);
  return (time, dt, running) => {
    if (!running) return;
    bit.rotation.y += dt * 9;
    bit.position.y = Math.sin(time * 6) * 0.12;
  };
}

function buildFurnace(group: Group, accent: number): Animator {
  group.add(mesh(new BoxGeometry(2.0, 1.4, 1.7), surface(STEEL_MID), 0, 0.95, 0));
  group.add(mesh(new BoxGeometry(2.05, 0.18, 1.75), surface(accent), 0, 1.5, 0));
  group.add(mesh(new CylinderGeometry(0.22, 0.28, 1.6, 8), surface(STEEL_DARK), -0.55, 2.1, -0.45));
  const windowMaterial = uniqueGlow(WORK_GLOW, 0.25);
  const window = mesh(new BoxGeometry(0.9, 0.5, 0.05), windowMaterial, 0.2, 0.95, 0.86);
  window.castShadow = false;
  group.add(window);
  return (time, _dt, running) => {
    windowMaterial.opacity = running ? 0.75 + Math.sin(time * 8) * 0.2 : 0.2;
  };
}

function buildRefinery(group: Group, accent: number): Animator {
  const tank = surface(0xe5e7eb);
  group.add(mesh(new CylinderGeometry(0.55, 0.55, 1.9, 10), tank, -0.45, 1.1, -0.2));
  group.add(mesh(new SphereGeometry(0.55, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), tank, -0.45, 2.05, -0.2));
  group.add(mesh(new CylinderGeometry(0.42, 0.42, 1.3, 10), surface(accent), 0.6, 0.8, 0.3));
  const pipe = mesh(new CylinderGeometry(0.09, 0.09, 1.2, 6), surface(STEEL_DARK), 0.1, 1.55, 0.05);
  pipe.rotation.z = Math.PI / 2;
  group.add(pipe);
  const valve = mesh(new TorusGeometry(0.28, 0.06, 6, 12), surface(HAZARD_YELLOW), 0.6, 1.62, 0.3);
  valve.rotation.x = Math.PI / 2;
  group.add(valve);
  return (_time, dt, running) => {
    if (running) valve.rotation.z += dt * 4;
  };
}

function buildAssembler(group: Group, accent: number): Animator {
  group.add(mesh(new BoxGeometry(2.1, 0.9, 2.0), surface(STEEL_MID), 0, 0.7, 0));
  group.add(mesh(new SphereGeometry(0.75, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), surface(accent, { transparent: true, opacity: 0.75 }), 0, 1.15, 0));
  const arms = [-0.85, 0.85].map((x) => {
    const pivot = new Group();
    pivot.position.set(x, 1.15, 0.5);
    pivot.add(mesh(new BoxGeometry(0.16, 0.9, 0.16), surface(HAZARD_YELLOW), 0, 0.45, 0));
    pivot.add(mesh(new SphereGeometry(0.12, 6, 4), surface(STEEL_DARK), 0, 0.92, 0));
    group.add(pivot);
    return pivot;
  });
  return (time, _dt, running) => {
    arms.forEach((arm, index) => {
      arm.rotation.z = running ? Math.sin(time * 4 + index * Math.PI) * 0.55 : 0;
    });
  };
}

const BUILDERS: Record<MachineKind, (group: Group, accent: number) => Animator> = {
  [MachineKind.Drill]: buildDrill,
  [MachineKind.Furnace]: buildFurnace,
  [MachineKind.Refinery]: buildRefinery,
  [MachineKind.Assembler]: buildAssembler,
};

/** A machine model with production animation, level lights and an output pile. */
export class MachineMesh {
  readonly root = new Group();
  readonly outputStack: ItemStack;
  private readonly animate: Animator;
  private readonly levelLights: Mesh[] = [];
  private readonly statusMaterial: MeshBasicMaterial;
  private readonly litMaterial: MeshBasicMaterial;
  private readonly unlitMaterial: MeshBasicMaterial;
  private shownLevel = 0;
  private spawnTime = -1;

  constructor(kind: MachineKind, accent: number) {
    this.root.add(mesh(new CylinderGeometry(1.5, 1.65, 0.3, 8), surface(STEEL_DARK), 0, 0.15, 0));
    this.animate = BUILDERS[kind](this.root, accent);

    this.litMaterial = glow(accent);
    this.unlitMaterial = glow(IDLE_LIGHT);
    for (let level = 0; level < MACHINE_MAX_LEVEL; level += 1) {
      const offset = (level - 1) * 0.28;
      const light = mesh(new BoxGeometry(0.18, 0.1, 0.18), this.unlitMaterial, 1.05 - offset, 0.34, 1.05 + offset);
      light.castShadow = false;
      this.levelLights.push(light);
      this.root.add(light);
    }

    this.statusMaterial = uniqueGlow(IDLE_LIGHT, 1);
    const beacon = mesh(new SphereGeometry(0.13, 8, 6), this.statusMaterial, -1.05, 0.42, 1.05);
    beacon.castShadow = false;
    this.root.add(beacon);

    this.outputStack = new ItemStack({ capacity: MACHINE_OUTPUT_CAPACITY, itemSize: 0.22, columnsX: 2, columnsZ: 2, gap: 0.03 });
    this.outputStack.mesh.position.set(1.35, 0.02, -0.55);
    this.root.add(this.outputStack.mesh);
  }

  setLevel(level: number): void {
    if (level === this.shownLevel) return;
    this.shownLevel = level;
    this.levelLights.forEach((light, index) => {
      light.material = index < level ? this.litMaterial : this.unlitMaterial;
    });
  }

  /** Starts a short pop-in scale animation, e.g. right after construction. */
  playSpawn(time: number): void {
    this.spawnTime = time;
  }

  update(time: number, dt: number, running: boolean): void {
    this.animate(time, dt, running);
    this.statusMaterial.color.setHex(running ? 0x4ade80 : IDLE_LIGHT);
    if (this.spawnTime < 0) return;
    const t = Math.min(1, (time - this.spawnTime) / 0.45);
    const overshoot = 1 + Math.sin(t * Math.PI) * 0.15;
    this.root.scale.setScalar(t * overshoot);
    if (t >= 1) {
      this.root.scale.setScalar(1);
      this.spawnTime = -1;
    }
  }
}
