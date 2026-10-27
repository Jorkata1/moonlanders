import {
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  SphereGeometry,
  type Material,
  type BufferGeometry,
} from 'three';
import type { ResourceId } from '../config/resources';
import { ItemStack } from './itemStack';
import { STEEL_DARK, SUIT_WHITE, glow, surface } from './materials';

const TURN_RATE = 14;
const STRIDE_RATE = 11;
const BACKPACK_STACK_CAPACITY = 40;

function part(geometry: BufferGeometry, material: Material, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

function shortestAngle(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/** Low-poly astronaut with walk cycle and a cube stack on its back. */
export class Astronaut {
  readonly root = new Group();
  private readonly body = new Group();
  private readonly leftLeg: Mesh;
  private readonly rightLeg: Mesh;
  private readonly leftArm: Mesh;
  private readonly rightArm: Mesh;
  private readonly carried: ItemStack;
  private walkPhase = 0;
  private heading = 0;

  constructor(accent: number) {
    const white = surface(SUIT_WHITE);
    const dark = surface(STEEL_DARK);
    const trim = surface(accent);

    this.leftLeg = part(new BoxGeometry(0.2, 0.5, 0.22), white, -0.14, 0.25, 0);
    this.rightLeg = part(new BoxGeometry(0.2, 0.5, 0.22), white, 0.14, 0.25, 0);
    this.leftLeg.geometry.translate(0, -0.2, 0);
    this.rightLeg.geometry.translate(0, -0.2, 0);
    this.leftLeg.position.y = 0.48;
    this.rightLeg.position.y = 0.48;

    const torso = part(new CapsuleGeometry(0.3, 0.32, 3, 8), white, 0, 0.86, 0);
    const belt = part(new CylinderGeometry(0.31, 0.31, 0.08, 8), trim, 0, 0.7, 0);
    const helmet = part(new SphereGeometry(0.32, 10, 8), white, 0, 1.38, 0);
    const visor = part(new SphereGeometry(0.24, 10, 8), glow(0x1d2a44), 0, 1.4, 0.13);
    visor.scale.set(1.05, 0.78, 0.7);
    const visorShine = part(new SphereGeometry(0.06, 6, 4), glow(0xbfe9ff), 0.09, 1.47, 0.29);
    const pack = part(new BoxGeometry(0.46, 0.52, 0.24), dark, 0, 0.92, -0.3);
    const antenna = part(new CylinderGeometry(0.015, 0.015, 0.34, 4), dark, 0.16, 1.32, -0.34);
    const antennaTip = part(new SphereGeometry(0.04, 6, 4), glow(accent), 0.16, 1.5, -0.34);

    this.leftArm = part(new CapsuleGeometry(0.08, 0.36, 2, 6), white, -0.38, 0.92, 0);
    this.rightArm = part(new CapsuleGeometry(0.08, 0.36, 2, 6), white, 0.38, 0.92, 0);

    this.carried = new ItemStack({ capacity: BACKPACK_STACK_CAPACITY, itemSize: 0.17, columnsX: 2, columnsZ: 2, gap: 0.02 });
    this.carried.mesh.position.set(0, 1.2, -0.36);

    this.body.add(torso, belt, helmet, visor, visorShine, pack, antenna, antennaTip, this.leftArm, this.rightArm);
    this.body.add(this.carried.mesh);
    this.root.add(this.body, this.leftLeg, this.rightLeg);
    this.root.traverse((child) => {
      if (child instanceof Mesh) child.castShadow = true;
    });
  }

  setCarried(items: readonly ResourceId[]): void {
    this.carried.setItems(items);
  }

  update(dt: number, x: number, z: number, facing: number, isMoving: boolean, speed: number): void {
    this.root.position.set(x, 0, z);
    if (isMoving) {
      this.heading += shortestAngle(this.heading, facing) * Math.min(1, TURN_RATE * dt);
      this.walkPhase += dt * STRIDE_RATE * (speed / 5);
    } else {
      this.walkPhase *= Math.max(0, 1 - dt * 10);
    }
    this.root.rotation.y = this.heading;

    const swing = Math.sin(this.walkPhase) * (isMoving ? 0.6 : 0);
    this.leftLeg.rotation.x = swing;
    this.rightLeg.rotation.x = -swing;
    this.leftArm.rotation.x = -swing * 0.8;
    this.rightArm.rotation.x = swing * 0.8;
    this.body.position.y = isMoving ? Math.abs(Math.sin(this.walkPhase)) * 0.08 : 0;
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }
}
