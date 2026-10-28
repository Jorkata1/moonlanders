import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, LatheGeometry, Mesh, SphereGeometry, TorusGeometry, Vector2, type MeshStandardMaterial } from "three";
import { bakeStatic } from "./bake";
import { emitter } from "./machineParts";
import { LOOK, box, glow, mesh, surface } from "./materials";

/** Hull outline (radius, height), bottom to tip. */
const PROFILE: readonly (readonly [number, number])[] = [[0, 0], [0.7, 0], [0.85, 0.3], [0.9, 1.4], [0.88, 2.6], [0.78, 3.4], [0.55, 4.1], [0.25, 4.6], [0, 4.8]];
const DRIVE_SEGMENTS = 12;
const DRIVE_HEIGHT = 0.75;
const DRIVE_RADIUS = 1.12;
const SCAFFOLD_RADIUS = 1.35;
const SCAFFOLD_SINK_SPEED = 2.2;
/** The ship sits this high on its launch platform. */
export const SHIP_REST_HEIGHT = 0.6;

export interface RocketModel {
  root: Group;
  ship: Group;
  flame: Mesh;
  windowMaterial: MeshStandardMaterial;
  /**
   * `drive` 0..1 is how much of the jump drive has been delivered; once `ready`, the drive
   * glows, the scaffold sinks away and the crash smoke stops.
   */
  setBuild(drive: number, ready: boolean, time: number, dt: number): void;
}

function hull(windowMaterial: MeshStandardMaterial): Group {
  const body = new Group();
  body.add(mesh(new LatheGeometry(PROFILE.map(([r, y]) => new Vector2(r, y)), 32), LOOK.white()));
  body.add(mesh(new CylinderGeometry(0.9, 0.9, 0.3, 32), LOOK.orange(), 0, 1.2, 0));
  body.add(mesh(new ConeGeometry(0.4, 0.55, 32), LOOK.orange(), 0, 4.55, 0));
  for (const y of [2.4, 3.1]) body.add(mesh(new SphereGeometry(0.2, 16, 10), windowMaterial, 0, y, 0.82).rotateX(Math.PI / 2));
  for (let i = 0; i < 4; i += 1) {
    const fin = new Group();
    fin.add(box(0.08, 1.2, 0.7, LOOK.orange(), 0, 0.6, 0, 0.03));
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    fin.position.set(Math.sin(angle) * 0.9, 0, Math.cos(angle) * 0.9);
    fin.rotation.y = angle;
    body.add(fin);
  }
  // Scorch marks from the hard landing.
  const scorch = surface({ color: 0x2a2624, roughness: 0.95 });
  for (const [angle, y, w, h] of [[0.6, 1.9, 0.5, 0.7], [2.4, 2.8, 0.4, 0.5], [4.1, 1.5, 0.6, 0.4]] as const) {
    const mark = box(w, h, 0.02, scorch, Math.sin(angle) * 0.9, y, Math.cos(angle) * 0.9, 0.01);
    mark.rotation.y = angle;
    body.add(mark);
  }
  body.add(mesh(new CylinderGeometry(0.45, 0.6, 0.35, 20), LOOK.dark(), 0, -0.1, 0));
  return body;
}

/** The jump drive: a ring of segments around the lower hull that light up as materials arrive. */
function jumpDrive(): { root: Group; segments: Mesh[]; lit: MeshStandardMaterial; core: MeshStandardMaterial } {
  const root = new Group();
  root.position.y = DRIVE_HEIGHT;
  root.userData.dynamic = true;
  const lit = surface({ color: 0x6dffd2, emissive: 0x6dffd2, emissiveIntensity: 2.2, roughness: 0.3, noShadow: true }).clone();
  const off = surface({ color: 0x2a3140, roughness: 0.5, metalness: 0.4 });
  const segmentGeometry = new BoxGeometry(0.42, 0.34, 0.16);
  const segments = Array.from({ length: DRIVE_SEGMENTS }, (_, i) => {
    const angle = (i / DRIVE_SEGMENTS) * Math.PI * 2;
    const segment = new Mesh(segmentGeometry, off);
    segment.position.set(Math.sin(angle) * DRIVE_RADIUS, 0, Math.cos(angle) * DRIVE_RADIUS);
    segment.rotation.y = angle;
    segment.userData.off = off;
    root.add(segment);
    return segment;
  });
  root.add(mesh(new TorusGeometry(DRIVE_RADIUS, 0.05, 8, 40), LOOK.steel(), 0, 0.2, 0).rotateX(Math.PI / 2));
  root.add(mesh(new TorusGeometry(DRIVE_RADIUS, 0.05, 8, 40), LOOK.steel(), 0, -0.2, 0).rotateX(Math.PI / 2));
  const core = surface({ color: 0xbffff0, emissive: 0x6dffd2, emissiveIntensity: 0, roughness: 0.2, noShadow: true }).clone();
  root.add(mesh(new TorusGeometry(DRIVE_RADIUS + 0.12, 0.04, 8, 48), core).rotateX(Math.PI / 2));
  return { root, segments, lit, core };
}

/** Cage of poles and rings around the rocket while it is being repaired. */
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
  ship.add(hull(windowMaterial));
  const drive = jumpDrive();
  ship.add(drive.root);
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
  const cage = scaffold();
  root.add(tower, cage);
  // Smoke still curls from the engine bay after the crash.
  const smoke = emitter(root, 0.2, 1.4, 0.4, 0x6f6a72, 7, 2.6);
  root.traverse((object) => {
    if (object instanceof Mesh && object !== flame) object.castShadow = true;
  });
  bakeStatic(ship);
  bakeStatic(root);

  let firstSync = true;
  let lastLit = -1;

  return {
    root,
    ship,
    flame,
    windowMaterial,
    setBuild(progress, ready, time, dt) {
      const lit = ready ? DRIVE_SEGMENTS : Math.floor(Math.min(1, Math.max(0, progress)) * DRIVE_SEGMENTS + 1e-6);
      if (lit !== lastLit) {
        lastLit = lit;
        drive.segments.forEach((segment, i) => (segment.material = i < lit ? drive.lit : (segment.userData.off as MeshStandardMaterial)));
      }
      drive.lit.emissiveIntensity = ready ? 2.6 + Math.sin(time * 5) * 0.6 : 1.8;
      drive.core.emissiveIntensity = ready ? 2 + Math.sin(time * 3) * 0.8 : 0;
      drive.root.rotation.y = ready ? time * 0.6 : 0;
      smoke(time, dt, !ready);
      if (ready) {
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
