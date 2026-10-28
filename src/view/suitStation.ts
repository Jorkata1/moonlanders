import { CapsuleGeometry, CylinderGeometry, DoubleSide, Group, SphereGeometry, TorusGeometry, type MeshStandardMaterial } from "three";
import { bakeStatic } from "./bake";
import { box, glow, mesh, surface } from "./materials";
import { canvasTexture } from "./textures";
import { astronautModel } from "./astronaut";
import { FINISH, lathe, platingTexture } from "./kit";

export interface SuitStationModel {
  readonly root: Group;
  /** Arms work over the spare suit and the scanner sweeps while you stand at the station. */
  update(time: number, dt: number, active: boolean): void;
}

const CENTER_Z = -0.3;
const SUIT_FEET = 0.32;
const SCAN = { low: 0.5, high: 2.05 } as const;

/** Jointed servo arm with a glowing tool head; `side` mirrors it. */
function servoArm(side: 1 | -1, tool: number): { root: Group; elbow: Group } {
  const root = new Group();
  root.add(mesh(new CylinderGeometry(0.1, 0.13, 0.22, 14), FINISH.graphite(), 0, 0.11, 0));
  root.add(box(0.1, 0.8, 0.1, FINISH.orange(), 0, 0.6, 0, 0.04));
  const elbow = new Group();
  elbow.position.y = 1.0;
  elbow.add(mesh(new SphereGeometry(0.08, 12, 10), FINISH.gunmetal()));
  const fore = box(0.08, 0.08, 0.5, FINISH.shell(), 0, 0, 0.25, 0.03);
  elbow.add(fore);
  elbow.add(mesh(new CylinderGeometry(0.04, 0.06, 0.12, 10).rotateX(Math.PI / 2), FINISH.chrome(), 0, 0, 0.55));
  elbow.add(mesh(new SphereGeometry(0.035, 10, 8), glow(tool, 3.2), 0, 0, 0.62));
  elbow.rotation.y = side * -0.9;
  root.add(elbow);
  root.userData.dynamic = true;
  return { root, elbow };
}

/** The new suit station: a round bay with a curved back shell and light strips, the spare suit on a spine, a scanner ring, servo arms, oxygen bottles and a terminal. */
export function suitStationModel(): SuitStationModel {
  const root = new Group();
  root.add(lathe([[0, 0], [1.25, 0], [1.3, 0.08], [1.22, 0.2], [0, 0.22]], FINISH.graphite(), 40).translateZ(CENTER_Z));
  const rim = glow(0x4de3ff, 1.2).clone();
  root.add(mesh(new TorusGeometry(1.24, 0.03, 6, 48), rim, 0, 0.21, CENTER_Z).rotateX(Math.PI / 2));

  // Curved back shell with an orange band and vertical light strips.
  const shellMaterial = surface({ map: platingTexture("suit-bay", "#eef1f6", 6, 3), roughness: 0.38, reflective: true, envMapIntensity: 0.45 }).clone();
  shellMaterial.side = DoubleSide;
  root.add(mesh(new CylinderGeometry(1.1, 1.1, 2.3, 40, 1, true, Math.PI * 0.55, Math.PI * 0.9), shellMaterial, 0, 1.35, CENTER_Z));
  root.add(mesh(new CylinderGeometry(1.12, 1.12, 0.14, 40, 1, true, Math.PI * 0.55, Math.PI * 0.9), FINISH.orange(), 0, 2.2, CENTER_Z));
  for (const angle of [Math.PI * 0.75, Math.PI, Math.PI * 1.25]) {
    root.add(box(0.05, 1.5, 0.03, glow(0x9ff4ff, 1.8), Math.sin(angle) * 1.07, 1.3, CENTER_Z + Math.cos(angle) * 1.07, 0.01).rotateY(angle));
  }
  root.add(lathe([[1.15, 2.5], [1.0, 2.62], [0.5, 2.7], [0, 2.72]], FINISH.graphite(), 40).translateZ(CENTER_Z));
  root.add(mesh(new TorusGeometry(1.14, 0.04, 6, 48), FINISH.orange(), 0, 2.5, CENTER_Z).rotateX(Math.PI / 2));
  const halo: MeshStandardMaterial = surface({ color: 0x9ff0ff, emissive: 0x4de3ff, emissiveIntensity: 0.6, roughness: 0.3, noShadow: true }).clone();
  root.add(mesh(new TorusGeometry(0.5, 0.035, 8, 36), halo, 0, 2.5, CENTER_Z).rotateX(Math.PI / 2));

  // The spare suit on its spine (the same model the player wears, without the drill).
  root.add(box(0.1, 1.9, 0.1, FINISH.gunmetal(), 0, 1.25, CENTER_Z - 0.55, 0.03));
  root.add(mesh(new CylinderGeometry(0.3, 0.34, 0.1, 24), FINISH.chrome(), 0, 0.27, CENTER_Z));
  const spare = astronautModel();
  spare.drill.root.visible = false;
  spare.headlamp.target.removeFromParent();
  spare.headlamp.removeFromParent();
  spare.root.position.set(0, SUIT_FEET, CENTER_Z);
  spare.arms[0].rotation.z = -0.25;
  spare.arms[1].rotation.z = 0.25;
  root.add(spare.root);

  // Scanner ring that sweeps the suit.
  const scanner = new Group();
  scanner.userData.dynamic = true;
  const beam = glow(0x4de3ff, 2.6).clone();
  scanner.add(mesh(new TorusGeometry(0.5, 0.025, 6, 40), beam).rotateX(Math.PI / 2));
  scanner.position.set(0, SCAN.low, CENTER_Z);
  root.add(scanner);

  // Oxygen bottles on the left, terminal on the right.
  for (const [x, z] of [[-1.35, -0.75], [-1.45, -0.35], [-1.35, 0.05]] as const) {
    root.add(mesh(new CapsuleGeometry(0.13, 0.75, 6, 14), FINISH.shell(), x, 0.68, z));
    root.add(mesh(new TorusGeometry(0.135, 0.025, 6, 16), glow(0x4de3ff, 1.8), x, 0.9, z).rotateX(Math.PI / 2));
    root.add(mesh(new CylinderGeometry(0.05, 0.07, 0.1, 10), FINISH.graphite(), x, 1.18, z));
  }
  const screenTexture = canvasTexture("v2-suit-screen", 128, 96, (ctx) => {
    ctx.fillStyle = "#06141a";
    ctx.fillRect(0, 0, 128, 96);
    ctx.strokeStyle = "#4de3ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(64, 26, 12, 0, Math.PI * 2);
    ctx.moveTo(48, 44);
    ctx.lineTo(80, 44);
    ctx.lineTo(76, 74);
    ctx.lineTo(52, 74);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = "#5df2a0";
    ctx.fillRect(96, 20, 18, 56);
  });
  const screen = surface({ color: 0xffffff, emissive: 0xffffff, emissiveMap: screenTexture, map: screenTexture, emissiveIntensity: 1.2, roughness: 0.2, noShadow: true }).clone();
  root.add(box(0.12, 0.9, 0.12, FINISH.gunmetal(), 1.4, 0.65, -0.1, 0.03));
  root.add(box(0.55, 0.42, 0.08, FINISH.graphite(), 1.4, 1.2, -0.1, 0.04).rotateX(-0.3));
  root.add(box(0.46, 0.33, 0.02, screen, 1.4, 1.22, -0.05, 0.01).rotateX(-0.3));

  const left = servoArm(1, 0x4de3ff);
  left.root.position.set(-0.85, 0.2, CENTER_Z + 0.55);
  const right = servoArm(-1, 0xff9a3a);
  right.root.position.set(0.85, 0.2, CENTER_Z + 0.55);
  root.add(left.root, right.root);
  bakeStatic(root);

  return {
    root,
    update(time, dt, active) {
      const speed = active ? 3.2 : 0.7;
      left.root.rotation.y = Math.sin(time * speed) * (active ? 0.5 : 0.15) - 0.3;
      right.root.rotation.y = -Math.sin(time * speed + 1) * (active ? 0.5 : 0.15) + 0.3;
      left.elbow.rotation.x = Math.sin(time * speed * 1.3) * 0.25;
      right.elbow.rotation.x = Math.sin(time * speed * 1.3 + 2) * 0.25;
      const sweep = (Math.sin(time * (active ? 2.2 : 0.8)) + 1) / 2;
      scanner.position.y = SCAN.low + (SCAN.high - SCAN.low) * sweep;
      beam.emissiveIntensity = active ? 3.2 : 1.2;
      halo.emissiveIntensity += ((active ? 2.6 : 0.6) - halo.emissiveIntensity) * Math.min(1, dt * 5);
      rim.emissiveIntensity = active ? 2.2 : 1.2;
      screen.emissiveIntensity = 1.1 + Math.sin(time * 3) * 0.2;
    },
  };
}
