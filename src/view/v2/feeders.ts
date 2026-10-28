import { CylinderGeometry, DoubleSide, Group, SphereGeometry, Vector3, type MeshStandardMaterial } from "three";
import { box, glow, mesh, surface } from "../materials";
import { FINISH, hazardTexture, pipe } from "./kit";

/** How raw ore gets into the smelter: the funnel it had, or one of three redesigns. */
export type FeederKind = "funnel" | "hatch" | "hoist" | "crusher";

export interface Feeder {
  tray: Group;
  /** Route an item rides from the input belt's foot into the machine, in the model's local space. */
  path: Vector3[];
  update(time: number, dt: number, working: boolean): void;
}

const BELT_WIDTH = 0.5;
const PAD_FOOT = new Vector3(-1.35, 0.42, 1.35);

/** A conveyor running straight from `from` to `to`, with side rails, end rollers and legs. */
function conveyor(root: Group, belt: MeshStandardMaterial, from: Vector3, to: Vector3): void {
  const length = from.distanceTo(to);
  const holder = new Group();
  holder.position.copy(from).lerp(to, 0.5);
  holder.lookAt(to);
  holder.add(box(BELT_WIDTH, 0.06, length, belt, 0, 0, 0, 0.01));
  for (const x of [-0.28, 0.28]) holder.add(box(0.06, 0.14, length, FINISH.gunmetal(), x, 0.03, 0, 0.02));
  for (const z of [-length / 2, length / 2]) holder.add(mesh(new CylinderGeometry(0.06, 0.06, 0.54, 10), FINISH.chrome(), 0, -0.02, z).rotateZ(Math.PI / 2));
  root.add(holder);
  for (const t of [0.3, 0.75]) {
    const at = from.clone().lerp(to, t);
    root.add(box(0.07, at.y - 0.24, 0.07, FINISH.gunmetal(), at.x, 0.24 + (at.y - 0.24) / 2, at.z, 0.02));
  }
}

function trayAt(root: Group, at: Vector3): Group {
  const tray = new Group();
  tray.position.copy(at);
  tray.userData.dynamic = true;
  root.add(tray);
  return tray;
}

/** Enclosed feeder: the belt climbs into a steel housing behind a rubber strip curtain, ducted into the drum. */
function hatchFeeder(root: Group, belt: MeshStandardMaterial): Feeder {
  const mouth = new Vector3(-1.32, 1.28, 0.32);
  conveyor(root, belt, PAD_FOOT, mouth);
  root.add(box(0.72, 0.7, 0.66, FINISH.shell(), -1.32, 1.38, -0.02, 0.08));
  root.add(box(0.76, 0.1, 0.7, FINISH.orange(), -1.32, 1.76, -0.02, 0.03));
  root.add(box(0.74, 0.08, 0.04, surface({ map: hazardTexture(), roughness: 0.5 }), -1.32, 1.68, 0.32, 0.01));
  // Rubber strip curtain over the opening; the strips sway while ore pushes through.
  const curtain = new Group();
  curtain.userData.dynamic = true;
  curtain.position.set(-1.32, 1.6, 0.33);
  const strips = Array.from({ length: 6 }, (_, i) => {
    const strip = box(0.075, 0.42, 0.015, FINISH.rubber(), -0.2 + i * 0.08, -0.21, 0, 0.004);
    const hinge = new Group();
    hinge.position.x = strip.position.x;
    strip.position.x = 0;
    hinge.add(strip);
    curtain.add(hinge);
    return hinge;
  });
  root.add(curtain);
  root.add(box(0.36, 0.36, 0.5, FINISH.gunmetal(), -1.0, 1.42, -0.32, 0.04));
  const light = glow(0x5df2a0, 0.4).clone();
  root.add(mesh(new SphereGeometry(0.045, 10, 8), light, -1.05, 1.86, 0.18));
  const tray = trayAt(root, new Vector3(-1.32, 1.12, -0.05));
  const path = [PAD_FOOT.clone().add(new Vector3(0, 0.1, 0)), mouth.clone().add(new Vector3(0, 0.1, 0)), new Vector3(-1.32, 1.3, -0.05), new Vector3(-1.32, 1.15, -0.05)];
  return {
    tray,
    path,
    update(time, _dt, working) {
      strips.forEach((hinge, i) => (hinge.rotation.x = working ? -Math.max(0, Math.sin(time * 6 + i * 0.7)) * 0.5 : 0));
      light.emissiveIntensity = working ? 2.4 : 0.4;
    },
  };
}

/** Skip hoist: the belt tips ore into a bucket that rides up twin rails and empties into the furnace roof. */
function hoistFeeder(root: Group, belt: MeshStandardMaterial): Feeder {
  const rail = { x: -1.3, z: -0.35, bottom: 0.7, top: 2.35 };
  const loadAt = new Vector3(rail.x, rail.bottom + 0.35, rail.z + 0.42);
  conveyor(root, belt, PAD_FOOT, loadAt);
  for (const dz of [-0.24, 0.24]) root.add(box(0.07, rail.top - 0.1, 0.07, FINISH.gunmetal(), rail.x - 0.18, 0.24 + (rail.top - 0.1) / 2, rail.z + dz, 0.02));
  root.add(box(0.12, 0.1, 0.62, FINISH.orange(), rail.x - 0.18, rail.top + 0.2, rail.z, 0.03));
  root.add(mesh(new CylinderGeometry(0.1, 0.1, 0.5, 14).rotateX(Math.PI / 2), FINISH.chrome(), rail.x - 0.18, rail.top + 0.32, rail.z));
  // Chute from the top of the hoist into the dome.
  const chute = box(0.4, 0.06, 0.7, FINISH.gunmetal(), -0.9, rail.top - 0.15, rail.z, 0.02);
  chute.rotation.z = -0.55;
  chute.rotation.y = Math.PI / 2;
  root.add(chute);
  const bucket = new Group();
  bucket.userData.dynamic = true;
  const walls = FINISH.orange();
  bucket.add(box(0.42, 0.05, 0.4, FINISH.graphite(), 0, -0.14, 0, 0.015));
  for (const [x, z, w, d] of [[0, -0.2, 0.42, 0.04], [0, 0.2, 0.42, 0.04], [-0.2, 0, 0.04, 0.4], [0.2, 0, 0.04, 0.4]] as const) bucket.add(box(w, 0.28, d, walls, x, 0, z, 0.012));
  bucket.add(box(0.44, 0.05, 0.42, surface({ map: hazardTexture(), roughness: 0.5 }), 0, 0.15, 0, 0.01));
  bucket.position.set(rail.x, rail.bottom, rail.z);
  root.add(bucket);
  const tray = trayAt(root, new Vector3(rail.x, rail.bottom - 0.05, rail.z));
  const path = [PAD_FOOT.clone().add(new Vector3(0, 0.1, 0)), loadAt.clone().add(new Vector3(0, 0.1, 0)), new Vector3(rail.x, rail.bottom + 0.1, rail.z), new Vector3(rail.x, rail.top, rail.z), new Vector3(-0.75, 1.95, rail.z)];
  return {
    tray,
    path,
    update(time, _dt, working) {
      // Up, tip, down, wait: a 3 s cycle while the furnace has work.
      const phase = working ? (time / 3) % 1 : 0;
      const lift = phase < 0.4 ? phase / 0.4 : phase < 0.55 ? 1 : phase < 0.85 ? 1 - (phase - 0.55) / 0.3 : 0;
      const eased = lift * lift * (3 - 2 * lift);
      bucket.position.y = rail.bottom + (rail.top - rail.bottom - 0.15) * eased;
      bucket.rotation.z = phase >= 0.4 && phase < 0.55 ? -Math.sin(((phase - 0.4) / 0.15) * Math.PI) * 0.9 : 0;
    },
  };
}

/** Crusher: a square hopper with grizzly bars on top and two toothed rollers that grind ore before it is piped in. */
function crusherFeeder(root: Group, belt: MeshStandardMaterial): Feeder {
  const top = new Vector3(-1.3, 1.7, 0.05);
  conveyor(root, belt, PAD_FOOT, new Vector3(-1.3, 1.6, 0.55));
  const walls = FINISH.gunmetal().clone();
  walls.side = DoubleSide;
  for (const [x, z, w, d] of [[0, -0.33, 0.7, 0.05], [0, 0.33, 0.7, 0.05], [-0.33, 0, 0.05, 0.7], [0.33, 0, 0.05, 0.7]] as const) root.add(box(w, 0.5, d, walls, top.x + x, top.y - 0.25, top.z + z, 0.015));
  root.add(box(0.76, 0.06, 0.76, FINISH.orange(), top.x, top.y + 0.02, top.z, 0.02));
  for (let i = 0; i < 4; i += 1) root.add(box(0.035, 0.035, 0.66, FINISH.chrome(), top.x - 0.27 + i * 0.18, top.y + 0.06, top.z, 0.01));
  root.add(box(0.8, 0.42, 0.8, FINISH.graphite(), top.x, 0.95, top.z, 0.06));
  for (const [x, z] of [[-0.32, -0.32], [0.32, -0.32], [-0.32, 0.32], [0.32, 0.32]] as const) root.add(box(0.08, 0.7, 0.08, FINISH.gunmetal(), top.x + x, 0.59, top.z + z, 0.02));
  const rollers = [-0.14, 0.14].map((dx) => {
    const roller = new Group();
    roller.userData.dynamic = true;
    roller.position.set(top.x + dx, top.y - 0.16, top.z);
    roller.add(mesh(new CylinderGeometry(0.11, 0.11, 0.6, 12).rotateX(Math.PI / 2), FINISH.orange()));
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      roller.add(box(0.05, 0.05, 0.58, FINISH.graphite(), Math.cos(angle) * 0.12, Math.sin(angle) * 0.12, 0, 0.01));
    }
    root.add(roller);
    return roller;
  });
  root.add(pipe([[top.x + 0.3, 0.95, top.z - 0.2], [-1.0, 1.2, -0.3], [-0.9, 1.4, -0.35]], 0.1, FINISH.gunmetal()));
  const tray = trayAt(root, new Vector3(top.x, top.y - 0.2, top.z));
  const path = [PAD_FOOT.clone().add(new Vector3(0, 0.1, 0)), new Vector3(-1.3, 1.7, 0.55), new Vector3(top.x, top.y + 0.15, top.z), new Vector3(top.x, top.y - 0.25, top.z)];
  return {
    tray,
    path,
    update(_time, dt, working) {
      const spin = dt * (working ? 7 : 0.4);
      rollers[0]!.rotation.z += spin;
      rollers[1]!.rotation.z -= spin;
    },
  };
}

/** The original funnel, kept for comparison. */
function funnelFeeder(root: Group, belt: MeshStandardMaterial): Feeder {
  const hopper = new Vector3(-1.3, 1.4, 0.05);
  conveyor(root, belt, PAD_FOOT, new Vector3(-1.35, 1.1, 0.4));
  const funnel = FINISH.chrome().clone();
  funnel.side = DoubleSide;
  root.add(mesh(new CylinderGeometry(0.55, 0.25, 0.55, 16, 1, true), funnel, hopper.x, hopper.y, hopper.z));
  root.add(pipe([[-1.3, 1.15, 0.05], [-1.1, 1.25, -0.05], [-0.9, 1.4, -0.25]], 0.09, FINISH.gunmetal()));
  const tray = trayAt(root, new Vector3(-1.3, 1.2, 0.05));
  return { tray, path: [PAD_FOOT.clone(), new Vector3(-1.35, 1.2, 0.4), new Vector3(-1.3, 1.95, 0.05), new Vector3(-1.3, 1.25, 0.05)], update: () => undefined };
}

export function buildFeeder(kind: FeederKind, root: Group, belt: MeshStandardMaterial): Feeder {
  if (kind === "hatch") return hatchFeeder(root, belt);
  if (kind === "hoist") return hoistFeeder(root, belt);
  if (kind === "crusher") return crusherFeeder(root, belt);
  return funnelFeeder(root, belt);
}
