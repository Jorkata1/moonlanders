import { AdditiveBlending, CylinderGeometry, Group, IcosahedronGeometry, MeshBasicMaterial, PointLight, SphereGeometry, TorusGeometry } from "three";
import { bakeStatic } from "../bake";
import { box, glow, mesh, surface } from "../materials";
import { canvasTexture } from "../textures";
import { FINISH, hazardTexture, pipe, platingTexture } from "./kit";

export interface WorkbenchModel {
  readonly root: Group;
  /** The arm works and the hologram spins; both pick up pace while you stand at the bench. */
  update(time: number, dt: number, active: boolean): void;
}

const TABLE = { y: 0.86, z: -0.35 } as const;

/** Pegboard with painted tool outlines and the tools hanging on it. */
function pegboard(root: Group): void {
  const board = canvasTexture("v2-pegboard", 256, 128, (ctx) => {
    ctx.fillStyle = "#3a4256";
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    for (let x = 8; x < 256; x += 16) for (let y = 8; y < 128; y += 16) ctx.fillRect(x, y, 3, 3);
    ctx.strokeStyle = "rgba(255,200,61,0.7)";
    ctx.lineWidth = 3;
    for (const [x, y, w, h] of [[30, 20, 14, 70], [70, 24, 40, 14], [130, 18, 12, 80], [170, 30, 50, 20], [200, 70, 20, 40]] as const) ctx.strokeRect(x, y, w, h);
  });
  root.add(box(1.9, 0.95, 0.06, surface({ map: board, roughness: 0.6 }), 0, 1.55, -0.98, 0.02));
  root.add(box(1.96, 0.08, 0.1, FINISH.gunmetal(), 0, 2.06, -0.96, 0.02));
  // Hanging tools: wrench, hammer, screwdriver.
  root.add(box(0.05, 0.36, 0.03, FINISH.chrome(), -0.74, 1.6, -0.93, 0.01));
  root.add(mesh(new TorusGeometry(0.06, 0.02, 6, 12, Math.PI * 1.4), FINISH.chrome(), -0.74, 1.8, -0.93));
  root.add(box(0.2, 0.06, 0.04, FINISH.graphite(), -0.35, 1.75, -0.93, 0.01), box(0.04, 0.3, 0.03, FINISH.orange(), -0.35, 1.6, -0.93, 0.01));
  root.add(box(0.035, 0.3, 0.03, FINISH.orange(), 0.15, 1.6, -0.93, 0.01), box(0.012, 0.16, 0.012, FINISH.chrome(), 0.15, 1.38, -0.93, 0.004));
  // Shelf with parts bins.
  root.add(box(1.0, 0.04, 0.24, FINISH.gunmetal(), 0.45, 1.25, -0.86, 0.01));
  [0xff7a1f, 0x2fb7c9, 0xffc83d, 0x5df2a0].forEach((color, i) => root.add(box(0.2, 0.14, 0.2, surface({ color, roughness: 0.5 }), 0.1 + i * 0.24, 1.34, -0.86, 0.03)));
}

/** Steel bench top on legs with a vise, a half-built part and loose tools. */
function bench(root: Group): void {
  const top = surface({ map: platingTexture("bench", "#8a93a3", 4, 2), roughness: 0.35, metalness: 0.7, reflective: true, envMapIntensity: 0.6 });
  root.add(box(1.9, 0.08, 0.8, top, 0, TABLE.y, TABLE.z, 0.03));
  root.add(box(1.94, 0.04, 0.06, surface({ map: hazardTexture(), roughness: 0.5 }), 0, TABLE.y - 0.03, TABLE.z + 0.41, 0.01));
  for (const [x, z] of [[-0.88, -0.05], [0.88, -0.05], [-0.88, -0.68], [0.88, -0.68]] as const) root.add(box(0.07, TABLE.y - 0.2, 0.07, FINISH.graphite(), x, 0.2 + (TABLE.y - 0.2) / 2, z, 0.02));
  root.add(box(1.8, 0.04, 0.6, FINISH.graphite(), 0, 0.45, TABLE.z, 0.01));
  // Vice.
  root.add(box(0.22, 0.12, 0.16, FINISH.orange(), -0.6, TABLE.y + 0.1, TABLE.z + 0.18, 0.03), box(0.06, 0.06, 0.24, FINISH.chrome(), -0.6, TABLE.y + 0.1, TABLE.z + 0.36, 0.015));
  // Loose tools and a part on the bench.
  root.add(box(0.3, 0.03, 0.05, FINISH.chrome(), 0.2, TABLE.y + 0.06, TABLE.z + 0.25, 0.01).rotateY(0.6));
  root.add(mesh(new CylinderGeometry(0.11, 0.11, 0.06, 16), FINISH.gunmetal(), -0.25, TABLE.y + 0.07, TABLE.z - 0.05));
  root.add(mesh(new TorusGeometry(0.11, 0.025, 6, 16), FINISH.orange(), -0.25, TABLE.y + 0.1, TABLE.z - 0.05).rotateX(Math.PI / 2));
}

/** Tool chest with orange drawers on the left. */
function chest(root: Group): void {
  root.add(box(0.5, 0.8, 0.5, FINISH.graphite(), -1.32, 0.6, -0.55, 0.04));
  for (let i = 0; i < 4; i += 1) {
    root.add(box(0.44, 0.15, 0.02, FINISH.orange(), -1.32, 0.33 + i * 0.18, -0.29, 0.02));
    root.add(box(0.2, 0.025, 0.03, FINISH.chrome(), -1.32, 0.36 + i * 0.18, -0.27, 0.01));
  }
}

/** Three-joint robotic arm with a gripper; returns the joints that animate. */
function robotArm(): { root: Group; shoulder: Group; elbow: Group; wrist: Group } {
  const root = new Group();
  root.add(mesh(new CylinderGeometry(0.16, 0.2, 0.16, 18), FINISH.graphite(), 0, 0.08, 0));
  const shoulder = new Group();
  shoulder.position.y = 0.2;
  shoulder.add(mesh(new SphereGeometry(0.11, 14, 10), FINISH.gunmetal()));
  shoulder.add(box(0.12, 0.7, 0.12, FINISH.orange(), 0, 0.35, 0, 0.04));
  const elbow = new Group();
  elbow.position.y = 0.7;
  elbow.add(mesh(new SphereGeometry(0.09, 12, 10), FINISH.gunmetal()));
  elbow.add(box(0.1, 0.1, 0.55, FINISH.shell(), 0, 0, 0.27, 0.04));
  const wrist = new Group();
  wrist.position.z = 0.56;
  wrist.add(mesh(new SphereGeometry(0.06, 10, 8), FINISH.gunmetal()));
  wrist.add(box(0.05, 0.12, 0.03, FINISH.chrome(), -0.04, -0.08, 0, 0.01), box(0.05, 0.12, 0.03, FINISH.chrome(), 0.04, -0.08, 0, 0.01));
  wrist.add(mesh(new SphereGeometry(0.025, 8, 6), glow(0x4de3ff, 3), 0, -0.02, 0.06));
  elbow.add(wrist);
  shoulder.add(elbow);
  root.add(shoulder);
  for (const joint of [root, shoulder, elbow, wrist]) joint.userData.dynamic = true;
  return { root, shoulder, elbow, wrist };
}

/** The new workbench: a steel bench with a vice and tools, a pegboard wall, a tool chest, a lamp, a hologram projector and a jointed robot arm. */
export function workbenchModelV2(): WorkbenchModel {
  const root = new Group();
  root.add(box(3.0, 0.16, 1.9, FINISH.graphite(), 0, 0.08, -0.35, 0.06));
  root.add(box(3.06, 0.05, 1.96, glow(0xffc83d, 0.4), 0, 0.03, -0.35, 0.02));
  bench(root);
  pegboard(root);
  chest(root);
  // Lamp on a jointed stand over the bench.
  root.add(pipe([[0.95, 0.9, -0.85], [0.95, 2.25, -0.85], [0.7, 2.35, -0.45]], 0.035, FINISH.graphite()));
  root.add(mesh(new CylinderGeometry(0.06, 0.16, 0.14, 16, 1, true), FINISH.orange(), 0.68, 2.3, -0.42));
  root.add(mesh(new SphereGeometry(0.06, 10, 8), glow(0xfff1d0, 3.2), 0.68, 2.24, -0.42));
  const lamp = new PointLight(0xffe6c0, 2.5, 3.5, 2);
  lamp.position.set(0.68, 2.0, -0.4);
  root.add(lamp);
  // Hologram projector: a glowing pad with a slowly turning wireframe part above it.
  root.add(mesh(new CylinderGeometry(0.16, 0.18, 0.06, 20), FINISH.gunmetal(), 0.45, TABLE.y + 0.07, TABLE.z));
  root.add(mesh(new CylinderGeometry(0.13, 0.13, 0.02, 20), glow(0x4de3ff, 2.6), 0.45, TABLE.y + 0.11, TABLE.z));
  const beam = new MeshBasicMaterial({ color: 0x4de3ff, transparent: true, opacity: 0.18, blending: AdditiveBlending, depthWrite: false });
  root.add(mesh(new CylinderGeometry(0.2, 0.12, 0.45, 20, 1, true), beam, 0.45, TABLE.y + 0.34, TABLE.z));
  const hologram = new Group();
  hologram.userData.dynamic = true;
  hologram.position.set(0.45, TABLE.y + 0.5, TABLE.z);
  const wire = new MeshBasicMaterial({ color: 0x9ff4ff, wireframe: true, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false });
  hologram.add(mesh(new IcosahedronGeometry(0.15, 1), wire), mesh(new TorusGeometry(0.2, 0.01, 6, 28), wire).rotateX(Math.PI / 2));
  root.add(hologram);

  const arm = robotArm();
  arm.root.position.set(1.25, 0.16, -0.25);
  arm.root.name = "arm";
  root.add(arm.root);
  bakeStatic(root);

  return {
    root,
    update(time, _dt, active) {
      const pace = active ? 1.8 : 0.8;
      arm.root.rotation.y = 1.6 + Math.sin(time * pace * 0.6) * 0.7;
      arm.shoulder.rotation.x = 0.35 + Math.sin(time * pace) * 0.15;
      arm.elbow.rotation.x = 0.9 + Math.sin(time * pace + 1) * 0.25;
      arm.wrist.rotation.z = time * pace;
      hologram.rotation.y = time * (active ? 1.6 : 0.6);
      hologram.position.y = TABLE.y + 0.5 + Math.sin(time * 2) * 0.03;
      beam.opacity = active ? 0.28 : 0.16;
    },
  };
}
