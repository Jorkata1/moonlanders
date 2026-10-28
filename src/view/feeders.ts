import { CylinderGeometry, DoubleSide, Group, Vector3, type MeshStandardMaterial } from "three";
import { box, mesh, surface } from "./materials";
import { FINISH, hazardTexture, pipe } from "./kit";

/** How raw material gets into a machine: a skip hoist (smelter) or a crusher (refinery). */
export type FeederKind = "hoist" | "crusher";

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

export function buildFeeder(kind: FeederKind, root: Group, belt: MeshStandardMaterial): Feeder {
  return kind === "hoist" ? hoistFeeder(root, belt) : crusherFeeder(root, belt);
}
