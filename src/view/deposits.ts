import { BufferAttribute, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Group, IcosahedronGeometry, Mesh, OctahedronGeometry, RepeatWrapping, SphereGeometry, type BufferGeometry, type Material } from "three";
import { ITEMS, type ItemId } from "../config";
import { flat, glow, mesh, surface } from "./materials";
import { canvasTexture } from "./textures";

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

/** A lumpy rock: an icosahedron pushed in and out so every boulder has its own silhouette. */
function lumpy(radius: number, detail: number, seed: number, roughness = 0.28): BufferGeometry {
  const geometry = new IcosahedronGeometry(radius, detail);
  const position = geometry.getAttribute("position") as BufferAttribute;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const wobble = 1 + (Math.sin(x * 9.1 + seed) * Math.cos(z * 7.3 - seed) + Math.sin(y * 11.7 + seed * 0.5)) * roughness * 0.5;
    position.setXYZ(i, x * wobble, y * wobble, z * wobble);
  }
  geometry.computeVertexNormals();
  return geometry;
}

const rockGeometry = new DodecahedronGeometry(0.42, 0);
const columnGeometry = new CylinderGeometry(0.15, 0.17, 1, 6);
const columnTipGeometry = new ConeGeometry(0.15, 0.22, 6);
const crystalGeometry = new CylinderGeometry(0.17, 0.2, 1, 6);
const crystalTipGeometry = new ConeGeometry(0.17, 0.36, 6);
const coreGeometry = new CylinderGeometry(0.07, 0.07, 1, 6);
const nuggetGeometry = new OctahedronGeometry(0.09, 0);
const pebbleGeometry = new DodecahedronGeometry(0.1, 0);
const moundGeometry = new SphereGeometry(0.45, 18, 12);
const ironRockGeometries = [0, 1, 2].map((i) => lumpy(0.42, 1, i * 3.7 + 1));
const slabGeometry = lumpy(0.5, 1, 9.3, 0.18);

const CHIP_COLORS: Record<ItemId, number> = { carbon: 0x2b2e37, clay: 0xc4b298, ironOre: 0x4a4550, plate: 0xc9d1da, heliumX: 0xd8b8ff, heliumCell: 0x6dffd2 };

/** Colour of the bits that fly off a deposit of this item while it is drilled. */
export function chipColor(item: ItemId): number {
  return CHIP_COLORS[item];
}

/** Layered clay: pale and tan strata wrapping round each mound. */
function strataTexture() {
  const texture = canvasTexture("deposit-strata", 64, 64, (ctx) => {
    const bands = ["#cbb89c", "#b39c7c", "#d8c8ad", "#a88f70", "#c4b093"];
    bands.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, (i * 64) / bands.length, 64, 64 / bands.length + 1);
    });
    ctx.fillStyle = "rgba(60,40,20,0.18)";
    for (let i = 0; i < 40; i += 1) ctx.fillRect((i * 23) % 64, (i * 37) % 64, 2, 1);
  });
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/** Scatter a few pebbles round a node's foot. */
function pebbles(root: Group, random: () => number, material: Material, count: number): void {
  for (let i = 0; i < count; i += 1) {
    const angle = random() * Math.PI * 2;
    const reach = 0.55 + random() * 0.3;
    const pebble = mesh(pebbleGeometry, material, Math.cos(angle) * reach, 0.03, Math.sin(angle) * reach);
    pebble.scale.setScalar(0.5 + random() * 0.8);
    pebble.rotation.set(random() * 3, random() * 3, random() * 3);
    root.add(pebble);
  }
}

/** Carbon: glossy hexagonal graphite columns with pointed tips and a cold blue sheen. */
function carbonNode(random: () => number, pieces: number): DepositModel {
  const root = new Group();
  const parts: Mesh[] = [];
  const graphite = surface({ color: 0x20232b, roughness: 0.2, metalness: 0.6, flat: true, reflective: true, envMapIntensity: 1.3 });
  const edge = glow(0x5c78ff, 0.7);
  for (let i = 0; i < pieces; i += 1) {
    const angle = (i / pieces) * Math.PI * 2 + random() * 0.6;
    const reach = i === 0 ? 0 : 0.26 + random() * 0.16;
    const height = i === 0 ? 1.05 : 0.45 + random() * 0.4;
    const column = mesh(columnGeometry, graphite, Math.cos(angle) * reach, height / 2, Math.sin(angle) * reach);
    column.scale.set(1, height, 1);
    column.rotation.set(Math.cos(angle) * 0.45 * (i === 0 ? 0.15 : 1), random() * 3, Math.sin(angle) * 0.45 * (i === 0 ? 0.15 : 1));
    const tip = mesh(columnTipGeometry, graphite, 0, 0.5 + 0.11 / height, 0);
    tip.scale.set(1, 1 / height, 1);
    column.add(tip, mesh(new CylinderGeometry(0.152, 0.152, 0.02, 6), edge, 0, 0.3, 0));
    parts.push(column);
    root.add(column);
  }
  const slab = mesh(slabGeometry, flat(0x2f3139, 0.9), 0, 0.02, 0);
  slab.scale.set(1.25, 0.28, 1.25);
  root.add(slab);
  pebbles(root, random, graphite, 5);
  return { root, pieces: parts, rubble: rubble(flat(0x2b2e37, 0.9)) };
}

/** Moon clay: soft banded mounds with pale and tan strata. */
function clayNode(random: () => number, pieces: number): DepositModel {
  const root = new Group();
  const parts: Mesh[] = [];
  const strata = surface({ map: strataTexture(), color: 0xffffff, roughness: 0.95 });
  for (let i = 0; i < pieces; i += 1) {
    const angle = (i / pieces) * Math.PI * 2 + random() * 0.6;
    const reach = i === 0 ? 0 : 0.38 + random() * 0.16;
    const size = i === 0 ? 1.05 : 0.5 + random() * 0.3;
    const mound = mesh(moundGeometry, strata, Math.cos(angle) * reach, 0.14 * size, Math.sin(angle) * reach);
    mound.scale.set(size, size * 0.62, size * (0.85 + random() * 0.3));
    mound.rotation.set(0, random() * 6, (random() - 0.5) * 0.3);
    parts.push(mound);
    root.add(mound);
  }
  pebbles(root, random, flat(0xa89478, 0.95), 6);
  return { root, pieces: parts, rubble: rubble(flat(ITEMS.clay.color, 0.95)) };
}

/** Iron ore: rugged dark boulders streaked with rust and studded with metal nuggets. */
function ironNode(random: () => number, pieces: number): DepositModel {
  const root = new Group();
  const parts: Mesh[] = [];
  const stone = flat(0x4d4852, 0.92);
  const rust = surface({ color: 0xd9813f, emissive: 0x8a3a10, emissiveIntensity: 0.6, roughness: 0.6, flat: true });
  const metal = surface({ color: 0xc08a5a, roughness: 0.25, metalness: 0.9, flat: true, reflective: true, envMapIntensity: 1.2 });
  for (let i = 0; i < pieces; i += 1) {
    const angle = (i / pieces) * Math.PI * 2 + random() * 0.6;
    const reach = i === 0 ? 0 : 0.4 + random() * 0.15;
    const scale = i === 0 ? 1.1 : 0.55 + random() * 0.3;
    const boulder = mesh(ironRockGeometries[i % ironRockGeometries.length] as BufferGeometry, stone, Math.cos(angle) * reach, 0.26 * scale, Math.sin(angle) * reach);
    boulder.scale.set(scale, scale * 0.78, scale);
    boulder.rotation.set(random(), random() * 6, random());
    for (let n = 0; n < 3; n += 1) {
      const a = random() * Math.PI * 2;
      const nugget = mesh(nuggetGeometry, n === 0 ? rust : metal, Math.cos(a) * 0.36, 0.1 + random() * 0.2, Math.sin(a) * 0.36);
      nugget.scale.set(1, 1.4, 1);
      nugget.rotation.set(random() * 3, random() * 3, random() * 3);
      boulder.add(nugget);
    }
    const streak = mesh(new CylinderGeometry(0.43, 0.43, 0.05, 10, 1, true, a0(random), 1.2), rust, 0, 0.05, 0);
    boulder.add(streak);
    parts.push(boulder);
    root.add(boulder);
  }
  pebbles(root, random, stone, 5);
  return { root, pieces: parts, rubble: rubble(stone) };
}

function a0(random: () => number): number {
  return random() * Math.PI * 2;
}

/** Helium X: pointed violet crystals, each with a brighter glowing core. */
function crystalNode(random: () => number, pieces: number): DepositModel {
  const root = new Group();
  const parts: Mesh[] = [];
  const shell = surface({ color: 0xd9c2ff, roughness: 0.05, metalness: 0.1, emissive: ITEMS.heliumX.color, emissiveIntensity: 0.35, flat: true, reflective: true, envMapIntensity: 1.1, transparent: true, opacity: 0.82 });
  const core = glow(0xc9a6ff, 1.3);
  for (let i = 0; i < pieces; i += 1) {
    const angle = (i / pieces) * Math.PI * 2 + random() * 0.5;
    const reach = i === 0 ? 0 : 0.24 + random() * 0.18;
    const height = i === 0 ? 1.3 : 0.6 + random() * 0.55;
    const crystal = mesh(crystalGeometry, shell, Math.cos(angle) * reach, height / 2, Math.sin(angle) * reach);
    crystal.scale.set(1, height, 1);
    crystal.rotation.set(Math.cos(angle) * 0.38 * (i === 0 ? 0 : 1), random() * 3, Math.sin(angle) * 0.38 * (i === 0 ? 0 : 1));
    const tip = mesh(crystalTipGeometry, shell, 0, 0.5 + 0.18 / height, 0);
    tip.scale.set(1, 1 / height, 1);
    const glowCore = mesh(coreGeometry, core, 0, 0, 0);
    glowCore.scale.set(1, 0.92, 1);
    crystal.add(tip, glowCore);
    parts.push(crystal);
    root.add(crystal);
  }
  const base = mesh(slabGeometry, flat(0x6a6478, 0.9), 0, 0.03, 0);
  base.scale.set(1.2, 0.3, 1.2);
  root.add(base);
  pebbles(root, random, shell, 4);
  return { root, pieces: parts, rubble: rubble(flat(0x8a7fa0, 0.9)) };
}

function rubble(material: Material): Group {
  const group = new Group();
  for (let i = 0; i < 5; i += 1) {
    const bit = mesh(rockGeometry, material, Math.cos(i * 1.7) * 0.32, 0.05, Math.sin(i * 1.7) * 0.32);
    bit.scale.setScalar(0.18 + (i % 3) * 0.05);
    bit.rotation.set(i, i * 2, i * 0.5);
    group.add(bit);
  }
  group.visible = false;
  return group;
}

export function depositModel(item: ItemId, seed: number, pieces = 5): DepositModel {
  const random = seeded(seed);
  const model = item === "carbon" ? carbonNode(random, pieces) : item === "clay" ? clayNode(random, pieces) : item === "heliumX" ? crystalNode(random, pieces) : ironNode(random, pieces);
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
