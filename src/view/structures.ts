import {
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from "three";
import { bakeStatic } from "./bake";
import { LOOK, box, glow, mesh, surface } from "./materials";

/** The oxygen dome: glass, a ribbed frame, a small habitat and a glowing O2 ring on the ground. */
export function domeModel(radius: number): Group {
  const root = new Group();
  const glass = new MeshStandardMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0.1, side: DoubleSide, depthWrite: false });
  glass.userData.reflective = true;
  glass.envMapIntensity = 0.45;
  root.add(mesh(new SphereGeometry(radius, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), glass));
  const frame = LOOK.steel();
  for (let i = 0; i < 6; i += 1) {
    const rib = mesh(new TorusGeometry(radius, 0.035, 6, 40, Math.PI), frame);
    rib.rotation.y = (i / 6) * Math.PI;
    root.add(rib);
  }
  const base = mesh(new TorusGeometry(radius, 0.14, 8, 48), LOOK.panel());
  base.rotation.x = Math.PI / 2;
  base.position.y = 0.05;
  const zone = mesh(new RingGeometry(radius - 0.3, radius - 0.2, 64), glow(0x4de3ff, 0.9));
  zone.rotation.x = -Math.PI / 2;
  zone.position.y = 0.03;
  root.add(base, zone);

  const hab = new Group();
  hab.add(mesh(new CylinderGeometry(0.9, 0.9, 1.1, 20), LOOK.white(), 0, 0.55, 0));
  hab.add(mesh(new SphereGeometry(0.9, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), LOOK.panel(), 0, 1.1, 0));
  hab.add(box(0.7, 0.9, 0.3, LOOK.dark(), 0, 0.5, 0.82, 0.08));
  hab.add(box(0.5, 0.06, 0.04, glow(0x4de3ff, 3), 0, 1.0, 0.98, 0.02));
  for (const angle of [0.9, -0.9, 2.4, -2.4]) {
    hab.add(mesh(new SphereGeometry(0.12, 12, 8), glow(0xffd9a0, 1.8), Math.sin(angle) * 0.88, 0.72, Math.cos(angle) * 0.88));
  }
  hab.position.set(-1.2, 0, -1.2);
  const plant = mesh(new ConeGeometry(0.28, 0.6, 7), surface({ color: 0x4caf6a, flat: true, roughness: 0.8 }), 1.4, 0.45, -1.1);
  const pot = mesh(new CylinderGeometry(0.22, 0.18, 0.25, 10), LOOK.orange(), 1.4, 0.12, -1.1);
  root.add(hab, plant, pot);
  const lamp = new PointLight(0xbdeeff, 4, 7, 2);
  lamp.position.set(0, 2.6, 0);
  root.add(lamp);
  return root;
}

export function workshopModel(): Group {
  const root = new Group();
  root.add(box(2.2, 0.16, 1.6, LOOK.dark(), 0, 0.08, -0.4, 0.06));
  root.add(box(1.6, 0.9, 0.5, LOOK.panel(), 0, 0.6, -0.9, 0.08));
  const screen = box(1.2, 0.5, 0.05, glow(0x4de3ff, 1.6), 0, 1.25, -0.88, 0.04);
  screen.rotation.x = -0.2;
  root.add(screen, box(0.08, 0.8, 0.08, LOOK.dark(), -0.75, 1.3, -1.1));
  // Robotic arm hanging over the bench.
  const arm = new Group();
  arm.add(mesh(new CylinderGeometry(0.12, 0.16, 0.3, 12), LOOK.orange(), 0, 0.15, 0));
  arm.add(box(0.12, 0.8, 0.12, LOOK.orange(), 0, 0.6, 0, 0.04));
  arm.add(box(0.5, 0.1, 0.1, LOOK.dark(), 0.22, 1.0, 0, 0.03));
  arm.position.set(0.85, 0.16, -0.7);
  arm.name = "arm";
  arm.userData.dynamic = true;
  root.add(arm);
  bakeStatic(root);
  return root;
}

export interface LanderModel {
  root: Group;
  flame: Mesh;
}

/** The little scout pod the player arrives in; it stays parked inside the dome afterwards. */
export function landerModel(): LanderModel {
  const root = new Group();
  const body = new Group();
  body.add(mesh(new CylinderGeometry(0.55, 0.75, 0.9, 16), LOOK.white(), 0, 0.95, 0));
  body.add(mesh(new ConeGeometry(0.55, 0.6, 16), LOOK.orange(), 0, 1.7, 0));
  body.add(mesh(new CylinderGeometry(0.76, 0.6, 0.2, 16), LOOK.dark(), 0, 0.42, 0));
  body.add(mesh(new SphereGeometry(0.16, 12, 8), surface({ color: 0x9fe8ff, emissive: 0x4de3ff, emissiveIntensity: 1.2, roughness: 0.1 }), 0, 1.05, 0.6).rotateX(Math.PI / 2));
  body.add(box(0.36, 0.5, 0.06, LOOK.dark(), 0, 0.9, -0.7, 0.03));
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = box(0.06, 0.6, 0.06, LOOK.steel(), Math.sin(angle) * 0.75, 0.25, Math.cos(angle) * 0.75, 0.02);
    leg.rotation.set(Math.cos(angle) * 0.35, 0, -Math.sin(angle) * 0.35);
    body.add(leg, mesh(new CylinderGeometry(0.14, 0.16, 0.05, 10), LOOK.dark(), Math.sin(angle) * 0.88, 0.02, Math.cos(angle) * 0.88));
  }
  const flame = mesh(new ConeGeometry(0.35, 1.4, 14, 1, true), glow(0xffa040, 4));
  flame.rotation.x = Math.PI;
  flame.position.y = -0.4;
  flame.visible = false;
  body.add(flame);
  root.add(body);
  root.traverse((object) => {
    if (object instanceof Mesh && object !== flame) object.castShadow = true;
  });
  return { root, flame };
}
