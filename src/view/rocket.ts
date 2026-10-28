import { ConeGeometry, CylinderGeometry, Group, LatheGeometry, Mesh, Quaternion, SphereGeometry, TorusGeometry, Vector2, Vector3, type Material, type MeshStandardMaterial } from "three";
import { ITEMS, type ItemId } from "../config";
import { bakeStatic } from "./bake";
import { LOOK, box, glow, mesh, surface } from "./materials";

/** How a rocket part shows up on the model as it is loaded. */
type PartVisual = "hull" | "tank" | "engines" | "wiring";

const PART_VISUALS: Partial<Record<ItemId, PartVisual>> = { plate: "hull", water: "tank", engine: "engines", wire: "wiring" };

/** Hull outline (radius, height), bottom to tip. */
const PROFILE: readonly (readonly [number, number])[] = [[0.7, 0], [0.85, 0.3], [0.9, 1.4], [0.88, 2.6], [0.78, 3.4], [0.55, 4.1], [0.25, 4.6], [0, 4.8]];
const HULL_HEIGHT = 4.8;
const HULL_BANDS = 8;
const ENGINE_SLOTS = 8;
const WIRE_STRIPS = 6;
const WIRE_SEGMENTS = 3;
const SCAFFOLD_RADIUS = 1.35;
const SCAFFOLD_SINK_SPEED = 2.2;
const POP_SECONDS = 0.35;
/** The ship sits this high on its launch platform. */
export const SHIP_REST_HEIGHT = 0.6;

export interface RocketPartProgress {
  readonly item: ItemId;
  /** 0 = nothing loaded, 1 = all of this part loaded. */
  readonly fraction: number;
}

export interface RocketModel {
  root: Group;
  ship: Group;
  flame: Mesh;
  windowMaterial: MeshStandardMaterial;
  /** Show what has been built so far; the scaffold sinks away once everything is loaded. */
  setBuild(parts: readonly RocketPartProgress[], complete: boolean, dt: number): void;
}

function radiusAt(y: number): number {
  for (let i = 1; i < PROFILE.length; i += 1) {
    const [r1, y1] = PROFILE[i] as readonly [number, number];
    const [r0, y0] = PROFILE[i - 1] as readonly [number, number];
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / Math.max(1e-6, y1 - y0);
  }
  return 0;
}

/** A thin rod from `a` to `b`. */
function rod(a: Vector3, b: Vector3, thickness: number, material: Material): Mesh {
  const length = a.distanceTo(b);
  const rodMesh = new Mesh(new CylinderGeometry(thickness, thickness, length, 6), material);
  rodMesh.position.copy(a).add(b).multiplyScalar(0.5);
  rodMesh.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  return rodMesh;
}

/** Ribs and stringers: what you see before any hull plate is fitted. */
function skeleton(): Group {
  const frame = new Group();
  const steel = LOOK.steel();
  for (let y = 0.3; y < HULL_HEIGHT - 0.4; y += HULL_HEIGHT / HULL_BANDS) {
    frame.add(mesh(new TorusGeometry(radiusAt(y) * 0.94, 0.035, 6, 28), steel, 0, y, 0).rotateX(Math.PI / 2));
  }
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const point = (y: number) => new Vector3(Math.sin(angle) * radiusAt(y) * 0.94, y, Math.cos(angle) * radiusAt(y) * 0.94);
    for (let y = 0; y < HULL_HEIGHT - 0.3; y += 0.6) frame.add(rod(point(y), point(Math.min(HULL_HEIGHT - 0.2, y + 0.6)), 0.03, steel));
  }
  return frame;
}

/** The hull in horizontal bands, fitted bottom to top as plates are loaded. */
function hullBands(windowMaterial: MeshStandardMaterial): Group[] {
  const bandHeight = HULL_HEIGHT / HULL_BANDS;
  return Array.from({ length: HULL_BANDS }, (_, index) => {
    const band = new Group();
    band.userData.dynamic = true;
    const y0 = index * bandHeight;
    const points = Array.from({ length: 5 }, (_, step) => {
      const y = y0 + (bandHeight * step) / 4;
      return new Vector2(radiusAt(y), y);
    });
    band.add(mesh(new LatheGeometry(points, 32), LOOK.white()));
    // Seam where this band meets the next, so the plating reads as separate panels.
    if (index < HULL_BANDS - 1) band.add(mesh(new TorusGeometry(radiusAt(y0 + bandHeight) + 0.005, 0.02, 4, 32), LOOK.dark(), 0, y0 + bandHeight, 0).rotateX(Math.PI / 2));
    if (y0 <= 1.2 && 1.2 < y0 + bandHeight) band.add(mesh(new CylinderGeometry(0.9, 0.9, 0.3, 32), LOOK.orange(), 0, 1.2, 0));
    if (index === HULL_BANDS - 1) band.add(mesh(new ConeGeometry(0.4, 0.55, 32), LOOK.orange(), 0, 4.55, 0));
    for (const y of [2.4, 3.1]) {
      if (y0 <= y && y < y0 + bandHeight) band.add(mesh(new SphereGeometry(0.2, 16, 10), windowMaterial, 0, y, radiusAt(y) - 0.04).rotateX(Math.PI / 2));
    }
    if (index === 0) {
      for (let i = 0; i < 4; i += 1) {
        const fin = new Group();
        fin.add(box(0.08, 1.2, 0.7, LOOK.orange(), 0, 0.6, 0, 0.03));
        const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
        fin.position.set(Math.sin(angle) * 0.9, 0, Math.cos(angle) * 0.9);
        fin.rotation.y = angle;
        band.add(fin);
      }
    }
    return band;
  });
}

/** New engine pods strapped around the lower hull on a refit, one per engine loaded. */
function engineSlots(): Group[] {
  const glowRing = glow(ITEMS.engine.color, 2.4);
  return Array.from({ length: ENGINE_SLOTS }, (_, i) => {
    const engine = new Group();
    engine.userData.dynamic = true;
    // Offset half a step so no pod sits on a fin.
    const angle = ((i + 0.5) / ENGINE_SLOTS) * Math.PI * 2;
    const reach = radiusAt(0.6) + 0.14;
    engine.position.set(Math.sin(angle) * reach, 0.15, Math.cos(angle) * reach);
    engine.add(mesh(new CylinderGeometry(0.13, 0.13, 0.7, 12), LOOK.dark(), 0, 0.45, 0), mesh(new ConeGeometry(0.13, 0.2, 12), LOOK.orange(), 0, 0.9, 0));
    engine.add(mesh(new CylinderGeometry(0.09, 0.16, 0.22, 12, 1, true), LOOK.steel(), 0, 0, 0), mesh(new TorusGeometry(0.14, 0.03, 6, 14), glowRing, 0, 0.3, 0).rotateX(Math.PI / 2));
    return engine;
  });
}

/** Copper cable runs laid up the hull on a refit, a segment at a time. */
function wireSegments(): Mesh[] {
  const copper = surface({ color: ITEMS.wire.color, emissive: ITEMS.wire.color, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.6, noShadow: true });
  const segments: Mesh[] = [];
  for (let segment = 0; segment < WIRE_SEGMENTS; segment += 1) {
    for (let strip = 0; strip < WIRE_STRIPS; strip += 1) {
      const angle = (strip / WIRE_STRIPS) * Math.PI * 2 + Math.PI / WIRE_STRIPS;
      // Above the engine pods, up to the shoulder of the nose.
      const y0 = 1.1 + segment * 0.75;
      const point = (y: number) => new Vector3(Math.sin(angle) * (radiusAt(y) + 0.05), y, Math.cos(angle) * (radiusAt(y) + 0.05));
      const piece = rod(point(y0), point(y0 + 0.7), 0.055, copper);
      piece.userData.dynamic = true;
      segments.push(piece);
    }
  }
  return segments;
}

/** A glass water tank on the gantry; its level rises with every tank loaded. */
function waterTank(): { root: Group; level: Mesh } {
  const root = new Group();
  root.userData.dynamic = true;
  root.position.set(-1.75, 0, 0.5);
  const glass = surface({ color: 0xcfefff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.25 });
  root.add(mesh(new CylinderGeometry(0.42, 0.42, 2.2, 20, 1, true), glass, 0, 1.4, 0));
  root.add(mesh(new CylinderGeometry(0.46, 0.46, 0.1, 20), LOOK.dark(), 0, 0.3, 0), mesh(new CylinderGeometry(0.46, 0.46, 0.1, 20), LOOK.dark(), 0, 2.5, 0));
  root.add(box(0.9, 0.06, 0.06, LOOK.steel(), 0.65, 2.0, -0.25, 0.01));
  const level = mesh(new CylinderGeometry(0.38, 0.38, 2.1, 20), surface({ color: ITEMS.water.color, emissive: ITEMS.water.color, emissiveIntensity: 0.5, roughness: 0.2 }));
  level.userData.dynamic = true;
  root.add(level);
  return { root, level };
}

/** Cage of poles and rings around the rocket while it is being built. */
function scaffold(): Group {
  const cage = new Group();
  cage.userData.dynamic = true;
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    cage.add(box(0.08, 5.2, 0.08, LOOK.orange(), Math.sin(angle) * SCAFFOLD_RADIUS, 2.6, Math.cos(angle) * SCAFFOLD_RADIUS, 0.02));
  }
  for (const y of [1.6, 3.2, 4.8]) cage.add(mesh(new TorusGeometry(SCAFFOLD_RADIUS, 0.04, 6, 32), LOOK.steel(), 0, y, 0).rotateX(Math.PI / 2));
  return cage;
}

export function rocketModel(): RocketModel {
  const root = new Group();
  const ship = new Group();
  const windowMaterial = surface({ color: 0x9fe8ff, emissive: 0x4de3ff, emissiveIntensity: 1.4, roughness: 0.1, noShadow: true }).clone();
  ship.add(skeleton(), mesh(new CylinderGeometry(0.45, 0.6, 0.35, 20), LOOK.dark(), 0, -0.1, 0));
  const bands = hullBands(windowMaterial);
  const engines = engineSlots();
  const wires = wireSegments();
  ship.add(...bands, ...engines, ...wires);
  const flame = mesh(new ConeGeometry(0.5, 2.2, 16, 1, true), glow(0xffa040, 4));
  flame.rotation.x = Math.PI;
  flame.position.y = -1.3;
  flame.visible = false;
  flame.userData.dynamic = true;
  ship.add(flame);
  ship.position.y = SHIP_REST_HEIGHT;
  ship.userData.dynamic = true;
  root.add(ship, mesh(new CylinderGeometry(1.6, 1.8, 0.5, 8), LOOK.dark(), 0, 0.25, 0));

  // Service tower beside the rocket.
  const tower = new Group();
  for (const y of [0.5, 1.5, 2.5, 3.5]) tower.add(box(0.7, 0.08, 0.7, LOOK.orange(), 0, y, 0, 0.02));
  for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]] as const) tower.add(box(0.07, 4, 0.07, LOOK.steel(), x, 2, z));
  tower.add(box(1.2, 0.08, 0.14, LOOK.steel(), -0.8, 3.0, 0));
  tower.position.set(2.0, 0, 0);
  const tank = waterTank();
  const cage = scaffold();
  root.add(tower, tank.root, cage);
  root.traverse((object) => {
    if (object instanceof Mesh && object !== flame) object.castShadow = true;
  });
  bakeStatic(ship);
  bakeStatic(root);

  const shown = new Map<Group | Mesh, number>();
  let firstSync = true;

  /** Show the first `count` pieces; newly shown ones pop in. */
  function reveal(pieces: readonly (Group | Mesh)[], count: number, dt: number): void {
    pieces.forEach((piece, index) => {
      const on = index < count;
      if (on && !piece.visible && !firstSync) shown.set(piece, 0);
      piece.visible = on;
      const age = shown.get(piece);
      if (age === undefined) return;
      const next = age + dt;
      const k = Math.min(1, next / POP_SECONDS);
      piece.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.12);
      if (k >= 1) shown.delete(piece);
      else shown.set(piece, next);
    });
  }

  return {
    root,
    ship,
    flame,
    windowMaterial,
    setBuild(parts, complete, dt) {
      const fractionOf = (visual: PartVisual): number | null => {
        const part = parts.find((p) => PART_VISUALS[p.item] === visual);
        return part ? part.fraction : null;
      };
      // A planet that doesn't ask for plates gets a rocket that arrived already plated.
      reveal(bands, Math.floor((fractionOf("hull") ?? 1) * HULL_BANDS + 1e-6), dt);
      reveal(engines, Math.floor((fractionOf("engines") ?? 0) * ENGINE_SLOTS + 1e-6), dt);
      reveal(wires, Math.floor((fractionOf("wiring") ?? 0) * wires.length + 1e-6), dt);
      const water = fractionOf("tank");
      tank.root.visible = water !== null;
      tank.level.visible = (water ?? 0) > 0;
      tank.level.scale.y = Math.max(0.001, water ?? 0);
      tank.level.position.y = 0.35 + (2.1 * Math.max(0.001, water ?? 0)) / 2;
      if (complete) {
        cage.position.y = firstSync ? -6 : Math.max(-6, cage.position.y - dt * SCAFFOLD_SINK_SPEED);
        cage.visible = cage.position.y > -5.9;
      } else {
        cage.position.y = 0;
        cage.visible = true;
      }
      firstSync = false;
    },
  };
}
