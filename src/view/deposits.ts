import { CylinderGeometry, DodecahedronGeometry, Group, Mesh, OctahedronGeometry } from "three";
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

/** Colour of the rock chips that fly off a deposit of this item while it is drilled. */
export function chipColor(item: ItemId): number {
  return ITEMS[item].shape === "ice" ? 0xbfefff : 0x4a4550;
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

/** Inner glow of icy deposits, picked by eye per item. */
const ICE_GLOW: Partial<Record<ItemId, number>> = { ice: 0x2a9ad0, dryIce: 0x6f7fe0 };

function iceNode(random: () => number, pieces: number, item: ItemId, color: number): DepositModel {
  const root = new Group();
  const parts: Mesh[] = [];
  const ice = surface({ color, roughness: 0.06, metalness: 0.1, emissive: ICE_GLOW[item] ?? color, emissiveIntensity: 0.5, flat: true, reflective: true, envMapIntensity: 1.4 });
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
  const base = mesh(iceBaseGeometry, flat(0x6d8394, 0.9), 0, 0.05, 0);
  base.scale.set(1.2, 0.35, 1.2);
  root.add(base);
  return { root, pieces: parts, rubble: rubble(flat(0x7f9db0, 0.9)) };
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
  const { shape, color } = ITEMS[item];
  const model = shape === "ice" ? iceNode(random, pieces, item, color) : oreNode(random, pieces, color);
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
