import { BoxGeometry, CapsuleGeometry, ConeGeometry, CylinderGeometry, Group, Object3D, SphereGeometry, TorusGeometry } from "three";
import { bakeStatic } from "./bake";
import { FINISH, hazardTexture, platingTexture } from "./kit";
import { box, glow, mesh, surface } from "./materials";

const BOOM_REST = 1.2;
const BOOM_REACH = 3.4;
/** Fraction of the bore spent reaching out and pulling back. */
const EXTEND_SHARE = 0.08;
const TRACK = { length: 2.3, height: 0.5, width: 0.42, x: 0.78 } as const;
const TREAD_COUNT = 18;

export interface DrillRigModel {
  readonly root: Group;
  /** The spinning bit's tip, for dust and sparks while boring. */
  readonly tip: Object3D;
  /** `boring` is 0..1 while it works, null before it is built; at 1 the boom folds back. */
  update(boring: number | null, time: number, dt: number): void;
}

/** A crawler track: a rounded rubber loop with tread cleats, road wheels and a sprocket. */
function track(root: Group, x: number): void {
  const { length, height, width } = TRACK;
  const radius = height / 2;
  const loop = mesh(new CapsuleGeometry(radius, length - height, 6, 16).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), FINISH.rubber(), x, radius, 0);
  loop.scale.x = width / height;
  root.add(loop);
  const cleat = new BoxGeometry(width + 0.02, 0.05, 0.08);
  for (let i = 0; i < TREAD_COUNT; i += 1) {
    const z = -length / 2 + radius + ((length - height) * i) / (TREAD_COUNT - 1);
    root.add(mesh(cleat, FINISH.graphite(), x, height + 0.01, z), mesh(cleat, FINISH.graphite(), x, 0.01, z));
  }
  for (const z of [-0.7, -0.23, 0.23, 0.7]) root.add(mesh(new CylinderGeometry(0.15, 0.15, width + 0.06, 14).rotateZ(Math.PI / 2), FINISH.gunmetal(), x, radius, z));
  for (const z of [-length / 2 + radius, length / 2 - radius]) {
    root.add(mesh(new CylinderGeometry(0.2, 0.2, width + 0.08, 12).rotateZ(Math.PI / 2), FINISH.orange(), x, radius, z));
    root.add(mesh(new CylinderGeometry(0.07, 0.07, width + 0.12, 10).rotateZ(Math.PI / 2), FINISH.chrome(), x, radius, z));
  }
}

/** A spiral-fluted drill bit: a long cone wrapped by a ridge, with a glowing cutting ring. */
function bit(): Group {
  const group = new Group();
  const steel = surface({ color: 0x9aa3b0, roughness: 0.28, metalness: 0.9, flat: true, reflective: true, envMapIntensity: 0.9 });
  const cone = mesh(new ConeGeometry(0.36, 1.0, 12), steel);
  cone.rotation.x = -Math.PI / 2;
  cone.position.z = -0.55;
  group.add(cone);
  for (let i = 0; i < 5; i += 1) {
    const t = i / 5;
    const flute = mesh(new TorusGeometry(0.33 * (1 - t) + 0.04, 0.03, 6, 18, Math.PI * 1.3), FINISH.graphite(), 0, 0, -0.1 - t * 0.85);
    flute.rotation.z = i * 1.3;
    group.add(flute);
  }
  group.add(mesh(new TorusGeometry(0.34, 0.05, 6, 18), glow(0xff8a2a, 1.8), 0, 0, -0.12));
  return group;
}

/** The mining drill: a tracked rig with a glass cab, engine and exhaust, and a telescopic boom with hydraulic rams driving a fluted bit into the ridge. */
export function drillRigModel(): DrillRigModel {
  const root = new Group();
  const paint = surface({ map: platingTexture("drill-rig", "#ffc23d", 4, 2), roughness: 0.42, metalness: 0.3, reflective: true, envMapIntensity: 0.4 });
  const hazard = surface({ map: hazardTexture(), roughness: 0.5 });
  for (const x of [-TRACK.x, TRACK.x]) track(root, x);
  root.add(box(1.5, 0.3, 2.0, FINISH.graphite(), 0, 0.62, 0, 0.06));
  root.add(box(1.46, 0.42, 1.8, paint, 0, 0.94, 0.05, 0.1));
  root.add(box(1.5, 0.08, 0.06, hazard, 0, 0.78, 1.0, 0.02), box(1.5, 0.08, 0.06, hazard, 0, 0.78, -0.92, 0.02));
  // Cab with tinted glass and a roof light.
  root.add(box(0.8, 0.62, 0.72, paint, -0.3, 1.46, 0.5, 0.1));
  root.add(box(0.7, 0.36, 0.04, FINISH.glass(), -0.3, 1.52, 0.87, 0.02), box(0.04, 0.36, 0.56, FINISH.glass(), -0.71, 1.52, 0.5, 0.02));
  root.add(box(0.84, 0.06, 0.76, FINISH.graphite(), -0.3, 1.8, 0.5, 0.03));
  for (const x of [-0.55, -0.05]) root.add(mesh(new SphereGeometry(0.05, 10, 8), glow(0xfff1d0, 3), x, 1.84, 0.84));
  // Engine block with a grille and an exhaust stack.
  root.add(box(0.7, 0.46, 0.7, FINISH.gunmetal(), 0.35, 1.38, -0.45, 0.06));
  for (let i = 0; i < 4; i += 1) root.add(box(0.5, 0.03, 0.02, FINISH.graphite(), 0.35, 1.25 + i * 0.08, -0.09, 0.008));
  root.add(mesh(new CylinderGeometry(0.07, 0.08, 0.7, 12), FINISH.chrome(), 0.58, 1.9, -0.65));
  root.add(mesh(new CylinderGeometry(0.09, 0.07, 0.06, 12), FINISH.graphite(), 0.58, 2.27, -0.65));
  // Mast with a warning lamp.
  root.add(box(0.08, 1.2, 0.08, FINISH.gunmetal(), 0.62, 2.1, 0.62, 0.02));
  const lamp = surface({ color: 0xff8a2a, emissive: 0xff6a1a, emissiveIntensity: 0.3, roughness: 0.3, noShadow: true }).clone();
  root.add(mesh(new CylinderGeometry(0.1, 0.1, 0.16, 12), lamp, 0.62, 2.78, 0.62));

  // Boom: a sleeve on the body, a middle stage and an arm sliding out, pushed by two hydraulic rams.
  const boom = new Group();
  boom.userData.dynamic = true;
  boom.position.set(0.25, 1.12, -0.45);
  boom.add(box(0.5, 0.5, 1.2, paint, 0, 0, -0.3, 0.06));
  boom.add(box(0.52, 0.06, 0.06, hazard, 0, 0.27, -0.88, 0.02));
  const middle = new Group();
  middle.add(box(0.4, 0.4, 2.0, FINISH.graphite(), 0, 0, -0.7, 0.05));
  boom.add(middle);
  const arm = new Group();
  arm.add(box(0.32, 0.32, 2.4, FINISH.gunmetal(), 0, 0, -1.2, 0.04));
  const head = new Group();
  head.position.z = -2.45;
  head.add(mesh(new CylinderGeometry(0.38, 0.38, 0.3, 18).rotateX(Math.PI / 2), FINISH.graphite()));
  head.add(mesh(new TorusGeometry(0.38, 0.04, 6, 18), FINISH.orange(), 0, 0, -0.15));
  const spinner = bit();
  head.add(spinner);
  const tip = new Object3D();
  tip.position.z = -1.1;
  head.add(tip);
  arm.add(head);
  boom.add(arm);
  const rams = [-0.32, 0.32].map((x) => {
    const ram = new Group();
    ram.position.set(x, -0.1, 0.2);
    ram.add(mesh(new CylinderGeometry(0.06, 0.06, 1.0, 10).rotateX(Math.PI / 2), FINISH.orange(), 0, 0, -0.5));
    const rod = mesh(new CylinderGeometry(0.035, 0.035, 1.0, 10).rotateX(Math.PI / 2), FINISH.chrome(), 0, 0, -1.0);
    ram.add(rod);
    boom.add(ram);
    return rod;
  });
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
      middle.position.z = arm.position.z / 2;
      for (const rod of rams) rod.position.z = -1.0 + middle.position.z;
      spinner.rotation.z += dt * (working ? 24 : 0);
      head.position.x = working ? Math.sin(time * 40) * 0.02 : 0;
      lamp.emissiveIntensity = working ? 1.2 + Math.max(0, Math.sin(time * 9)) * 3 : 0.3;
    },
  };
}
