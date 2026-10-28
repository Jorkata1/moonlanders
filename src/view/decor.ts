import { CatmullRomCurve3, ConeGeometry, CylinderGeometry, DoubleSide, Group, LatheGeometry, Mesh, SphereGeometry, TorusGeometry, TubeGeometry, Vector2, Vector3, type MeshStandardMaterial, type Object3D } from "three";
import type { DecorDef, DecorKind, PlanetDef, Point } from "../planets/types";
import { LOOK, box, glow, mesh, surface } from "./materials";
import { bakeStatic } from "./bake";
import { FINISH } from "./kit";
import { heightAt } from "./terrain";
import { panelTexture } from "./textures";

/** One separately placed prop, so the intro can drop it in on its own. */
export interface DecorPiece {
  readonly root: Group;
  readonly kind: DecorKind | "cable" | "beacon";
}

/** Base-camp set dressing: solar farm, antenna, cables, path beacons, lamps, crates, fuel tanks and crash debris. */
export interface DecorView {
  root: Group;
  pieces: DecorPiece[];
  update(time: number): void;
}

function solarPanel(): Group {
  const group = new Group();
  const cells = surface({ map: panelTexture("solar-cells", "#1b2c5c", 6), color: 0x6f8fe0, roughness: 0.25, metalness: 0.5, reflective: true, envMapIntensity: 0.8 });
  group.add(mesh(new CylinderGeometry(0.05, 0.07, 0.8, 8), LOOK.steel(), 0, 0.4, 0));
  const panel = box(1.6, 0.05, 1.0, cells, 0, 0.85, 0, 0.02);
  panel.rotation.x = -0.45;
  group.add(panel, box(1.66, 0.03, 1.06, LOOK.steel(), 0, 0.83, 0.01, 0.01).rotateX(-0.45));
  return group;
}

/** Rate the dish turns while sweeping the sky, in radians per second. */
const DISH_SWEEP = 0.12;

/** Satellite dish: a parabolic reflector on a turning mount with struts, a feed horn, a counterweight, an equipment cabinet and a beacon. */
function antenna(): Group {
  const group = new Group();
  group.add(box(1.1, 0.16, 1.1, FINISH.graphite(), 0, 0.08, 0, 0.04));
  group.add(mesh(new CylinderGeometry(0.16, 0.24, 1.5, 14), FINISH.gunmetal(), 0, 0.9, 0));
  group.add(mesh(new CylinderGeometry(0.3, 0.3, 0.12, 20), FINISH.orange(), 0, 1.62, 0));
  const mount = new Group();
  mount.position.y = 1.7;
  mount.userData.dynamic = true;
  mount.userData.sweep = true;
  mount.add(box(0.36, 0.3, 0.36, FINISH.shell(), 0, 0.12, 0, 0.06));
  const tilt = new Group();
  tilt.position.y = 0.3;
  tilt.rotation.x = -0.75;
  // Parabolic reflector with ribs on its back and a rim.
  const curve = Array.from({ length: 9 }, (_, i) => {
    const r = (i / 8) * 1.0;
    return new Vector2(r, r * r * 0.32);
  });
  const reflector = surface({ color: 0xdfe3ea, roughness: 0.55, reflective: true, envMapIntensity: 0.2 }).clone();
  reflector.side = DoubleSide;
  tilt.add(new Mesh(new LatheGeometry(curve, 32), reflector).translateY(0.12));
  tilt.add(mesh(new TorusGeometry(1.0, 0.03, 6, 40), FINISH.gunmetal(), 0, 0.44, 0).rotateX(Math.PI / 2));
  for (let i = 0; i < 6; i += 1) {
    const rib = box(0.03, 0.05, 1.0, FINISH.gunmetal(), 0, 0.2, 0.5, 0.01);
    const holder = new Group();
    holder.rotation.y = (i / 6) * Math.PI * 2;
    rib.rotation.x = -0.32;
    holder.add(rib);
    tilt.add(holder);
  }
  // Three struts holding the feed horn at the focus.
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2;
    const foot = new Vector3(Math.sin(angle) * 0.85, 0.36, Math.cos(angle) * 0.85);
    const strut = pipeBetween(foot, new Vector3(0, 1.0, 0), 0.015, FINISH.chrome());
    tilt.add(strut);
  }
  tilt.add(mesh(new ConeGeometry(0.08, 0.2, 12), FINISH.orange(), 0, 0.98, 0).rotateX(Math.PI));
  tilt.add(mesh(new CylinderGeometry(0.06, 0.06, 0.08, 12), FINISH.graphite(), 0, 1.1, 0));
  tilt.add(box(0.24, 0.24, 0.24, FINISH.graphite(), 0, -0.15, -0.35, 0.04));
  mount.add(tilt);
  group.add(mount);
  // Equipment cabinet with a status strip, and the beacon on a mast.
  group.add(box(0.55, 0.7, 0.4, FINISH.gunmetal(), 0.75, 0.5, 0.25, 0.05), box(0.45, 0.5, 0.02, LOOK.panel(), 0.75, 0.52, 0.46, 0.02));
  group.add(box(0.4, 0.04, 0.02, glow(0x5df2a0, 2.4), 0.75, 0.7, 0.46, 0.01));
  group.add(mesh(new CylinderGeometry(0.02, 0.02, 0.8, 6), FINISH.graphite(), -0.45, 0.55, -0.4));
  group.add(mesh(new SphereGeometry(0.06, 10, 8), glow(0xff5a5a, 3), -0.45, 0.98, -0.4));
  return group;
}

/** A thin rod from `from` to `to`. */
function pipeBetween(from: Vector3, to: Vector3, radius: number, material: MeshStandardMaterial): Mesh {
  const length = from.distanceTo(to);
  const rod = mesh(new CylinderGeometry(radius, radius, length, 6), material);
  rod.position.copy(from).lerp(to, 0.5);
  rod.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), to.clone().sub(from).normalize());
  return rod;
}

function crateStack(): Group {
  const group = new Group();
  group.add(box(0.7, 0.6, 0.7, LOOK.orange(), 0, 0.3, 0, 0.05));
  group.add(box(0.6, 0.5, 0.6, LOOK.panel(), 0.75, 0.25, 0.1, 0.05).rotateY(0.3));
  group.add(box(0.5, 0.45, 0.5, LOOK.teal(), 0.1, 0.83, 0.05, 0.05).rotateY(-0.4));
  return group;
}

function fuelTanks(): Group {
  const group = new Group();
  for (const [x, z] of [[0, 0], [1.1, 0.2], [0.5, -0.9]] as const) {
    group.add(mesh(new CylinderGeometry(0.45, 0.45, 1.6, 18), LOOK.white(), x, 0.8, z));
    group.add(mesh(new SphereGeometry(0.45, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), LOOK.white(), x, 1.6, z));
    group.add(mesh(new CylinderGeometry(0.46, 0.46, 0.18, 18), LOOK.orange(), x, 1.1, z));
  }
  return group;
}

function flag(): Group {
  const group = new Group();
  group.add(mesh(new CylinderGeometry(0.025, 0.025, 2, 8), LOOK.steel(), 0, 1, 0));
  group.add(box(0.8, 0.5, 0.02, LOOK.orange(), 0.42, 1.7, 0, 0.01));
  group.add(box(0.3, 0.3, 0.025, LOOK.white(), 0.42, 1.7, 0, 0.01));
  return group;
}

/** A path light: a slim post with a warm lamp head. */
function lamp(): Group {
  const group = new Group();
  group.add(mesh(new CylinderGeometry(0.06, 0.1, 1.5, 8), LOOK.dark(), 0, 0.75, 0));
  group.add(box(0.34, 0.1, 0.22, LOOK.steel(), 0.12, 1.52, 0, 0.03));
  group.add(box(0.26, 0.04, 0.16, glow(0xffd9a0, 2.6), 0.12, 1.46, 0, 0.01));
  return group;
}

/** Scorched hull panels and a broken fin thrown clear when the rocket came down. */
function debris(): Group {
  const group = new Group();
  const scorched = surface({ color: 0x2a2624, roughness: 0.95 });
  group.add(box(1.2, 0.08, 0.8, LOOK.white(), 0, 0.12, 0, 0.02).rotateZ(0.25).rotateX(-0.1));
  group.add(box(0.7, 0.02, 0.5, scorched, 0.1, 0.2, 0.05, 0.01).rotateZ(0.25));
  group.add(box(0.08, 0.9, 0.6, LOOK.orange(), 0.9, 0.3, 0.5, 0.03).rotateZ(1.1).rotateY(0.6));
  group.add(box(0.5, 0.06, 0.4, LOOK.steel(), -0.8, 0.06, 0.6, 0.02).rotateY(0.9));
  group.add(mesh(new CylinderGeometry(0.18, 0.24, 0.5, 10), scorched, -0.5, 0.15, -0.5).rotateZ(Math.PI / 2.4));
  return group;
}

/** Weatherproof connector box where a cable meets a building. */
function junction(): Group {
  const group = new Group();
  group.add(box(0.32, 0.26, 0.22, LOOK.dark(), 0, 0.13, 0, 0.04));
  group.add(box(0.08, 0.05, 0.02, glow(0x5df2a0, 2.4), 0.06, 0.2, 0.115, 0.01));
  return group;
}

function cable(planet: PlanetDef, from: Point, to: Point): Group {
  const group = new Group();
  const points: Vector3[] = [];
  const steps = 12;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = from.x + (to.x - from.x) * t + Math.sin(t * Math.PI * 2) * 0.3;
    const z = from.z + (to.z - from.z) * t;
    points.push(new Vector3(x, heightAt(planet, x, z) + 0.04, z));
  }
  group.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(points), 48, 0.04, 6), LOOK.rubber()));
  for (const end of [from, to]) {
    const connector = junction();
    connector.position.set(end.x, heightAt(planet, end.x, end.z), end.z);
    connector.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
    group.add(connector);
  }
  return group;
}

function place(planet: PlanetDef, object: Group, x: number, z: number, rotation = 0): Group {
  object.position.set(x, heightAt(planet, x, z), z);
  object.rotation.y = rotation;
  return object;
}

const BUILDERS: Record<Exclude<DecorKind, "solarFarm">, () => Group> = {
  antenna,
  crates: crateStack,
  flag,
  fuelTanks,
  lamp,
  debris,
};

function decorPiece(planet: PlanetDef, decor: DecorDef): Group {
  if (decor.kind !== "solarFarm") return place(planet, BUILDERS[decor.kind](), decor.x, decor.z, decor.rotation);
  // The farm is one piece placed at its first panel; panels sit on the local ground height.
  const farm = place(planet, new Group(), decor.x, decor.z);
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const x = decor.x + col * 1.8;
      const z = decor.z - row * 1.6;
      const panel = solarPanel();
      panel.position.set(x - decor.x, heightAt(planet, x, z) - farm.position.y, z - decor.z);
      farm.add(panel);
    }
  }
  return farm;
}

export function buildDecor(planet: PlanetDef): DecorView {
  const root = new Group();
  const pieces: DecorPiece[] = [];
  const { scenery } = planet;
  for (const decor of scenery.decor) pieces.push({ root: decorPiece(planet, decor), kind: decor.kind });
  for (const [from, to] of scenery.cables) pieces.push({ root: cable(planet, from, to), kind: "cable" });

  // Blinking beacons line the way through the ridge.
  const beaconMaterial = glow(0x4de3ff, 2.5).clone() as MeshStandardMaterial;
  for (const z of scenery.beaconRows) {
    for (const x of [-2.2, 2.2]) {
      const post = new Group();
      post.add(mesh(new CylinderGeometry(0.05, 0.07, 0.6, 8), LOOK.dark(), 0, 0.3, 0));
      post.add(mesh(new SphereGeometry(0.08, 10, 8), beaconMaterial, 0, 0.65, 0));
      pieces.push({ root: place(planet, post, x, z), kind: "beacon" });
    }
  }
  const sweepers: Object3D[] = [];
  for (const piece of pieces) {
    piece.root.traverse((object) => {
      if (object.userData.sweep === true) sweepers.push(object);
    });
    bakeStatic(piece.root);
    root.add(piece.root);
  }
  return {
    root,
    pieces,
    update(time) {
      beaconMaterial.emissiveIntensity = 0.6 + Math.max(0, Math.sin(time * 3)) * 3;
      // Dishes slowly sweep back and forth across the sky.
      for (const dish of sweepers) dish.rotation.y = Math.sin(time * DISH_SWEEP) * 1.2;
    },
  };
}
