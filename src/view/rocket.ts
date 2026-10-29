import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, TorusGeometry, type MeshStandardMaterial } from "three";
import { bakeStatic } from "./bake";
import { emitter } from "./machineParts";
import { LOOK, box, glow, mesh, surface } from "./materials";
import { FINISH, lathe, pipe, platingTexture } from "./kit";

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
  const plating = surface({ map: platingTexture("rocket", "#f2f4f8", 8, 6), roughness: 0.38, reflective: true, envMapIntensity: 0.5 });
  plating.map?.repeat.set(2, 2);
  body.add(lathe([[0.5, -0.05], [0.78, 0.05], [0.88, 0.35], [0.92, 1.4], [0.9, 2.6], [0.8, 3.35], [0.58, 4.05], [0.3, 4.55], [0.12, 4.78], [0, 4.82]], plating, 40));
  // Orange bands, a black heat-shield skirt and a chrome nose tip.
  for (const [y, h] of [[1.15, 0.26], [3.05, 0.12]] as const) body.add(mesh(new CylinderGeometry(0.925 - (y > 3 ? 0.07 : 0), 0.925, h, 40), FINISH.orange(), 0, y, 0));
  body.add(mesh(new CylinderGeometry(0.9, 0.9, 0.3, 40), FINISH.graphite(), 0, 0.2, 0));
  body.add(lathe([[0.12, 4.74], [0.06, 4.9], [0, 4.98]], FINISH.chrome(), 20));
  // Porthole with a thick frame, and a row of small cabin lights.
  body.add(mesh(new SphereGeometry(0.24, 20, 14), windowMaterial, 0, 2.55, 0.8).rotateX(Math.PI / 2));
  body.add(mesh(new TorusGeometry(0.26, 0.05, 10, 28), FINISH.gunmetal(), 0, 2.55, 0.86));
  for (const a of [-0.5, -0.25, 0.25, 0.5]) body.add(mesh(new SphereGeometry(0.035, 8, 6), glow(0x9fe8ff, 2), Math.sin(a) * 0.9, 1.9, Math.cos(a) * 0.9));
  // Swept fins with orange tips and landing legs with footpads.
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const fin = new Group();
    const blade = box(0.07, 1.25, 0.62, plating, 0, 0.75, 0.3, 0.03);
    blade.rotation.x = -0.25;
    fin.add(blade, box(0.08, 0.3, 0.3, FINISH.orange(), 0, 0.2, 0.52, 0.03));
    fin.position.set(Math.sin(angle) * 0.82, 0, Math.cos(angle) * 0.82);
    fin.rotation.y = angle;
    body.add(fin);
    const legAngle = angle + Math.PI / 4;
    const lx = Math.sin(legAngle);
    const lz = Math.cos(legAngle);
    body.add(pipe([[lx * 0.8, 0.9, lz * 0.8], [lx * 1.15, 0.2, lz * 1.15], [lx * 1.25, -0.5, lz * 1.25]], 0.05, FINISH.gunmetal()));
    body.add(mesh(new CylinderGeometry(0.16, 0.2, 0.06, 16), FINISH.graphite(), lx * 1.25, -0.52, lz * 1.25));
  }
  // Scorch marks from the hard landing.
  const scorch = surface({ color: 0x2a2624, roughness: 0.95, transparent: true, opacity: 0.75 });
  for (const [angle, y, w, h] of [[0.6, 1.9, 0.5, 0.7], [2.4, 2.8, 0.4, 0.5], [4.1, 1.5, 0.6, 0.4]] as const) {
    const mark = box(w, h, 0.02, scorch, Math.sin(angle) * 0.92, y, Math.cos(angle) * 0.92, 0.01);
    mark.rotation.y = angle;
    body.add(mark);
  }
  // Engine bell.
  body.add(lathe([[0.62, -0.62], [0.5, -0.4], [0.32, -0.12], [0.36, 0]], FINISH.gunmetal(), 28));
  body.add(lathe([[0.55, -0.6], [0.3, -0.12]], glow(0xff8a3a, 0.6), 28));
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
  // A tall column the player can see from the base, until the jump drive is fixed.
  const smoke = emitter(root, 0.2, 1.6, 0.4, 0xb4b0bf, 24, 12, 3.2, 0.8);
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
