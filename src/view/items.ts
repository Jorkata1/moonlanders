import { CapsuleGeometry, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Group, Mesh, OctahedronGeometry, type BufferGeometry, type Material } from "three";
import { ITEMS, type ItemId } from "../config";
import { LOOK, glow, mesh, roundedBox, surface } from "./materials";

/** One small mesh per item type, shared by stacks, flying items and machine trays. */

interface ItemLook {
  parts: Array<{ geometry: BufferGeometry; material: Material; y: number; scale?: [number, number, number]; rotation?: [number, number, number] }>;
}

const oreGeometry = new DodecahedronGeometry(0.13, 0);
const nuggetGeometry = new OctahedronGeometry(0.045, 0);
// Prisms and crystals lie on their side so they stack like logs.
const prismGeometry = new CylinderGeometry(0.075, 0.085, 0.2, 6).rotateZ(Math.PI / 2);
const prismTipGeometry = new ConeGeometry(0.075, 0.1, 6).rotateZ(-Math.PI / 2).translate(0.15, 0, 0);
const prismEdgeGeometry = new CylinderGeometry(0.087, 0.087, 0.015, 6).rotateZ(Math.PI / 2).translate(0.05, 0, 0);
const brickGeometry = roundedBox(0.26, 0.12, 0.2, 0.05);
const bandGeometry = roundedBox(0.265, 0.035, 0.205, 0.015);
const plateGeometry = roundedBox(0.34, 0.06, 0.26, 0.02);
const plateFaceGeometry = roundedBox(0.28, 0.02, 0.2, 0.01);
const boltGeometry = new CylinderGeometry(0.012, 0.012, 0.012, 6);
const crystalGeometry = new CylinderGeometry(0.06, 0.075, 0.2, 6).rotateZ(Math.PI / 2);
const crystalTipGeometry = new ConeGeometry(0.06, 0.12, 6).rotateZ(-Math.PI / 2).translate(0.16, 0, 0);
const crystalCoreGeometry = new CylinderGeometry(0.025, 0.025, 0.22, 6).rotateZ(Math.PI / 2);
const cellGeometry = new CapsuleGeometry(0.075, 0.12, 4, 12);
const cellBandGeometry = new CylinderGeometry(0.078, 0.078, 0.07, 14);
const capGeometry = new CylinderGeometry(0.05, 0.06, 0.04, 10);

const BOLT_CORNERS: ReadonlyArray<readonly [number, number]> = [[-0.12, -0.08], [0.12, -0.08], [-0.12, 0.08], [0.12, 0.08]];

const LOOKS: Record<ItemId, () => ItemLook> = {
  // A glossy hexagonal graphite prism with a pointed tip and a blue edge, lying down.
  carbon: () => {
    const graphite = surface({ color: 0x22252d, roughness: 0.2, metalness: 0.6, flat: true, reflective: true, envMapIntensity: 1.3 });
    return {
      parts: [
        { geometry: prismGeometry, material: graphite, y: 0.085 },
        { geometry: prismTipGeometry, material: graphite, y: 0.085 },
        { geometry: prismEdgeGeometry, material: glow(0x6f8cff, 0.9), y: 0.085 },
      ],
    };
  },
  // A rounded clay brick with a darker band of strata.
  clay: () => ({
    parts: [
      { geometry: brickGeometry, material: surface({ color: ITEMS.clay.color, roughness: 0.95 }), y: 0.06 },
      { geometry: bandGeometry, material: surface({ color: 0xa88f70, roughness: 0.95 }), y: 0.065 },
    ],
  }),
  // A dark rock with a rusty streak and two copper nuggets.
  ironOre: () => {
    const metal = surface({ color: 0xc08a5a, roughness: 0.25, metalness: 0.9, flat: true, reflective: true, envMapIntensity: 1.2 });
    return {
      parts: [
        { geometry: oreGeometry, material: surface({ color: 0x55505c, roughness: 0.9, flat: true }), y: 0.1, scale: [1.15, 0.85, 1] },
        { geometry: nuggetGeometry, material: surface({ color: 0xd9813f, emissive: 0x8a3a10, emissiveIntensity: 0.6, roughness: 0.6, flat: true }), y: 0.19, rotation: [0.4, 0.2, 0] },
        { geometry: nuggetGeometry, material: metal, y: 0.14, scale: [1.2, 1, 1.2], rotation: [1, 0.6, 0.3] },
      ],
    };
  },
  // A machined plate: steel sheet, lighter inset face and four bolts.
  plate: () => {
    const steel = surface({ color: 0x9aa3b0, roughness: 0.3, metalness: 0.8, reflective: true, envMapIntensity: 1.1 });
    const face = surface({ color: 0xe3e8ef, roughness: 0.25, metalness: 0.6, reflective: true, envMapIntensity: 1.2 });
    return {
      parts: [
        { geometry: plateGeometry, material: steel, y: 0.03 },
        { geometry: plateFaceGeometry, material: face, y: 0.065 },
        ...BOLT_CORNERS.map(([x, z]) => ({ geometry: boltGeometry.clone().translate(x, 0, z), material: steel, y: 0.08 })),
      ],
    };
  },
  // A pointed violet crystal with a bright core, lying down.
  heliumX: () => {
    const shell = surface({ color: 0xd9c2ff, roughness: 0.06, metalness: 0.1, emissive: ITEMS.heliumX.color, emissiveIntensity: 0.45, flat: true, reflective: true, envMapIntensity: 1.0 });
    return {
      parts: [
        { geometry: crystalGeometry, material: shell, y: 0.075 },
        { geometry: crystalTipGeometry, material: shell, y: 0.075 },
        { geometry: crystalCoreGeometry, material: glow(0xc9a6ff, 1.3), y: 0.075 },
      ],
    };
  },
  // A capsule cell with a glowing charge band and dark end caps.
  heliumCell: () => ({
    parts: [
      { geometry: cellGeometry, material: surface({ color: 0xdfe6ea, roughness: 0.3, reflective: true, envMapIntensity: 0.6 }), y: 0.13 },
      { geometry: cellBandGeometry, material: glow(ITEMS.heliumCell.color, 2), y: 0.13 },
      { geometry: capGeometry, material: LOOK.dark(), y: 0.27 },
      { geometry: capGeometry, material: LOOK.dark(), y: 0.0 },
    ],
  }),
};

export function itemModel(item: ItemId): Group {
  const group = new Group();
  for (const part of LOOKS[item]().parts) {
    const piece: Mesh = mesh(part.geometry, part.material, 0, part.y, 0);
    if (part.scale) piece.scale.set(...part.scale);
    if (part.rotation) piece.rotation.set(...part.rotation);
    piece.castShadow = true;
    group.add(piece);
  }
  group.userData.item = item;
  return group;
}

/** Recycles item models so stacks that grow and shrink every frame do not allocate. */
export class ItemPool {
  private readonly free = new Map<ItemId, Group[]>();

  take(item: ItemId): Group {
    const list = this.free.get(item);
    const reused = list?.pop();
    if (reused) {
      reused.visible = true;
      reused.scale.setScalar(1);
      reused.rotation.set(0, 0, 0);
      return reused;
    }
    return itemModel(item);
  }

  give(model: Group): void {
    model.removeFromParent();
    const item = model.userData.item as ItemId;
    const list = this.free.get(item) ?? [];
    list.push(model);
    this.free.set(item, list);
  }
}

/** Keeps a column of item models in sync with an array of item ids. */
export class StackView {
  private readonly models: Group[] = [];

  constructor(
    readonly root: Group,
    private readonly pool: ItemPool,
    private readonly columns = 1,
    private readonly columnSpacing = 0.3,
  ) {}

  sync(items: readonly ItemId[], time: number, sway: number): void {
    while (this.models.length > items.length) {
      const extra = this.models.pop();
      if (extra) this.pool.give(extra);
    }
    items.forEach((wanted, i) => {
      const current = this.models[i];
      if (current?.userData.item === wanted) return;
      if (current) this.pool.give(current);
      const model = this.pool.take(wanted);
      this.root.add(model);
      this.models[i] = model;
    });

    const heights = new Array<number>(this.columns).fill(0);
    this.models.forEach((model, index) => {
      const column = index % this.columns;
      const y = heights[column] ?? 0;
      heights[column] = y + ITEMS[model.userData.item as ItemId].stackHeight;
      const lean = Math.sin(time * 6) * sway * y * 0.08;
      model.position.set((column - (this.columns - 1) / 2) * this.columnSpacing + lean, y, 0);
      model.rotation.y = (index * 0.37) % 0.5;
    });
  }

  /** World-space top of the stack, for flying items to aim at. */
  topLocalY(): number {
    let top = 0;
    for (const model of this.models) top = Math.max(top, model.position.y + ITEMS[model.userData.item as ItemId].stackHeight);
    return top;
  }
}
