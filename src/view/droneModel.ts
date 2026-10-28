import { CylinderGeometry, Group, SphereGeometry, TorusGeometry, type MeshStandardMaterial } from "three";
import { bakeStatic } from "./bake";
import { box, glow, mesh, surface } from "./materials";
import { FINISH, lathe } from "./kit";

export interface DroneModel {
  root: Group;
  body: Group;
  rotors: Group[];
  lights: MeshStandardMaterial;
  stackAnchor: Group;
}

const DUCT_RADIUS = 0.22;
const ARM_REACH = 0.6;

/** A ducted fan: a chrome-lipped shroud with a three-blade rotor inside. */
function duct(body: Group, x: number, z: number, shell: MeshStandardMaterial): Group {
  body.add(mesh(new TorusGeometry(DUCT_RADIUS, 0.045, 10, 28), shell, x, 0.12, z).rotateX(Math.PI / 2));
  body.add(mesh(new CylinderGeometry(DUCT_RADIUS + 0.03, DUCT_RADIUS + 0.03, 0.09, 28, 1, true), FINISH.graphite(), x, 0.1, z));
  body.add(mesh(new CylinderGeometry(0.04, 0.05, 0.08, 10), FINISH.gunmetal(), x, 0.1, z));
  const rotor = new Group();
  rotor.userData.dynamic = true;
  rotor.position.set(x, 0.14, z);
  for (let i = 0; i < 3; i += 1) {
    const blade = box(0.19, 0.012, 0.05, FINISH.chrome(), 0.1, 0, 0, 0.005);
    const holder = new Group();
    holder.rotation.y = (i / 3) * Math.PI * 2;
    blade.rotation.x = 0.35;
    holder.add(blade);
    rotor.add(holder);
  }
  body.add(rotor);
  return rotor;
}

/** The new cargo drone: a gold teardrop body, four ducted fans, an underglow ring and a claw cradle. */
export function droneModel(): DroneModel {
  const root = new Group();
  const body = new Group();
  root.add(body);
  const shell = surface({ color: 0xffc23d, roughness: 0.28, metalness: 0.5, reflective: true, envMapIntensity: 0.8 });
  body.add(lathe([[0, -0.08], [0.24, -0.06], [0.34, 0.04], [0.33, 0.14], [0.24, 0.26], [0.1, 0.32], [0, 0.33]], shell, 32));
  body.add(mesh(new CylinderGeometry(0.35, 0.35, 0.05, 32), FINISH.shell(), 0, 0.06, 0));
  // Camera eye and a glowing visor strip on the nose.
  body.add(mesh(new SphereGeometry(0.07, 14, 10), FINISH.glass(), 0, 0.12, 0.31));
  body.add(mesh(new SphereGeometry(0.03, 10, 8), glow(0x4de3ff, 3), 0, 0.12, 0.37));
  body.add(box(0.26, 0.035, 0.03, glow(0x4de3ff, 2.4), 0, 0.22, 0.27, 0.012).rotateX(-0.5));
  const rotors: Group[] = [];
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.sin(angle) * ARM_REACH;
    const z = Math.cos(angle) * ARM_REACH;
    const arm = box(ARM_REACH - 0.1, 0.05, 0.08, FINISH.graphite(), x / 2, 0.08, z / 2, 0.025);
    arm.rotation.y = angle + Math.PI / 2;
    body.add(arm);
    rotors.push(duct(body, x, z, shell));
  }
  // Underglow ring that shows the drone's state.
  const lights = surface({ color: 0x5df2a0, emissive: 0x5df2a0, emissiveIntensity: 1.6, roughness: 0.3, noShadow: true }).clone();
  body.add(mesh(new TorusGeometry(0.22, 0.018, 6, 28), lights, 0, -0.07, 0).rotateX(Math.PI / 2));
  // Claw cradle that holds the cargo stack.
  const cradle = new Group();
  cradle.position.y = -0.14;
  cradle.add(box(0.46, 0.035, 0.46, FINISH.graphite(), 0, -0.1, 0, 0.015));
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2;
    const claw = box(0.05, 0.2, 0.04, FINISH.gunmetal(), Math.sin(angle) * 0.24, -0.04, Math.cos(angle) * 0.24, 0.015);
    claw.rotation.y = angle;
    cradle.add(claw);
  }
  body.add(cradle);
  const stackAnchor = new Group();
  stackAnchor.userData.dynamic = true;
  stackAnchor.position.set(0, -0.24, 0);
  body.add(stackAnchor);
  bakeStatic(body);
  return { root, body, rotors, lights, stackAnchor };
}
