import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshLambertMaterial } from 'three';
import { RESOURCES, type ResourceId } from '../config/resources';

export interface StackLayout {
  readonly capacity: number;
  readonly itemSize: number;
  /** Columns along X and Z; items fill one column bottom-up before the next. */
  readonly columnsX: number;
  readonly columnsZ: number;
  readonly gap: number;
}

/**
 * A pile of resource cubes rendered as a single instanced draw call.
 * Updates are skipped unless the item sequence actually changes.
 */
export class ItemStack {
  readonly mesh: InstancedMesh;
  private readonly layout: StackLayout;
  private readonly rowsPerColumn: number;
  private readonly matrix = new Matrix4();
  private readonly color = new Color();
  private signature = '';
  private uniformKey = '';

  constructor(layout: StackLayout) {
    this.layout = layout;
    this.rowsPerColumn = Math.ceil(layout.capacity / (layout.columnsX * layout.columnsZ));
    const geometry = new BoxGeometry(layout.itemSize, layout.itemSize * 0.8, layout.itemSize);
    const material = new MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    material.userData.unique = true;
    this.mesh = new InstancedMesh(geometry, material, layout.capacity);
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
  }

  setItems(items: readonly ResourceId[]): void {
    const visible = items.slice(0, this.layout.capacity);
    const signature = visible.join(',');
    if (signature === this.signature) return;
    this.signature = signature;

    const { itemSize, gap, columnsX, columnsZ } = this.layout;
    const pitch = itemSize + gap;
    const rowHeight = itemSize * 0.8 + gap;
    const offsetX = ((columnsX - 1) * pitch) / 2;
    const offsetZ = ((columnsZ - 1) * pitch) / 2;

    visible.forEach((id, index) => {
      const column = Math.floor(index / this.rowsPerColumn);
      const row = index % this.rowsPerColumn;
      const x = (column % columnsX) * pitch - offsetX;
      const z = Math.floor(column / columnsX) * pitch - offsetZ;
      this.matrix.makeTranslation(x, row * rowHeight + itemSize * 0.4, z);
      this.mesh.setMatrixAt(index, this.matrix);
      this.mesh.setColorAt(index, this.color.setHex(RESOURCES[id].color));
    });

    this.mesh.count = visible.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Convenience for uniform piles such as machine output. */
  setUniform(id: ResourceId, count: number): void {
    const key = `${id}x${count}`;
    if (key === this.uniformKey) return;
    this.uniformKey = key;
    this.setItems(new Array<ResourceId>(Math.max(0, count)).fill(id));
  }
}
