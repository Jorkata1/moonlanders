import { BoxGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, type MeshStandardMaterial } from "three";
import { bakeStatic } from "../bake";
import { laserDrill, type RobotModel } from "../characters";
import { box, glow, mesh, surface } from "../materials";
import { FINISH, hazardTexture, platingTexture } from "./kit";

const WHEEL_RADIUS = 0.15;
const TREAD_BLOCKS = 10;

/** A treaded tyre that spins about X; hub and tread blocks ride along as children. */
function wheel(x: number, z: number): Mesh {
  const tyreGeometry = new CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.13, 18).rotateZ(Math.PI / 2);
  const tyre = new Mesh(tyreGeometry, FINISH.rubber());
  tyre.position.set(x, WHEEL_RADIUS, z);
  const side = Math.sign(x);
  tyre.add(mesh(new CylinderGeometry(0.085, 0.085, 0.02, 14).rotateZ(Math.PI / 2), FINISH.chrome(), side * 0.066, 0, 0));
  tyre.add(mesh(new CylinderGeometry(0.03, 0.03, 0.03, 8).rotateZ(Math.PI / 2), FINISH.orange(), side * 0.078, 0, 0));
  const block = new BoxGeometry(0.135, 0.03, 0.05);
  for (let i = 0; i < TREAD_BLOCKS; i += 1) {
    const angle = (i / TREAD_BLOCKS) * Math.PI * 2;
    const tread = mesh(block, FINISH.rubber(), 0, Math.cos(angle) * WHEEL_RADIUS, Math.sin(angle) * WHEEL_RADIUS);
    tread.rotation.x = -angle;
    tyre.add(tread);
  }
  return tyre;
}

/** The new rover: rounded hull on rocker-bogie wheels, a friendly two-eyed head, jointed drill arm and ribbed cargo bin. */
export function robotModelV2(accent: number): RobotModel {
  const root = new Group();
  const chassis = new Group();
  root.add(chassis);
  const paint = surface({ color: accent, roughness: 0.35, reflective: true, envMapIntensity: 0.5 });
  const hull = surface({ map: platingTexture("rover", "#eef1f6", 3, 2), roughness: 0.4, reflective: true, envMapIntensity: 0.45 });
  const hazard = surface({ map: hazardTexture(), roughness: 0.5 });

  chassis.add(box(0.84, 0.16, 1.1, FINISH.graphite(), 0, 0.34, 0, 0.06));
  chassis.add(box(0.76, 0.24, 0.92, hull, 0, 0.52, -0.02, 0.12));
  for (const x of [-0.385, 0.385]) chassis.add(box(0.02, 0.07, 0.8, paint, x, 0.5, -0.02, 0.01));
  // Racing stripe over the top so each robot reads by colour from above.
  for (const x of [-0.13, 0.13]) chassis.add(box(0.08, 0.02, 0.5, paint, x, 0.645, 0.2, 0.01));
  chassis.add(box(0.7, 0.07, 0.06, hazard, 0, 0.32, 0.56, 0.02));
  for (const x of [-0.25, 0.25]) {
    chassis.add(mesh(new CylinderGeometry(0.045, 0.05, 0.04, 12).rotateX(Math.PI / 2), FINISH.graphite(), x, 0.44, 0.56));
    chassis.add(mesh(new SphereGeometry(0.035, 10, 8), glow(0xfff1d0, 3), x, 0.44, 0.58));
  }
  // Rocker-bogie side frames holding the wheels.
  for (const x of [-0.47, 0.47]) {
    chassis.add(box(0.05, 0.05, 0.86, FINISH.gunmetal(), x, 0.3, 0, 0.015));
    for (const z of [-0.38, 0, 0.38]) chassis.add(box(0.04, 0.16, 0.04, FINISH.gunmetal(), x, 0.22, z, 0.01));
  }
  const wheels: Mesh[] = [];
  for (const z of [-0.38, 0, 0.38]) for (const x of [-0.5, 0.5]) wheels.push(wheel(x, z));
  root.add(...wheels);

  const head = new Group();
  head.position.set(0, 0.64, 0.3);
  head.add(mesh(new CylinderGeometry(0.035, 0.05, 0.16, 10), FINISH.gunmetal(), 0, 0.08, 0));
  head.add(box(0.36, 0.2, 0.22, FINISH.shell(), 0, 0.25, 0, 0.08));
  head.add(box(0.3, 0.13, 0.03, FINISH.glass(), 0, 0.25, 0.11, 0.04));
  const eye = mesh(new SphereGeometry(0.036, 14, 10), glow(0x4de3ff, 3.4), -0.065, 0.255, 0.125);
  eye.add(mesh(new SphereGeometry(0.036, 14, 10), glow(0x4de3ff, 3.4), 0.13, 0, 0));
  head.add(eye);
  head.add(mesh(new CylinderGeometry(0.006, 0.006, 0.16, 6), FINISH.graphite(), 0.13, 0.42, -0.06));
  head.add(mesh(new SphereGeometry(0.022, 8, 6), glow(accent, 3), 0.13, 0.5, -0.06));
  for (const x of [-0.19, 0.19]) head.add(mesh(new CylinderGeometry(0.05, 0.05, 0.04, 14).rotateZ(Math.PI / 2), paint, x, 0.25, 0));
  chassis.add(head);

  const arm = new Group();
  arm.position.set(0.26, 0.56, 0.42);
  arm.add(mesh(new SphereGeometry(0.07, 12, 10), FINISH.gunmetal()));
  arm.add(box(0.08, 0.08, 0.22, paint, 0, 0, 0.11, 0.03));
  arm.add(mesh(new SphereGeometry(0.055, 10, 8), FINISH.gunmetal(), 0, 0, 0.23));
  arm.add(box(0.065, 0.065, 0.18, FINISH.shell(), 0, 0, 0.33, 0.025));
  const drill = laserDrill(0.9);
  drill.root.position.set(0, 0, 0.44);
  drill.root.rotation.x = Math.PI / 2;
  arm.add(drill.root);
  chassis.add(arm);

  const bin = new Group();
  bin.position.set(0, 0.66, -0.24);
  bin.add(box(0.62, 0.05, 0.5, FINISH.graphite(), 0, 0, 0, 0.02));
  for (const [x, z, w, d] of [[0, -0.24, 0.62, 0.04], [0, 0.24, 0.62, 0.04], [-0.3, 0, 0.04, 0.5], [0.3, 0, 0.04, 0.5]] as const) {
    bin.add(box(w, 0.2, d, paint, x, 0.1, z, 0.015));
  }
  for (const x of [-0.2, 0, 0.2]) bin.add(box(0.03, 0.2, 0.02, FINISH.graphite(), x, 0.1, -0.265, 0.008));
  bin.add(box(0.64, 0.025, 0.04, hazard, 0, 0.21, 0.25, 0.008));
  chassis.add(bin);
  const stackAnchor = new Group();
  stackAnchor.position.set(0, 0.7, -0.24);
  chassis.add(stackAnchor);

  const thrusters: MeshStandardMaterial = surface({ color: 0x4de3ff, emissive: 0x4de3ff, emissiveIntensity: 0.4, roughness: 0.3, noShadow: true }).clone();
  for (const x of [-0.22, 0.22]) {
    chassis.add(mesh(new CylinderGeometry(0.06, 0.085, 0.12, 14).rotateX(Math.PI / 2), FINISH.gunmetal(), x, 0.46, -0.56));
    chassis.add(mesh(new CylinderGeometry(0.05, 0.05, 0.02, 14).rotateX(Math.PI / 2), thrusters, x, 0.46, -0.62));
  }
  for (const moving of [head, arm, bin, stackAnchor]) moving.userData.dynamic = true;
  bakeStatic(chassis);
  return { root, chassis, wheels, eye, head, arm, drill, bin, stackAnchor, thrusters };
}
