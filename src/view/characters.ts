import { CapsuleGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, SpotLight, TorusGeometry, type MeshStandardMaterial } from "three";
import { bakeStatic } from "./bake";
import { LOOK, box, glow, mesh, surface } from "./materials";
import { panelTexture } from "./textures";

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

function limb(radius: number, length: number, end: MeshStandardMaterial, pad?: MeshStandardMaterial): Group {
  const pivot = new Group();
  const suit = LOOK.white();
  pivot.add(mesh(new CapsuleGeometry(radius, length, 4, 10), suit, 0, -length / 2 - radius, 0));
  if (pad) {
    const knee = mesh(new SphereGeometry(radius * 1.25, 10, 8), pad, 0, -length / 2 - radius, 0.02);
    knee.scale.set(1, 0.7, 1);
    pivot.add(knee);
  }
  pivot.add(mesh(new TorusGeometry(radius * 1.05, radius * 0.25, 6, 12), LOOK.dark(), 0, -length * 0.85 - radius, 0).rotateX(Math.PI / 2));
  return pivot;
}

export function astronautModel(): AstronautModel {
  const root = new Group();
  const body = new Group();
  root.add(body);
  const suit = surface({ map: panelTexture("suit-fabric", "#eef1f6", 3), roughness: 0.6 });
  const orange = LOOK.orange();

  const legs: [Group, Group] = [limb(0.1, 0.3, LOOK.dark(), orange), limb(0.1, 0.3, LOOK.dark(), orange)];
  for (const [i, leg] of legs.entries()) {
    leg.position.set(i === 0 ? -0.13 : 0.13, 0.6, 0);
    leg.add(box(0.17, 0.12, 0.28, LOOK.dark(), 0, -0.5, 0.04, 0.05));
    leg.add(box(0.18, 0.04, 0.3, LOOK.orange(), 0, -0.56, 0.04, 0.02));
  }

  const torso = mesh(new CapsuleGeometry(0.25, 0.3, 6, 16), suit, 0, 0.84, 0);
  torso.scale.set(1, 1, 0.82);
  const chestBox = box(0.28, 0.18, 0.08, LOOK.panel(), 0, 0.9, 0.2, 0.03);
  const buttons = [0x5df2a0, 0xffc83d, 0xff5a5a].map((color, i) => mesh(new SphereGeometry(0.018, 8, 6), glow(color, 2.5), -0.07 + i * 0.07, 0.92, 0.245));
  const patch = box(0.1, 0.06, 0.02, orange, -0.17, 0.98, 0.15, 0.01).rotateY(-0.5);
  const belt = mesh(new TorusGeometry(0.25, 0.035, 6, 20), LOOK.dark(), 0, 0.64, 0).rotateX(Math.PI / 2);
  const shoulders = [-0.27, 0.27].map((x) => {
    const pad = mesh(new SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), orange, x, 1.04, 0);
    pad.scale.set(1.1, 0.7, 1);
    return pad;
  });

  const helmet = mesh(new SphereGeometry(0.28, 28, 20), LOOK.white(), 0, 1.32, 0);
  const visor = mesh(
    new SphereGeometry(0.245, 28, 16, Math.PI * 0.08, Math.PI * 0.84, Math.PI * 0.28, Math.PI * 0.42),
    surface({ color: 0xffb648, roughness: 0.05, metalness: 0.95, emissive: 0x3a1c00, emissiveIntensity: 0.3, reflective: true, envMapIntensity: 1.8 }),
    0,
    1.32,
    0.045,
  );
  const visorRim = mesh(new TorusGeometry(0.24, 0.02, 6, 24, Math.PI * 0.9), LOOK.dark(), 0, 1.34, 0.06).rotateZ(Math.PI * 0.05);
  const lampHousing = box(0.07, 0.06, 0.09, LOOK.dark(), 0.25, 1.42, 0.08, 0.02);
  const lampLens = mesh(new SphereGeometry(0.025, 8, 6), glow(0xfff4d8, 3), 0.25, 1.42, 0.13);
  const collar = mesh(new TorusGeometry(0.2, 0.05, 8, 20), LOOK.panel(), 0, 1.08, 0).rotateX(Math.PI / 2);
  const antenna = mesh(new CylinderGeometry(0.008, 0.008, 0.22, 6), LOOK.dark(), -0.17, 1.58, -0.08);
  const antennaTip = mesh(new SphereGeometry(0.025, 8, 6), glow(0xff5a5a, 3), -0.17, 1.7, -0.08);

  const pack = box(0.48, 0.52, 0.22, LOOK.panel(), 0, 0.93, -0.28, 0.06);
  const tanks = [-0.12, 0.12].map((x) => mesh(new CylinderGeometry(0.075, 0.075, 0.48, 14), LOOK.steel(), x, 0.93, -0.41));
  const tankCaps = [-0.12, 0.12].map((x) => mesh(new SphereGeometry(0.075, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), orange, x, 1.17, -0.41));
  const nozzles = [-0.12, 0.12].map((x) => mesh(new ConeGeometry(0.06, 0.1, 10, 1, true), LOOK.dark(), x, 0.64, -0.4));
  const oxygenLight = box(0.32, 0.04, 0.02, glow(0x4de3ff, 2.4), 0, 1.13, -0.395, 0.01);

  const arms: [Group, Group] = [limb(0.075, 0.26, orange), limb(0.075, 0.26, orange)];
  arms[0].position.set(-0.34, 1.02, 0);
  arms[1].position.set(0.34, 1.02, 0);
  for (const arm of arms) arm.add(mesh(new SphereGeometry(0.085, 10, 8), orange, 0, -0.47, 0));
  const drill = laserDrill(1.1);
  drill.root.position.set(0, -0.5, 0.04);
  arms[1].add(drill.root);

  const headlamp = new SpotLight(0xfff1d8, 6, 9, 0.5, 0.6, 1.6);
  headlamp.position.set(0.25, 1.42, 0.14);
  headlamp.target.position.set(0.25, 0, 3.5);
  headlamp.castShadow = false;

  const stackAnchor = new Group();
  stackAnchor.position.set(0, 1.2, -0.38);

  body.add(torso, chestBox, ...buttons, patch, belt, ...shoulders, helmet, visor, visorRim, lampHousing, lampLens, collar, antenna, antennaTip);
  body.add(pack, ...tanks, ...tankCaps, ...nozzles, oxygenLight, ...arms, stackAnchor, headlamp, headlamp.target);
  root.add(...legs);
  // Merge the rigid parts so the astronaut costs a handful of draw calls instead of dozens.
  for (const moving of [...arms, stackAnchor]) moving.userData.dynamic = true;
  bakeStatic(body);
  for (const leg of legs) bakeStatic(leg);
  return { root, body, legs, arms, stackAnchor, drill, oxygenLight, headlamp };
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

/** Six-wheeled mining rover with a camera head, a drill arm in front and a cargo bin behind. */
export function robotModel(accent: number): RobotModel {
  const root = new Group();
  const chassis = new Group();
  root.add(chassis);
  const paint = surface({ color: accent, roughness: 0.4, reflective: true, envMapIntensity: 0.4 });
  chassis.add(box(0.8, 0.22, 1.05, LOOK.white(), 0, 0.42, 0, 0.08));
  chassis.add(box(0.84, 0.08, 1.09, paint, 0, 0.33, 0, 0.03));
  chassis.add(box(0.5, 0.06, 0.04, glow(0x4de3ff, 2), 0, 0.42, 0.53, 0.01));

  const wheels: Mesh[] = [];
  const tire = new CylinderGeometry(0.15, 0.15, 0.12, 14);
  for (const z of [-0.38, 0, 0.38]) {
    for (const x of [-0.46, 0.46]) {
      const wheel = mesh(tire, LOOK.rubber(), x, 0.15, z);
      wheel.rotation.z = Math.PI / 2;
      wheel.add(mesh(new CylinderGeometry(0.08, 0.08, 0.13, 10), LOOK.steel()));
      wheels.push(wheel);
      root.add(wheel);
      root.add(box(0.06, 0.2, 0.06, LOOK.dark(), x * 0.82, 0.26, z, 0.01));
    }
  }

  const head = new Group();
  head.position.set(0, 0.62, 0.32);
  head.add(mesh(new CylinderGeometry(0.03, 0.04, 0.18, 8), LOOK.dark(), 0, 0.09, 0));
  head.add(box(0.32, 0.18, 0.2, LOOK.white(), 0, 0.24, 0, 0.06));
  head.add(box(0.26, 0.12, 0.03, LOOK.dark(), 0, 0.24, 0.1, 0.03));
  const eye = mesh(new SphereGeometry(0.045, 12, 10), glow(0x4de3ff, 3.2), 0.0, 0.24, 0.12);
  head.add(eye, mesh(new SphereGeometry(0.03, 8, 6), glow(accent, 3), 0.1, 0.36, -0.05));
  chassis.add(head);

  const arm = new Group();
  arm.position.set(0.24, 0.55, 0.45);
  arm.add(mesh(new SphereGeometry(0.07, 10, 8), LOOK.dark()));
  arm.add(box(0.07, 0.07, 0.4, paint, 0, 0, 0.2, 0.02));
  const drill = laserDrill(0.9);
  drill.root.position.set(0, 0, 0.42);
  drill.root.rotation.x = Math.PI / 2;
  arm.add(drill.root);
  chassis.add(arm);

  const bin = new Group();
  bin.position.set(0, 0.55, -0.22);
  bin.add(box(0.62, 0.05, 0.52, LOOK.dark(), 0, 0, 0, 0.02));
  for (const [x, z, w, d] of [[0, -0.25, 0.62, 0.04], [0, 0.25, 0.62, 0.04], [-0.3, 0, 0.04, 0.52], [0.3, 0, 0.04, 0.52]] as const) {
    bin.add(box(w, 0.22, d, paint, x, 0.1, z, 0.015));
  }
  chassis.add(bin);
  const stackAnchor = new Group();
  stackAnchor.position.set(0, 0.6, -0.22);
  chassis.add(stackAnchor);

  const thrusters = surface({ color: 0x4de3ff, emissive: 0x4de3ff, emissiveIntensity: 0.4, roughness: 0.3, noShadow: true }).clone();
  for (const x of [-0.22, 0.22]) chassis.add(mesh(new CylinderGeometry(0.06, 0.08, 0.1, 10), thrusters, x, 0.42, -0.55).rotateX(Math.PI / 2));
  for (const moving of [head, arm, bin, stackAnchor]) moving.userData.dynamic = true;
  bakeStatic(chassis);
  return { root, chassis, wheels, eye, head, arm, drill, bin, stackAnchor, thrusters };
}
