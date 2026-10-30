import { CapsuleGeometry, CylinderGeometry, Group, SphereGeometry, SpotLight, TorusGeometry } from "three";
import { bakeStatic } from "./bake";
import { laserDrill, type AstronautModel } from "./characters";
import { box, glow, mesh, surface } from "./materials";
import { FINISH, lathe, ring } from "./kit";

/** Shoulder and elbow sit this far down the arm, and the knee this far down the leg, from their pivots. */
const ELBOW_DROP = 0.27;
const KNEE_DROP = 0.27;

/** Upper arm, then forearm and glove on an elbow joint; pivots at the shoulder. */
function arm(): { root: Group; elbow: Group } {
  const pivot = new Group();
  const suit = FINISH.suit();
  pivot.add(mesh(new SphereGeometry(0.1, 14, 10), suit, 0, -0.02, 0));
  pivot.add(mesh(new CapsuleGeometry(0.075, 0.14, 6, 12), suit, 0, -0.15, 0));
  pivot.add(ring(0.082, 0.022, FINISH.graphite(), 18).translateZ(0.25));
  // Straight in play; the intro bends it.
  const elbow = new Group();
  elbow.position.y = -ELBOW_DROP;
  elbow.userData.dynamic = true;
  const forearm = lathe([[0.07, 0], [0.085, 0.06], [0.09, 0.16], [0.08, 0.2]], suit, 16);
  forearm.position.y = -0.46 + ELBOW_DROP;
  elbow.add(forearm);
  elbow.add(mesh(new CylinderGeometry(0.095, 0.095, 0.05, 16), FINISH.orange(), 0, -0.44 + ELBOW_DROP, 0));
  // Chunky glove with a thumb.
  elbow.add(box(0.13, 0.12, 0.11, FINISH.orange(), 0, -0.5 + ELBOW_DROP, 0.01, 0.05));
  elbow.add(mesh(new CapsuleGeometry(0.025, 0.04, 4, 8), FINISH.orange(), 0.07, -0.48 + ELBOW_DROP, 0.04).rotateZ(0.5));
  pivot.add(elbow);
  return { root: pivot, elbow };
}

/** Thigh, then knee pad, shin and boot on a knee joint; pivots at the hip. */
function leg(): { root: Group; knee: Group } {
  const pivot = new Group();
  const suit = FINISH.suit();
  pivot.add(mesh(new CapsuleGeometry(0.1, 0.12, 6, 12), suit, 0, -0.13, 0));
  // Straight in play; the intro bends it.
  const knee = new Group();
  knee.position.y = -KNEE_DROP;
  knee.userData.dynamic = true;
  const pad = mesh(new SphereGeometry(0.085, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), FINISH.orange(), 0, -0.27 + KNEE_DROP, 0.07);
  pad.rotation.x = Math.PI / 2;
  knee.add(pad);
  const shin = lathe([[0.1, 0], [0.11, 0.08], [0.095, 0.2]], suit, 16);
  shin.position.y = -0.48 + KNEE_DROP;
  knee.add(shin);
  // Moon boot: a padded upper on a thick tread.
  knee.add(box(0.19, 0.13, 0.3, FINISH.shell(), 0, -0.5 + KNEE_DROP, 0.04, 0.06));
  knee.add(box(0.2, 0.05, 0.32, FINISH.rubber(), 0, -0.575 + KNEE_DROP, 0.04, 0.02));
  knee.add(box(0.2, 0.03, 0.12, FINISH.orange(), 0, -0.46 + KNEE_DROP, 0.14, 0.015));
  pivot.add(knee);
  bakeStatic(knee);
  return { root: pivot, knee };
}

/** Life-support pack: shell, twin tanks, vents and the oxygen gauge strip. */
function backpack(group: Group): ReturnType<typeof box> {
  group.add(box(0.48, 0.56, 0.24, FINISH.shell(), 0, 0.93, -0.29, 0.1));
  group.add(box(0.5, 0.08, 0.26, FINISH.orange(), 0, 1.16, -0.29, 0.03));
  for (const x of [-0.13, 0.13]) {
    group.add(mesh(new CapsuleGeometry(0.075, 0.34, 6, 14), FINISH.chrome(), x, 0.9, -0.43));
    group.add(mesh(new CylinderGeometry(0.08, 0.08, 0.03, 14), FINISH.graphite(), x, 0.78, -0.43));
  }
  for (let i = 0; i < 4; i += 1) group.add(box(0.2, 0.02, 0.02, FINISH.graphite(), 0, 0.7 + i * 0.04, -0.41, 0.005));
  const gauge = box(0.3, 0.035, 0.02, glow(0x4de3ff, 2.4), 0, 1.06, -0.415, 0.01);
  group.add(gauge);
  return gauge;
}

/** The new astronaut: rounded quilted suit, big gold visor, twin helmet lamps and a detailed pack. */
export function astronautModel(): AstronautModel {
  const root = new Group();
  const body = new Group();
  root.add(body);
  const suit = FINISH.suit();

  const legParts = [leg(), leg()] as const;
  const legs: [Group, Group] = [legParts[0].root, legParts[1].root];
  const knees: [Group, Group] = [legParts[0].knee, legParts[1].knee];
  legs.forEach((l, i) => l.position.set(i === 0 ? -0.12 : 0.12, 0.6, 0));

  const torso = lathe([[0.0, 0.58], [0.2, 0.6], [0.25, 0.68], [0.28, 0.82], [0.29, 0.96], [0.25, 1.06], [0.16, 1.11], [0, 1.12]], suit, 28);
  torso.scale.set(1, 1, 0.84);
  body.add(torso);
  body.add(ring(0.235, 0.035, FINISH.graphite(), 28).translateZ(-0.66));
  body.add(box(0.1, 0.07, 0.04, FINISH.chrome(), 0, 0.66, 0.21, 0.015));
  // Chest control unit with a little screen, dials and status lights.
  body.add(box(0.3, 0.19, 0.09, FINISH.graphite(), 0, 0.9, 0.2, 0.04));
  body.add(box(0.15, 0.08, 0.02, surface({ color: 0x0a1a1a, emissive: 0x4de3ff, emissiveIntensity: 1.6, roughness: 0.2, noShadow: true }), -0.05, 0.92, 0.25, 0.01));
  body.add(mesh(new CylinderGeometry(0.025, 0.025, 0.03, 12), FINISH.orange(), 0.09, 0.93, 0.25).rotateX(Math.PI / 2));
  [0x5df2a0, 0xffc83d, 0xff5a5a].forEach((color, i) => body.add(mesh(new SphereGeometry(0.014, 8, 6), glow(color, 2.6), -0.08 + i * 0.05, 0.86, 0.25)));
  body.add(box(0.12, 0.05, 0.015, FINISH.orange(), -0.19, 1.0, 0.17, 0.01).rotateY(-0.55));
  body.add(ring(0.2, 0.05, FINISH.gunmetal(), 28).translateZ(-1.1));
  for (const x of [-0.3, 0.3]) body.add(mesh(new TorusGeometry(0.1, 0.03, 8, 18), FINISH.orange(), x, 1.02, 0).rotateZ(Math.PI / 2));

  // Helmet: glossy shell, wide gold visor in a thick frame, twin lamp pods and an antenna.
  body.add(mesh(new SphereGeometry(0.31, 32, 24), FINISH.shell(), 0, 1.36, 0));
  body.add(mesh(new SphereGeometry(0.29, 32, 20, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.26, Math.PI * 0.44), FINISH.visor(), 0, 1.36, 0.04));
  const frame = mesh(new TorusGeometry(0.255, 0.03, 8, 28, Math.PI * 1.02), FINISH.graphite(), 0, 1.37, 0.07);
  frame.rotation.z = -Math.PI * 0.01;
  body.add(frame);
  for (const x of [-0.29, 0.29]) {
    body.add(mesh(new CapsuleGeometry(0.045, 0.08, 4, 10), FINISH.graphite(), x, 1.42, 0.05).rotateX(Math.PI / 2));
    body.add(mesh(new SphereGeometry(0.03, 10, 8), glow(0xfff4d8, 3.2), x, 1.42, 0.12));
  }
  body.add(mesh(new CylinderGeometry(0.008, 0.008, 0.2, 6), FINISH.graphite(), -0.16, 1.66, -0.1));
  body.add(mesh(new SphereGeometry(0.024, 8, 6), glow(0xff5a5a, 3), -0.16, 1.77, -0.1));

  const oxygenLight = backpack(body);

  const armParts = [arm(), arm()] as const;
  const arms: [Group, Group] = [armParts[0].root, armParts[1].root];
  const elbows: [Group, Group] = [armParts[0].elbow, armParts[1].elbow];
  arms[0].position.set(-0.34, 1.02, 0);
  arms[1].position.set(0.34, 1.02, 0);
  const drill = laserDrill(1.1);
  drill.root.position.set(0, -0.52 + ELBOW_DROP, 0.04);
  elbows[1].add(drill.root);
  body.add(...arms);

  const headlamp = new SpotLight(0xfff1d8, 6, 9, 0.5, 0.6, 1.6);
  headlamp.position.set(0.29, 1.42, 0.14);
  headlamp.target.position.set(0.29, 0, 3.5);
  headlamp.castShadow = false;
  const stackAnchor = new Group();
  stackAnchor.position.set(0, 1.24, -0.4);
  body.add(stackAnchor, headlamp, headlamp.target);
  root.add(...legs);

  for (const moving of [...arms, stackAnchor]) moving.userData.dynamic = true;
  bakeStatic(body);
  for (const l of legs) bakeStatic(l);
  return { root, body, legs, knees, arms, elbows, stackAnchor, drill, oxygenLight, headlamp };
}
