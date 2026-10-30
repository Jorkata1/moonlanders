import { CapsuleGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, SpotLight, TorusGeometry } from "three";
import { bakeStatic } from "./bake";
import { LOOK, box, glow, mesh, surface } from "./materials";

export interface LaserDrill {
  root: Group;
  /** Where the beam starts. */
  tip: Group;
  coils: MeshStandardMaterial;
  prongs: Group;
}

/** Hand-held laser drill: rubber grip with a trigger, white body, a glass energy chamber with glowing coils, chrome barrel and a spinning three-prong emitter. */
export function laserDrill(scale = 1): LaserDrill {
  const root = new Group();
  const coils = surface({ color: 0x4de3ff, emissive: 0x4de3ff, emissiveIntensity: 1, roughness: 0.3, noShadow: true }).clone();
  const white = surface({ color: 0xf4f6fa, roughness: 0.32, reflective: true, envMapIntensity: 0.5 });
  const chrome = surface({ color: 0xc9d1dc, roughness: 0.18, metalness: 0.95, reflective: true, envMapIntensity: 1.1 });
  const grip = box(0.07, 0.15, 0.09, surface({ color: 0x1b1e26, roughness: 0.9 }), 0, 0.02, 0.07, 0.03);
  grip.rotation.x = 0.35;
  root.add(grip, box(0.02, 0.05, 0.03, LOOK.orange(), 0, -0.04, 0.12, 0.008));
  root.add(mesh(new CapsuleGeometry(0.06, 0.18, 6, 14), white, 0, -0.12, 0));
  root.add(box(0.13, 0.05, 0.13, LOOK.orange(), 0, -0.02, 0, 0.02));
  // Energy chamber: coils glowing inside a glass sleeve.
  const glass = new MeshStandardMaterial({ color: 0xbfefff, transparent: true, opacity: 0.3, roughness: 0.05, depthWrite: false });
  root.add(mesh(new CylinderGeometry(0.058, 0.058, 0.16, 14), glass, 0, -0.3, 0));
  for (const y of [-0.25, -0.3, -0.35]) root.add(mesh(new TorusGeometry(0.04, 0.012, 6, 14), coils, 0, y, 0).rotateX(Math.PI / 2));
  root.add(mesh(new CylinderGeometry(0.02, 0.02, 0.16, 8), glow(0xbff4ff, 3), 0, -0.3, 0));
  for (const y of [-0.215, -0.385]) root.add(mesh(new CylinderGeometry(0.066, 0.066, 0.025, 14), chrome, 0, y, 0));
  root.add(mesh(new CylinderGeometry(0.034, 0.045, 0.1, 12), chrome, 0, -0.44, 0));
  const prongs = new Group();
  for (let i = 0; i < 3; i += 1) {
    const prong = box(0.016, 0.09, 0.016, chrome, Math.cos((i / 3) * Math.PI * 2) * 0.035, 0, Math.sin((i / 3) * Math.PI * 2) * 0.035, 0.005);
    prong.rotation.set(Math.sin((i / 3) * Math.PI * 2) * 0.3, 0, -Math.cos((i / 3) * Math.PI * 2) * 0.3);
    prongs.add(prong);
  }
  prongs.position.y = -0.52;
  root.add(prongs);
  root.add(mesh(new SphereGeometry(0.025, 10, 8), glow(0xffb070, 3), 0, -0.5, 0));
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
  /** Knee joints, straight in play; the intro bends them. */
  knees: [Group, Group];
  arms: [Group, Group];
  /** Elbow joints, straight in play; the intro bends them. */
  elbows: [Group, Group];
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
