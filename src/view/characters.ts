import { CylinderGeometry, Group, Mesh, SphereGeometry, SpotLight, TorusGeometry, type MeshStandardMaterial } from "three";
import { bakeStatic } from "./bake";
import { LOOK, box, glow, mesh, surface } from "./materials";

export interface LaserDrill {
  root: Group;
  /** Where the beam starts. */
  tip: Group;
  coils: MeshStandardMaterial;
  prongs: Group;
}

/** Hand-held laser drill: grip, body, glowing coil rings and a spinning three-prong emitter. */
export function laserDrill(scale = 1): LaserDrill {
  const root = new Group();
  const coils = surface({ color: 0x4de3ff, emissive: 0x4de3ff, emissiveIntensity: 1, roughness: 0.3, noShadow: true }).clone();
  root.add(mesh(new CylinderGeometry(0.035, 0.04, 0.14, 10), LOOK.dark(), 0, -0.02, 0.06));
  root.add(box(0.11, 0.3, 0.13, LOOK.white(), 0, -0.14, 0, 0.03));
  root.add(box(0.12, 0.08, 0.14, LOOK.orange(), 0, -0.06, 0, 0.02));
  root.add(mesh(new CylinderGeometry(0.045, 0.055, 0.22, 12), LOOK.steel(), 0, -0.38, 0));
  for (const y of [-0.31, -0.37, -0.43]) root.add(mesh(new TorusGeometry(0.055, 0.014, 6, 14), coils, 0, y, 0).rotateX(Math.PI / 2));
  const prongs = new Group();
  for (let i = 0; i < 3; i += 1) {
    const prong = box(0.018, 0.09, 0.018, LOOK.steel(), Math.cos((i / 3) * Math.PI * 2) * 0.035, 0, Math.sin((i / 3) * Math.PI * 2) * 0.035, 0.005);
    prong.rotation.set(Math.sin((i / 3) * Math.PI * 2) * 0.3, 0, -Math.cos((i / 3) * Math.PI * 2) * 0.3);
    prongs.add(prong);
  }
  prongs.position.y = -0.52;
  root.add(prongs);
  const lens = mesh(new SphereGeometry(0.025, 10, 8), glow(0xffb070, 3), 0, -0.5, 0);
  root.add(lens);
  const tip = new Group();
  tip.position.y = -0.56;
  root.add(tip);
  root.scale.setScalar(scale);
  prongs.userData.dynamic = true;
  tip.userData.dynamic = true;
  bakeStatic(root);
  return { root, tip, coils, prongs };
}

export interface AstronautModel {
  root: Group;
  body: Group;
  legs: [Group, Group];
  arms: [Group, Group];
  stackAnchor: Group;
  drill: LaserDrill;
  oxygenLight: Mesh;
  headlamp: SpotLight;
}

export interface RobotModel {
  root: Group;
  chassis: Group;
  wheels: Mesh[];
  eye: Mesh;
  head: Group;
  arm: Group;
  drill: LaserDrill;
  bin: Group;
  stackAnchor: Group;
  thrusters: MeshStandardMaterial;
}
