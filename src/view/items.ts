import { ConeGeometry, CylinderGeometry, DodecahedronGeometry, Group, IcosahedronGeometry, Mesh, OctahedronGeometry, TorusGeometry, type BufferGeometry, type Material } from "three";
import { ITEMS, type ItemId } from "../config";
import { LOOK, glow, mesh, roundedBox, surface } from "./materials";

/** One small mesh per item type, shared by stacks, flying items and machine trays. */

interface ItemLook {
  parts: Array<{ geometry: BufferGeometry; material: Material; y: number; scale?: [number, number, number]; rotation?: [number, number, number] }>;
}

const oreGeometry = new DodecahedronGeometry(0.13, 0);
const veinGeometry = new OctahedronGeometry(0.05, 0);
const iceGeometry = new IcosahedronGeometry(0.13, 0);
const plateGeometry = roundedBox(0.34, 0.07, 0.26, 0.02);
const canisterGeometry = new CylinderGeometry(0.1, 0.1, 0.2, 14);
const capGeometry = new CylinderGeometry(0.06, 0.07, 0.04, 10);
const bandGeometry = new CylinderGeometry(0.102, 0.102, 0.05, 14);
const coilGeometry = new TorusGeometry(0.11, 0.04, 8, 18);
const spoolGeometry = new CylinderGeometry(0.06, 0.06, 0.1, 10);
const cellGeometry = new CylinderGeometry(0.085, 0.085, 0.2, 12);
const cellBandGeometry = new CylinderGeometry(0.087, 0.087, 0.08, 12);
const engineBodyGeometry = new CylinderGeometry(0.12, 0.13, 0.16, 14);
const nozzleGeometry = new ConeGeometry(0.15, 0.14, 14, 1, true);

function oreLook(veinColor: number): ItemLook {
  return {
    parts: [
      { geometry: oreGeometry, material: surface({ color: 0x5d5560, roughness: 0.9, flat: true }), y: 0.1, scale: [1.15, 0.85, 1] },
      { geometry: veinGeometry, material: glow(veinColor, 1.4), y: 0.17, rotation: [0.4, 0.2, 0] },
    ],
  };
}

function iceLook(color: number, emissive: number): ItemLook {
  return {
    parts: [
      {
        geometry: iceGeometry,
        material: surface({ color, roughness: 0.08, metalness: 0.1, emissive, emissiveIntensity: 0.35, flat: true, reflective: true, envMapIntensity: 1.2 }),
        y: 0.1,
        scale: [1, 0.9, 1],
      },
    ],
  };
}

const LOOKS: Record<ItemId, () => ItemLook> = {
  ironOre: () => oreLook(ITEMS.ironOre.color),
  ice: () => iceLook(ITEMS.ice.color, 0x3aa8d8),
  plate: () => ({
    parts: [{ geometry: plateGeometry, material: surface({ color: 0xe3e8ef, roughness: 0.3, metalness: 0.55, reflective: true, envMapIntensity: 1.2 }), y: 0.04 }],
  }),
  water: () => ({
    parts: [
      { geometry: canisterGeometry, material: surface({ color: ITEMS.water.color, roughness: 0.3, reflective: true, envMapIntensity: 0.6 }), y: 0.1 },
      { geometry: bandGeometry, material: LOOK.white(), y: 0.1 },
      { geometry: capGeometry, material: LOOK.dark(), y: 0.22 },
    ],
  }),
  copperOre: () => oreLook(ITEMS.copperOre.color),
  dryIce: () => iceLook(ITEMS.dryIce.color, 0x8a96e8),
  wire: () => ({
    parts: [
      { geometry: coilGeometry, material: surface({ color: ITEMS.wire.color, roughness: 0.25, metalness: 0.8, reflective: true, envMapIntensity: 1 }), y: 0.05, rotation: [Math.PI / 2, 0, 0] },
      { geometry: spoolGeometry, material: LOOK.dark(), y: 0.05 },
    ],
  }),
  fuelCell: () => ({
    parts: [
      { geometry: cellGeometry, material: surface({ color: 0xdfe6ea, roughness: 0.35, reflective: true, envMapIntensity: 0.6 }), y: 0.1 },
      { geometry: cellBandGeometry, material: glow(ITEMS.fuelCell.color, 1.6), y: 0.1 },
      { geometry: capGeometry, material: LOOK.dark(), y: 0.22 },
    ],
  }),
  engine: () => ({
    parts: [
      { geometry: engineBodyGeometry, material: surface({ color: 0x8d96a6, roughness: 0.35, metalness: 0.6, reflective: true, envMapIntensity: 0.9 }), y: 0.2 },
      { geometry: nozzleGeometry, material: surface({ color: 0x3a3f4b, roughness: 0.5, metalness: 0.5, emissive: ITEMS.engine.color, emissiveIntensity: 0.6 }), y: 0.07 },
      { geometry: capGeometry, material: glow(ITEMS.engine.color, 1.4), y: 0.29 },
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
