import { ConeGeometry, CylinderGeometry, Group, Object3D, TorusGeometry } from "three";
import { bakeStatic } from "./bake";
import { LOOK, box, glow, mesh, surface } from "./materials";

const BOOM_REST = 1.2;
const BOOM_REACH = 3.4;
/** Fraction of the bore spent reaching out and pulling back. */
const EXTEND_SHARE = 0.08;

export interface DrillRigModel {
  readonly root: Group;
  /** The spinning bit's tip, for dust and sparks while boring. */
  readonly tip: Object3D;
  /** `boring` is 0..1 while it works, null before it is built; at 1 the boom folds back. */
  update(boring: number | null, time: number, dt: number): void;
}

/** A tracked drilling rig whose telescopic boom drives a spinning bit into the ridge. */
export function drillRigModel(): DrillRigModel {
  const root = new Group();
  const paint = surface({ color: 0xffc23d, roughness: 0.45, metalness: 0.3, reflective: true, envMapIntensity: 0.4 });
  for (const x of [-0.75, 0.75]) {
    root.add(box(0.42, 0.42, 2.2, LOOK.rubber(), x, 0.22, 0, 0.12));
    for (const z of [-0.8, 0, 0.8]) root.add(mesh(new CylinderGeometry(0.17, 0.17, 0.44, 12), LOOK.steel(), x, 0.22, z).rotateZ(Math.PI / 2));
  }
  root.add(box(1.5, 0.5, 1.8, paint, 0, 0.66, 0, 0.1));
  root.add(box(0.9, 0.7, 0.8, LOOK.panel(), -0.25, 1.25, 0.45, 0.08));
  root.add(box(0.7, 0.3, 0.04, glow(0x4de3ff, 1.4), -0.25, 1.35, 0.86, 0.02));
  root.add(box(1.54, 0.08, 1.84, glow(0xffc83d, 0.5), 0, 0.42, 0, 0.02));
  // Mast with a warning lamp.
  root.add(box(0.12, 1.4, 0.12, LOOK.steel(), 0.5, 1.6, 0.6, 0.02));
  const lamp = surface({ color: 0xff8a2a, emissive: 0xff6a1a, emissiveIntensity: 0.3, roughness: 0.3, noShadow: true }).clone();
  root.add(mesh(new CylinderGeometry(0.1, 0.1, 0.16, 12), lamp, 0.5, 2.36, 0.6));

  // Boom: a sleeve on the body and a telescopic arm sliding out of it.
  const boom = new Group();
  boom.userData.dynamic = true;
  boom.position.set(0.15, 1.05, -0.4);
  boom.add(box(0.46, 0.46, 1.2, paint, 0, 0, -0.3, 0.06));
  const arm = new Group();
  arm.add(box(0.32, 0.32, 2.4, LOOK.steel(), 0, 0, -1.2, 0.04));
  const head = new Group();
  head.position.z = -2.45;
  head.add(mesh(new CylinderGeometry(0.34, 0.34, 0.3, 16), LOOK.dark()).rotateX(Math.PI / 2));
  const bit = new Group();
  const cutter = mesh(new ConeGeometry(0.32, 0.8, 10), surface({ color: 0x9aa3b0, roughness: 0.3, metalness: 0.85, flat: true, reflective: true, envMapIntensity: 0.8 }));
  cutter.rotation.x = -Math.PI / 2;
  cutter.position.z = -0.5;
  bit.add(cutter, mesh(new TorusGeometry(0.3, 0.05, 6, 16), glow(0xff8a2a, 1.6), 0, 0, -0.18));
  head.add(bit);
  const tip = new Object3D();
  tip.position.z = -0.95;
  head.add(tip);
  arm.add(head);
  boom.add(arm);
  root.add(boom);
  bakeStatic(root);

  return {
    root,
    tip,
    update(boring, time, dt) {
      const working = boring !== null && boring < 1;
      const k = boring === null ? 0 : boring < EXTEND_SHARE ? boring / EXTEND_SHARE : boring >= 1 ? 0 : boring > 1 - EXTEND_SHARE ? (1 - boring) / EXTEND_SHARE : 1;
      const reach = BOOM_REST + (BOOM_REACH - BOOM_REST) * k;
      arm.position.z += (-(reach - BOOM_REST) - arm.position.z) * Math.min(1, dt * 4);
      bit.rotation.z += dt * (working ? 24 : 0);
      head.position.x = working ? Math.sin(time * 40) * 0.02 : 0;
      lamp.emissiveIntensity = working ? 1.2 + Math.max(0, Math.sin(time * 9)) * 3 : 0.3;
    },
  };
}
