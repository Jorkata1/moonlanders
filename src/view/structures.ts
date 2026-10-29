import {
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
} from "three";
import { FINISH, boltRing, lathe, platingTexture } from "./kit";
import { LOOK, box, glow, mesh, surface } from "./materials";

const AIRLOCK_ANGLE = -0.6;

/** Living module: a round hab with a window strip, a door and porch lights. */
function habitat(): Group {
  const hab = new Group();
  const plating = surface({ map: platingTexture("hab", "#eef1f6", 6, 2), roughness: 0.38, reflective: true, envMapIntensity: 0.4 });
  hab.add(mesh(new CylinderGeometry(0.9, 0.95, 1.1, 24), plating, 0, 0.55, 0));
  hab.add(mesh(new SphereGeometry(0.9, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), LOOK.panel(), 0, 1.1, 0));
  hab.add(mesh(new CylinderGeometry(0.915, 0.915, 0.14, 24, 1, true, -1.2, 2.4), glow(0xffd9a0, 1.4), 0, 0.82, 0));
  hab.add(mesh(new CylinderGeometry(0.97, 0.97, 0.08, 24), FINISH.orange(), 0, 0.3, 0));
  hab.add(box(0.6, 0.85, 0.2, FINISH.graphite(), 0, 0.46, 0.86, 0.08));
  hab.add(box(0.44, 0.05, 0.03, glow(0x4de3ff, 3), 0, 0.95, 0.97, 0.02));
  hab.add(mesh(new CylinderGeometry(0.06, 0.06, 0.4, 8), FINISH.gunmetal(), 0.5, 1.75, 0.2), mesh(new SphereGeometry(0.05, 8, 6), glow(0xff5a5a, 3), 0.5, 1.98, 0.2));
  return hab;
}

/** Greenhouse: a glass box with planter rows under violet grow lights. */
function greenhouse(): Group {
  const house = new Group();
  const glass = new MeshStandardMaterial({ color: 0xcfefff, transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false });
  house.add(box(1.2, 0.12, 0.8, FINISH.graphite(), 0, 0.06, 0, 0.03));
  house.add(mesh(new CylinderGeometry(0.42, 0.42, 1.2, 16, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), glass, 0, 0.12, 0));
  const leaf = surface({ color: 0x4caf6a, flat: true, roughness: 0.8 });
  for (const z of [-0.2, 0.2]) {
    house.add(box(1.0, 0.1, 0.18, FINISH.orange(), 0, 0.17, z, 0.02));
    for (let i = 0; i < 4; i += 1) house.add(mesh(new ConeGeometry(0.08, 0.2, 6), leaf, -0.36 + i * 0.24, 0.32, z));
  }
  house.add(box(1.0, 0.03, 0.06, glow(0xc06bff, 2.4), 0, 0.5, 0, 0.01));
  return house;
}

/** Airlock: a short tunnel through the dome wall with a door and status lights. */
function airlock(radius: number): Group {
  const lock = new Group();
  lock.add(mesh(new CylinderGeometry(0.62, 0.62, 1.3, 20, 1, false).rotateX(Math.PI / 2), LOOK.white(), 0, 0.62, 0));
  lock.add(mesh(new TorusGeometry(0.64, 0.06, 8, 24), FINISH.orange(), 0, 0.62, 0.62));
  lock.add(box(0.7, 0.9, 0.06, FINISH.graphite(), 0, 0.52, 0.66, 0.06));
  lock.add(box(0.04, 0.6, 0.02, glow(0x5df2a0, 2.6), 0, 0.55, 0.7, 0.01));
  for (const x of [-0.45, 0.45]) lock.add(mesh(new SphereGeometry(0.05, 8, 6), glow(0xffd9a0, 2.6), x, 1.1, 0.62));
  lock.position.set(Math.sin(AIRLOCK_ANGLE) * radius, 0, Math.cos(AIRLOCK_ANGLE) * radius);
  lock.rotation.y = AIRLOCK_ANGLE;
  return lock;
}

/** The oxygen dome: glass over a ribbed frame with latitude rings, a bolted foundation ring, an airlock, a hab and a greenhouse, and the glowing O2 ring. */
export function domeModel(radius: number): Group {
  const root = new Group();
  const glass = new MeshStandardMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0.1, side: DoubleSide, depthWrite: false });
  glass.userData.reflective = true;
  glass.envMapIntensity = 0.45;
  root.add(mesh(new SphereGeometry(radius, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), glass));
  const frame = FINISH.chrome();
  for (let i = 0; i < 8; i += 1) {
    const rib = mesh(new TorusGeometry(radius, 0.04, 6, 48, Math.PI), frame);
    rib.rotation.y = (i / 8) * Math.PI;
    root.add(rib);
  }
  for (const height of [0.45, 0.78]) {
    const y = radius * height;
    root.add(mesh(new TorusGeometry(Math.sqrt(radius * radius - y * y), 0.035, 6, 48), frame, 0, y, 0).rotateX(Math.PI / 2));
  }
  root.add(mesh(new CylinderGeometry(0.3, 0.36, 0.16, 16), FINISH.graphite(), 0, radius - 0.02, 0));
  root.add(mesh(new TorusGeometry(radius, 0.16, 10, 64), LOOK.panel(), 0, 0.06, 0).rotateX(Math.PI / 2));
  root.add(...boltRing(radius + 0.12, 0.12, 32, FINISH.gunmetal(), 0.04));
  const zone = mesh(new RingGeometry(radius - 0.3, radius - 0.2, 64), glow(0x4de3ff, 0.9));
  zone.rotation.x = -Math.PI / 2;
  zone.position.y = 0.03;
  root.add(zone);
  root.add(lathe([[0, 0.02], [radius - 0.35, 0.02], [radius - 0.35, 0.04], [0, 0.04]], surface({ map: platingTexture("dome-floor", "#5a6274", 8, 8), roughness: 0.7 }), 48));

  const hab = habitat();
  hab.position.set(-1.25, 0, -1.15);
  const house = greenhouse();
  house.position.set(0.7, 0, -2.0);
  house.rotation.y = -0.4;
  root.add(hab, house, airlock(radius));
  const lamp = new PointLight(0xbdeeff, 4, 7, 2);
  lamp.position.set(0, 2.6, 0);
  root.add(lamp);
  return root;
}

export interface LanderModel {
  root: Group;
  flame: Mesh;
}

/** The escape pod: a scorched heat shield, a conical crew capsule with a porthole and hatch, thrusters, a chute housing and landing legs; it stays parked beside the dome. */
export function landerModel(): LanderModel {
  const root = new Group();
  const body = new Group();
  const plating = surface({ map: platingTexture("pod", "#dc2626", 8, 3), roughness: 0.38, reflective: true, envMapIntensity: 0.45 });
  body.add(lathe([[0, 0.3], [0.8, 0.32], [0.82, 0.42], [0.62, 1.5], [0.36, 1.78], [0, 1.8]], plating, 32));
  body.add(lathe([[0, 0.22], [0.66, 0.24], [0.84, 0.34], [0.8, 0.42], [0, 0.42]], surface({ color: 0x3a2f2a, roughness: 0.9 }), 32));
  body.add(mesh(new CylinderGeometry(0.78, 0.81, 0.12, 32), FINISH.orange(), 0, 0.62, 0));
  body.add(mesh(new CylinderGeometry(0.37, 0.4, 0.22, 20), FINISH.graphite(), 0, 1.86, 0));
  body.add(mesh(new CylinderGeometry(0.3, 0.3, 0.06, 20), FINISH.orange(), 0, 1.99, 0));
  // Porthole and hatch.
  body.add(mesh(new SphereGeometry(0.15, 14, 10), surface({ color: 0x9fe8ff, emissive: 0x4de3ff, emissiveIntensity: 1.2, roughness: 0.1 }), 0, 1.15, 0.58).rotateX(Math.PI / 2));
  body.add(mesh(new TorusGeometry(0.17, 0.035, 8, 20), FINISH.gunmetal(), 0, 1.15, 0.6).rotateX(-0.25));
  body.add(box(0.4, 0.55, 0.05, FINISH.graphite(), 0, 0.98, -0.66, 0.04).rotateX(0.3));
  // Thruster quads and antennas.
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    body.add(box(0.12, 0.12, 0.12, FINISH.gunmetal(), Math.sin(angle) * 0.56, 1.4, Math.cos(angle) * 0.56, 0.03));
    body.add(mesh(new ConeGeometry(0.04, 0.08, 8), FINISH.graphite(), Math.sin(angle) * 0.64, 1.4, Math.cos(angle) * 0.64).rotateZ(Math.PI / 2));
  }
  body.add(mesh(new CylinderGeometry(0.01, 0.01, 0.4, 6), FINISH.graphite(), 0.22, 2.2, 0.1), mesh(new SphereGeometry(0.03, 8, 6), glow(0xff5a5a, 3), 0.22, 2.42, 0.1));
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2;
    const leg = box(0.06, 0.6, 0.06, LOOK.steel(), Math.sin(angle) * 0.78, 0.22, Math.cos(angle) * 0.78, 0.02);
    leg.rotation.set(Math.cos(angle) * 0.35, 0, -Math.sin(angle) * 0.35);
    body.add(leg, mesh(new CylinderGeometry(0.14, 0.16, 0.05, 10), FINISH.graphite(), Math.sin(angle) * 0.92, 0.02, Math.cos(angle) * 0.92));
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
