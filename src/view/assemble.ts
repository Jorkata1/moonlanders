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

export function createAssembler(): Assembler {
  const running: Assembly[] = [];
  const box = new Box3();

  return {
    start(root) {
      const parts = root.children.filter((child) => child.type !== "Sprite" && child.type !== "PointLight");
      if (parts.length === 0) return;
      root.updateMatrixWorld(true);
      const heights = parts.map((part) => box.setFromObject(part).min.y);
      const low = Math.min(...heights);
      const high = Math.max(...heights, low + 1e-3);
      const pieces = parts.map((object, i) => ({
        object,
        scale: object.scale.clone(),
        y: object.position.y,
        delay: (((heights[i] as number) - low) / (high - low)) * SPREAD_SECONDS,
      }));
      for (const piece of pieces) piece.object.scale.setScalar(0.0001);
      running.push({ pieces, t: 0 });
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
        if (done) running.splice(i, 1);
      }
    },
  };
}
