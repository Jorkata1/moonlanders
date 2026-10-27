import { CatmullRomCurve3, CylinderGeometry, Group, Mesh, SphereGeometry, TubeGeometry, Vector3, type MeshStandardMaterial } from "three";
import type { PlanetDef, Point } from "../planets/types";
import { LOOK, box, glow, mesh, surface } from "./materials";
import { heightAt } from "./terrain";
import { panelTexture } from "./textures";

/** Base-camp set dressing: solar farm, antenna, cables, path beacons, crates and fuel tanks. */
export interface DecorView {
  root: Group;
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

function antenna(): Group {
  const group = new Group();
  group.add(mesh(new CylinderGeometry(0.08, 0.14, 2.6, 10), LOOK.steel(), 0, 1.3, 0));
  const dish = mesh(new SphereGeometry(0.75, 20, 10, 0, Math.PI * 2, 0, Math.PI / 3.2), LOOK.white(), 0, 2.9, 0.1);
  dish.rotation.x = Math.PI * 0.72;
  group.add(dish, mesh(new CylinderGeometry(0.02, 0.02, 0.6, 6), LOOK.dark(), 0, 2.85, 0.35).rotateX(-0.6));
  group.add(mesh(new SphereGeometry(0.06, 10, 8), glow(0xff5a5a, 3), 0, 3.1, 0.55));
  group.add(box(0.6, 0.4, 0.5, LOOK.dark(), 0.4, 0.2, 0.2, 0.04));
  return group;
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

function cable(planet: PlanetDef, from: Point, to: Point): Mesh {
  const points: Vector3[] = [];
  const steps = 12;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = from.x + (to.x - from.x) * t + Math.sin(t * Math.PI * 2) * 0.3;
    const z = from.z + (to.z - from.z) * t;
    points.push(new Vector3(x, heightAt(planet, x, z) + 0.04, z));
  }
  return new Mesh(new TubeGeometry(new CatmullRomCurve3(points), 48, 0.04, 6), LOOK.rubber());
}

function place(root: Group, planet: PlanetDef, object: Group | Mesh, x: number, z: number, rotation = 0): void {
  object.position.set(x, heightAt(planet, x, z), z);
  object.rotation.y = rotation;
  root.add(object);
}

export function buildDecor(planet: PlanetDef): DecorView {
  const root = new Group();
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 3; col += 1) place(root, planet, solarPanel(), -11.6 + col * 1.8, 2.2 - row * 1.6);
  }
  place(root, planet, antenna(), -2.8, 7.6, 0.6);
  place(root, planet, crateStack(), 2.6, 6.7, -0.3);
  place(root, planet, flag(), 4.6, 4.2);
  place(root, planet, fuelTanks(), -11.6, -17.5, 0.4);
  place(root, planet, crateStack(), 11.2, -12.4, 1.2);
  root.add(cable(planet, { x: 2.6, z: 0.4 }, { x: 4.8, z: -3.3 }));
  root.add(cable(planet, { x: -3.3, z: 3.9 }, { x: -8.8, z: 3.1 }));

  // Blinking beacons line the way through the ridge.
  const beaconMaterial = glow(0x4de3ff, 2.5).clone() as MeshStandardMaterial;
  for (const z of [-6.5, -12.6, -15]) {
    for (const x of [-2.2, 2.2]) {
      const post = new Group();
      post.add(mesh(new CylinderGeometry(0.05, 0.07, 0.6, 8), LOOK.dark(), 0, 0.3, 0));
      post.add(mesh(new SphereGeometry(0.08, 10, 8), beaconMaterial, 0, 0.65, 0));
      place(root, planet, post, x, z);
    }
  }
  return {
    root,
    update(time) {
      beaconMaterial.emissiveIntensity = 0.6 + Math.max(0, Math.sin(time * 3)) * 3;
    },
  };
}
