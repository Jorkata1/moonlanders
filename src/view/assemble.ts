import { Box3, Vector3, type Object3D } from "three";

const PIECE_SECONDS = 0.4;
/** The whole build takes about this long, its lowest parts first. */
const SPREAD_SECONDS = 0.9;
const DROP = 0.6;

interface Piece {
  readonly object: Object3D;
  readonly scale: Vector3;
  readonly y: number;
  readonly delay: number;
}

interface Assembly {
  readonly root: Object3D;
  readonly pieces: Piece[];
  t: number;
}

export interface Assembler {
  /** Assemble `root` from the ground up: each part drops in and settles, bottom parts first. */
  start(root: Object3D): void;
  update(dt: number): void;
}

function ease(t: number): number {
  const s = 1.7;
  const k = t - 1;
  return 1 + (s + 1) * k * k * k + s * k * k;
}

function settle(piece: Piece): void {
  piece.object.scale.copy(piece.scale);
  piece.object.position.y = piece.y;
}

export function createAssembler(): Assembler {
  const running: Assembly[] = [];
  const box = new Box3();
  const scratch = new Vector3();

  /** World height of a part's lowest point; an empty part (no meshes yet) counts from where it sits. */
  function lowestPoint(part: Object3D): number {
    box.setFromObject(part);
    if (!box.isEmpty() && Number.isFinite(box.min.y)) return box.min.y;
    return part.getWorldPosition(scratch).y;
  }

  return {
    start(root) {
      // Assembling the same model again (a machine upgrade) first settles any run still going on it.
      for (let i = running.length - 1; i >= 0; i -= 1) {
        const assembly = running[i] as Assembly;
        if (assembly.root !== root) continue;
        for (const piece of assembly.pieces) settle(piece);
        running.splice(i, 1);
      }
      const parts = root.children.filter((child) => child.type !== "Sprite" && child.type !== "PointLight");
      if (parts.length === 0) return;
      root.updateMatrixWorld(true);
      const heights = parts.map((part) => lowestPoint(part));
      const low = Math.min(...heights);
      const high = Math.max(...heights, low + 1e-3);
      const pieces = parts.map((object, i) => ({
        object,
        scale: object.scale.clone(),
        y: object.position.y,
        delay: (((heights[i] as number) - low) / (high - low)) * SPREAD_SECONDS,
      }));
      for (const piece of pieces) piece.object.scale.setScalar(0.0001);
      running.push({ root, pieces, t: 0 });
    },
    update(dt) {
      for (let i = running.length - 1; i >= 0; i -= 1) {
        const assembly = running[i] as Assembly;
        assembly.t += dt;
        let done = true;
        for (const piece of assembly.pieces) {
          const k = Math.min(1, Math.max(0, (assembly.t - piece.delay) / PIECE_SECONDS));
          if (k < 1) done = false;
          const grow = k <= 0 ? 0.0001 : Math.max(0.0001, ease(k));
          piece.object.scale.copy(piece.scale).multiplyScalar(grow);
          piece.object.position.y = piece.y + (1 - Math.min(1, k)) * DROP;
        }
        if (!done) continue;
        for (const piece of assembly.pieces) settle(piece);
        running.splice(i, 1);
      }
    },
  };
}
