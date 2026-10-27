import { CylinderGeometry, DodecahedronGeometry, Group, IcosahedronGeometry, Mesh, OctahedronGeometry, type BufferGeometry, type Material } from "three";
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

const LOOKS: Record<ItemId, () => ItemLook> = {
  ironOre: () => ({
    parts: [
      { geometry: oreGeometry, material: surface({ color: 0x5d5560, roughness: 0.9, flat: true }), y: 0.1, scale: [1.15, 0.85, 1] },
      { geometry: veinGeometry, material: glow(ITEMS.ironOre.color, 1.4), y: 0.17, rotation: [0.4, 0.2, 0] },
    ],
  }),
  ice: () => ({
    parts: [
      {
        geometry: iceGeometry,
        material: surface({ color: ITEMS.ice.color, roughness: 0.08, metalness: 0.1, emissive: 0x3aa8d8, emissiveIntensity: 0.35, flat: true, reflective: true, envMapIntensity: 1.2 }),
        y: 0.1,
        scale: [1, 0.9, 1],
      },
    ],
  }),
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
