import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  Mesh,
  OctahedronGeometry,
  RingGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  type MeshBasicMaterial,
} from 'three';
import type { DepositDefinition, Vec2 } from '../config/planets/types';
import { RESOURCES } from '../config/resources';
import { PadType } from '../core/pads';
import { createRandom, randomBetween } from '../core/random';
import { HAZARD_YELLOW, STEEL_DARK, STEEL_MID, SUIT_WHITE, glow, surface, uniqueGlow } from './materials';

const CRYSTAL_RESOURCES = new Set(['ice', 'brine', 'crystal']);

export const PAD_COLORS: Readonly<Record<PadType, number>> = {
  [PadType.Build]: 0x38bdf8,
  [PadType.Upgrade]: 0x4ade80,
  [PadType.Suit]: 0xc084fc,
  [PadType.Rocket]: HAZARD_YELLOW,
};

function flatRing(inner: number, outer: number, material: MeshBasicMaterial, segments = 48): Mesh {
  const ring = new Mesh(new RingGeometry(inner, outer, segments), material);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  return ring;
}

/** A harvestable cluster of rocks or crystals. */
export class DepositMesh {
  readonly root = new Group();
  private readonly cluster = new Group();
  private readonly ringMaterial: MeshBasicMaterial;

  constructor(definition: DepositDefinition, seed: number) {
    const random = createRandom(seed);
    const color = RESOURCES[definition.resource].color;
    const isCrystal = CRYSTAL_RESOURCES.has(definition.resource);
    const material = surface(color, isCrystal ? { emissive: color, emissiveIntensity: 0.25 } : {});

    for (let i = 0; i < 9; i += 1) {
      const angle = random() * Math.PI * 2;
      const distance = randomBetween(random, 0.2, definition.radius * 0.75);
      const size = randomBetween(random, 0.35, 0.8);
      const geometry = isCrystal ? new OctahedronGeometry(size, 0) : new DodecahedronGeometry(size, 0);
      const piece = new Mesh(geometry, material);
      piece.position.set(Math.cos(angle) * distance, size * (isCrystal ? 0.9 : 0.5), Math.sin(angle) * distance);
      if (isCrystal) piece.scale.set(0.6, 1.6, 0.6);
      piece.rotation.set(random() * 0.6, random() * Math.PI, random() * 0.6);
      piece.castShadow = true;
      piece.receiveShadow = true;
      this.cluster.add(piece);
    }

    this.ringMaterial = uniqueGlow(color, 0.35);
    this.root.add(this.cluster, flatRing(definition.radius - 0.12, definition.radius, this.ringMaterial));
    this.root.position.set(definition.position.x, 0, definition.position.z);
  }

  update(time: number, isHarvesting: boolean): void {
    this.ringMaterial.opacity = isHarvesting ? 0.6 + Math.sin(time * 10) * 0.25 : 0.3;
    this.cluster.position.y = isHarvesting ? Math.abs(Math.sin(time * 18)) * 0.05 : 0;
  }
}

/** A square payment pad with a fill bar that grows as it is paid. */
export class PadMesh {
  readonly root = new Group();
  private readonly fill: Mesh;
  private readonly borderMaterial: MeshBasicMaterial;

  constructor(type: PadType, radius: number) {
    const color = PAD_COLORS[type];
    if (type === PadType.Rocket) {
      this.borderMaterial = uniqueGlow(color, 0.5);
      this.root.add(flatRing(radius - 0.15, radius, this.borderMaterial, 64));
      this.fill = flatRing(radius - 0.4, radius - 0.25, glow(color, 0.9), 64);
      this.root.add(this.fill);
      return;
    }
    const size = radius * 1.8;
    this.borderMaterial = uniqueGlow(color, 0.55);
    const border = new Mesh(new BoxGeometry(size, 0.05, size), this.borderMaterial);
    border.position.y = 0.025;
    const inner = new Mesh(new BoxGeometry(size * 0.82, 0.07, size * 0.82), surface(STEEL_DARK));
    inner.position.y = 0.035;
    inner.receiveShadow = true;
    this.fill = new Mesh(new BoxGeometry(size * 0.82, 0.08, size * 0.82), glow(color, 0.85));
    this.fill.position.y = 0.04;
    this.root.add(border, inner, this.fill);
  }

  setPosition(position: Vec2): void {
    this.root.position.set(position.x, 0, position.z);
  }

  update(time: number, progress: number, isActive: boolean): void {
    const clamped = Math.max(0.001, Math.min(1, progress));
    this.fill.scale.set(clamped, 1, clamped);
    this.fill.visible = progress > 0;
    this.borderMaterial.opacity = isActive ? 0.75 + Math.sin(time * 9) * 0.2 : 0.45 + Math.sin(time * 2.5) * 0.1;
  }
}

/** Translucent life-support dome marking the oxygen refill area. */
export function createDome(radius: number, accent: number): Group {
  const group = new Group();
  const shell = new Mesh(
    new SphereGeometry(radius, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    surface(0xbfe9ff, { transparent: true, opacity: 0.07, doubleSided: true }),
  );
  shell.scale.y = 0.45;
  group.add(shell, flatRing(radius - 0.12, radius, glow(accent, 0.45), 96));
  return group;
}

/** Suit upgrade kiosk. */
export function createSuitStation(position: Vec2, accent: number): Group {
  const group = new Group();
  const base = new Mesh(new CylinderGeometry(0.9, 1.0, 0.3, 8), surface(STEEL_DARK));
  base.position.y = 0.15;
  const column = new Mesh(new BoxGeometry(0.8, 1.6, 0.6), surface(STEEL_MID));
  column.position.y = 1.0;
  const screen = new Mesh(new BoxGeometry(0.6, 0.45, 0.05), glow(accent));
  screen.position.set(0, 1.35, 0.32);
  const helmet = new Mesh(new SphereGeometry(0.3, 10, 8), surface(SUIT_WHITE));
  helmet.position.y = 2.05;
  for (const part of [base, column, helmet]) {
    part.castShadow = true;
    part.receiveShadow = true;
  }
  group.add(base, column, screen, helmet);
  group.position.set(position.x, 0, position.z);
  group.rotation.y = Math.PI / 4;
  return group;
}

/** Ground chevron that points toward the current objective. */
export function createObjectiveArrow(): Mesh {
  const shape = new Shape();
  shape.moveTo(0, 0.55);
  shape.lineTo(0.42, 0);
  shape.lineTo(0.16, 0);
  shape.lineTo(0.16, -0.4);
  shape.lineTo(-0.16, -0.4);
  shape.lineTo(-0.16, 0);
  shape.lineTo(-0.42, 0);
  shape.closePath();
  const arrow = new Mesh(new ShapeGeometry(shape), uniqueGlow(HAZARD_YELLOW, 0.85));
  arrow.geometry.rotateX(-Math.PI / 2);
  arrow.position.y = 0.06;
  return arrow;
}

/** Belt between two machines with cubes that travel along it when active. */
export class ConveyorMesh {
  readonly root = new Group();
  private readonly items: Mesh[] = [];
  private readonly length: number;
  private offset = 0;

  constructor(from: Vec2, to: Vec2, itemColor: number) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    this.length = Math.hypot(dx, dz);
    const belt = new Mesh(new BoxGeometry(0.55, 0.1, this.length), surface(STEEL_DARK));
    belt.position.y = 0.05;
    belt.receiveShadow = true;
    const rail = surface(HAZARD_YELLOW);
    for (const side of [-0.3, 0.3]) {
      const edge = new Mesh(new BoxGeometry(0.06, 0.14, this.length), rail);
      edge.position.set(side, 0.07, 0);
      this.root.add(edge);
    }
    this.root.add(belt);
    const itemMaterial = surface(itemColor);
    const count = Math.max(3, Math.floor(this.length / 1.6));
    for (let i = 0; i < count; i += 1) {
      const item = new Mesh(new BoxGeometry(0.24, 0.2, 0.24), itemMaterial);
      item.castShadow = true;
      this.items.push(item);
      this.root.add(item);
    }
    this.root.position.set((from.x + to.x) / 2, 0, (from.z + to.z) / 2);
    this.root.rotation.y = Math.atan2(dx, dz);
  }

  update(dt: number, isFlowing: boolean): void {
    if (isFlowing) this.offset = (this.offset + dt * 1.6) % 1.6;
    const spacing = this.length / this.items.length;
    this.items.forEach((item, index) => {
      item.visible = isFlowing;
      const along = ((index * spacing + this.offset * (spacing / 1.6)) % this.length) - this.length / 2;
      item.position.set(0, 0.22, along);
    });
  }
}

const RECYCLER_COLOR = 0xf87171;

/** Bin that destroys unwanted backpack items while the player stands on it. */
export class RecyclerMesh {
  readonly root = new Group();
  private readonly ringMaterial: MeshBasicMaterial;
  private readonly lid: Mesh;

  constructor(position: Vec2, radius: number) {
    this.ringMaterial = uniqueGlow(RECYCLER_COLOR, 0.5);
    const bin = new Mesh(new CylinderGeometry(0.42, 0.34, 0.8, 8), surface(STEEL_MID));
    bin.position.set(0, 0.4, -radius - 0.35);
    const stripe = new Mesh(new CylinderGeometry(0.43, 0.43, 0.12, 8), surface(RECYCLER_COLOR));
    stripe.position.set(0, 0.55, -radius - 0.35);
    this.lid = new Mesh(new CylinderGeometry(0.46, 0.46, 0.08, 8), surface(STEEL_DARK));
    this.lid.position.set(0, 0.84, -radius - 0.35);
    for (const part of [bin, stripe, this.lid]) part.castShadow = true;
    this.root.add(flatRing(radius - 0.14, radius, this.ringMaterial, 32), bin, stripe, this.lid);
    this.root.position.set(position.x, 0, position.z);
  }

  update(time: number, isActive: boolean): void {
    this.ringMaterial.opacity = isActive ? 0.7 + Math.sin(time * 12) * 0.25 : 0.4;
    this.lid.rotation.x = isActive ? -0.6 : 0;
  }
}

/** Light construction scaffold shown on unbuilt machine sites. */
export function createScaffold(): Group {
  const group = new Group();
  const pole = surface(HAZARD_YELLOW);
  for (const [x, z] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]] as const) {
    const post = new Mesh(new BoxGeometry(0.1, 1.2, 0.1), pole);
    post.position.set(x, 0.6, z);
    group.add(post);
  }
  const cone = new Mesh(new ConeGeometry(0.18, 0.4, 6), surface(0xf97316));
  cone.position.set(1.6, 0.2, 1.1);
  group.add(cone);
  return group;
}
