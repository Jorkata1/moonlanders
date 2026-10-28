import { CylinderGeometry, DodecahedronGeometry, Group, IcosahedronGeometry, Mesh, OctahedronGeometry } from "three";
import { ITEMS, type ItemId } from "../config";
import { flat, glow, mesh, surface } from "./materials";

/** A resource node: a cluster of pieces that shrink one by one as the node is mined. */
export interface DepositModel {
  root: Group;
  /** Pieces that disappear as the amount drops, largest last. */
  pieces: Mesh[];
  rubble: Group;
}

function seeded(seed: number): () => number {
  let state = seed * 9301 + 49297;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

const rockGeometry = new DodecahedronGeometry(0.42, 0);
const veinGeometry = new OctahedronGeometry(0.16, 0);
const crystalGeometry = new CylinderGeometry(0.2, 0.26, 1, 6);
const iceBaseGeometry = new DodecahedronGeometry(0.5, 0);
const shardGeometry = new OctahedronGeometry(0.3, 0);
const lumpGeometry = new IcosahedronGeometry(0.45, 1);

const CHIP_COLORS: Record<ItemId, number> = { carbon: 0x2b2e37, clay: 0xc4b298, ironOre: 0x4a4550, plate: 0xc9d1da, heliumX: 0xd8b8ff, heliumCell: 0x6dffd2 };

/** Colour of the bits that fly off a deposit of this item while it is drilled. */
export function chipColor(item: ItemId): number {
  return CHIP_COLORS[item];
}

function oreNode(random: () => number, pieces: number, veinColor: number): DepositModel {
  const root = new Group();
  const parts: Mesh[] = [];
  const stone = flat(0x55505c, 0.95);
  const vein = glow(veinColor, 1.6);
  for (let i = 0; i < pieces; i += 1) {
    const angle = (i / pieces) * Math.PI * 2 + random() * 0.6;
    const reach = i === 0 ? 0 : 0.38 + random() * 0.18;
    const scale = i === 0 ? 1.15 : 0.6 + random() * 0.3;
    const chunk = mesh(rockGeometry, stone, Math.cos(angle) * reach, 0.25 * scale, Math.sin(angle) * reach);
    chunk.scale.set(scale, scale * 0.8, scale);
    chunk.rotation.set(random(), random() * 6, random());
    for (let v = 0; v < 1; v += 1) {
      const shard = mesh(veinGeometry, vein, (random() - 0.5) * 0.5, 0.25 + random() * 0.15, (random() - 0.5) * 0.5);
      shard.scale.set(0.8, 1.5, 0.8);
      shard.rotation.set(random(), random(), random());
      chunk.add(shard);
    }
    parts.push(chunk);
    root.add(chunk);
  }
  return { root, pieces: parts, rubble: rubble(stone) };
}

/** Helium X: violet crystals with an inner glow, growing out of a pale base. */
function crystalNode(random: () => number, pieces: number): DepositModel {
  const root = new Group();
  const parts: Mesh[] = [];
  const ice = surface({ color: 0xd9c2ff, roughness: 0.06, metalness: 0.1, emissive: ITEMS.heliumX.color, emissiveIntensity: 0.7, flat: true, reflective: true, envMapIntensity: 1.4 });
  for (let i = 0; i < pieces; i += 1) {
    const angle = (i / pieces) * Math.PI * 2 + random() * 0.5;
    const reach = i === 0 ? 0 : 0.25 + random() * 0.2;
    const height = i === 0 ? 1.5 : 0.7 + random() * 0.6;
    const crystal = mesh(crystalGeometry, ice, Math.cos(angle) * reach, height / 2, Math.sin(angle) * reach);
    crystal.scale.set(1, height, 1);
    crystal.rotation.set(Math.cos(angle) * 0.35 * (i === 0 ? 0 : 1), random() * 3, Math.sin(angle) * 0.35 * (i === 0 ? 0 : 1));
    parts.push(crystal);
    root.add(crystal);
  }
  const base = mesh(iceBaseGeometry, flat(0x6a6478, 0.9), 0, 0.05, 0);
  base.scale.set(1.2, 0.35, 1.2);
  root.add(base);
  return { root, pieces: parts, rubble: rubble(flat(0x8a7fa0, 0.9)) };
}

/** Carbon: glossy black shards standing out of a dark slab. */
function carbonNode(random: () => number, pieces: number): DepositModel {
  const root = new Group();
  const parts: Mesh[] = [];
  const graphite = surface({ color: 0x23262e, roughness: 0.22, metalness: 0.55, flat: true, reflective: true, envMapIntensity: 1.2 });
  const sheen = glow(0x5c78ff, 0.5);
  for (let i = 0; i < pieces; i += 1) {
    const angle = (i / pieces) * Math.PI * 2 + random() * 0.6;
    const reach = i === 0 ? 0 : 0.3 + random() * 0.2;
    const height = i === 0 ? 1.1 : 0.55 + random() * 0.4;
    const shard = mesh(shardGeometry, graphite, Math.cos(angle) * reach, height * 0.4, Math.sin(angle) * reach);
    shard.scale.set(0.8, height, 0.8);
    shard.rotation.set(Math.cos(angle) * 0.4 * (i === 0 ? 0.2 : 1), random() * 3, Math.sin(angle) * 0.4 * (i === 0 ? 0.2 : 1));
    const glint = mesh(veinGeometry, sheen, 0, 0.15, 0.12);
    glint.scale.set(0.5, 1, 0.5);
    shard.add(glint);
    parts.push(shard);
    root.add(shard);
  }
  const slab = mesh(iceBaseGeometry, flat(0x34363f, 0.9), 0, 0.04, 0);
  slab.scale.set(1.2, 0.3, 1.2);
  root.add(slab);
  return { root, pieces: parts, rubble: rubble(flat(0x2b2e37, 0.9)) };
}

/** Moon clay: soft rounded mounds, no shine. */
function clayNode(random: () => number, pieces: number): DepositModel {
  const root = new Group();
  const parts: Mesh[] = [];
  const clay = flat(ITEMS.clay.color, 0.97);
  const darker = flat(0x9a8770, 0.97);
  for (let i = 0; i < pieces; i += 1) {
    const angle = (i / pieces) * Math.PI * 2 + random() * 0.6;
    const reach = i === 0 ? 0 : 0.36 + random() * 0.2;
    const size = i === 0 ? 1.1 : 0.55 + random() * 0.3;
    const lump = mesh(lumpGeometry, i % 2 === 0 ? clay : darker, Math.cos(angle) * reach, 0.16 * size, Math.sin(angle) * reach);
    lump.scale.set(size, size * 0.55, size);
    lump.rotation.y = random() * 6;
    parts.push(lump);
    root.add(lump);
  }
  return { root, pieces: parts, rubble: rubble(clay) };
}

function rubble(material: ReturnType<typeof flat>): Group {
  const group = new Group();
  for (let i = 0; i < 4; i += 1) {
    const bit = mesh(rockGeometry, material, Math.cos(i * 1.7) * 0.3, 0.05, Math.sin(i * 1.7) * 0.3);
    bit.scale.setScalar(0.25);
    group.add(bit);
  }
  group.visible = false;
  return group;
}

export function depositModel(item: ItemId, seed: number, pieces = 5): DepositModel {
  const random = seeded(seed);
  const model = item === "carbon" ? carbonNode(random, pieces) : item === "clay" ? clayNode(random, pieces) : item === "heliumX" ? crystalNode(random, pieces) : oreNode(random, pieces, ITEMS[item].color);
  model.root.add(model.rubble);
  model.root.traverse((object) => {
    if (object instanceof Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return model;
}

/** Show as many pieces as there is resource left; rubble when empty. */
export function syncDeposit(model: DepositModel, amount: number, maxAmount: number, wobble: number): void {
  const visible = Math.ceil((amount / maxAmount) * model.pieces.length);
  model.pieces.forEach((piece, index) => {
    piece.visible = index < visible;
  });
  model.rubble.visible = amount <= 0;
  model.root.rotation.z = wobble;
}
