import { CylinderGeometry, Group, SphereGeometry, TorusGeometry, type MeshStandardMaterial } from "three";
import { bakeStatic } from "./bake";
import { LOOK, box, glow, mesh, surface } from "./materials";

export interface SuitStationModel {
  readonly root: Group;
  /** Arms work over the spare suit while you stand at the station. */
  update(time: number, dt: number, active: boolean): void;
}

function servoArm(side: 1 | -1): Group {
  const arm = new Group();
  arm.userData.dynamic = true;
  arm.add(mesh(new CylinderGeometry(0.09, 0.11, 0.3, 10), LOOK.dark(), 0, 0.15, 0));
  const upper = box(0.1, 0.7, 0.1, LOOK.orange(), 0, 0.6, 0, 0.03);
  const fore = box(0.08, 0.5, 0.08, LOOK.steel(), side * -0.2, 1.0, 0.18, 0.02);
  fore.rotation.set(0.6, 0, side * 0.5);
  arm.add(upper, fore, mesh(new SphereGeometry(0.06, 10, 8), glow(0x4de3ff, 2.4), side * -0.36, 1.14, 0.34));
  return arm;
}

/** The suit station from the emergency kit: a spare suit on a rack, servo arms, oxygen tanks and a status screen. */
export function suitStationModel(): SuitStationModel {
  const root = new Group();
  root.add(box(2.4, 0.2, 1.6, LOOK.dark(), 0, 0.1, -0.2, 0.06));
  root.add(box(2.46, 0.05, 1.66, glow(0xffc83d, 0.4), 0, 0.025, -0.2, 0.02));
  root.add(box(2.2, 1.9, 0.18, LOOK.panel(), 0, 1.15, -0.9, 0.08));
  root.add(box(2.3, 0.14, 0.4, LOOK.dark(), 0, 2.15, -0.8, 0.04));
  const screenMaterial: MeshStandardMaterial = surface({ color: 0x0a1612, emissive: 0x4de3ff, emissiveIntensity: 1.2, roughness: 0.2, noShadow: true }).clone();
  root.add(box(0.6, 0.4, 0.04, screenMaterial, 0.72, 1.55, -0.79, 0.02));

  // The spare suit on its rack.
  const suit = LOOK.white();
  root.add(box(0.06, 1.5, 0.06, LOOK.steel(), 0, 0.95, -0.7, 0.02));
  root.add(box(0.56, 0.62, 0.36, suit, 0, 1.2, -0.55, 0.12));
  root.add(box(0.4, 0.46, 0.18, LOOK.panel(), 0, 1.22, -0.8, 0.06));
  root.add(mesh(new SphereGeometry(0.24, 18, 14), suit, 0, 1.72, -0.55));
  root.add(mesh(new SphereGeometry(0.17, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), surface({ color: 0xffa040, emissive: 0xff7a20, emissiveIntensity: 0.6, roughness: 0.1, reflective: true, envMapIntensity: 1 }), 0, 1.72, -0.4).rotateX(Math.PI / 2));
  for (const x of [-0.36, 0.36]) root.add(box(0.14, 0.52, 0.16, suit, x, 1.1, -0.55, 0.06));
  for (const x of [-0.14, 0.14]) root.add(box(0.17, 0.52, 0.18, suit, x, 0.62, -0.55, 0.06));
  root.add(box(0.6, 0.06, 0.38, LOOK.orange(), 0, 0.92, -0.55, 0.02));

  // Oxygen tanks on the left.
  for (const z of [-0.6, -0.25]) {
    root.add(mesh(new CylinderGeometry(0.16, 0.16, 1.1, 16), LOOK.white(), -0.95, 0.75, z));
    root.add(mesh(new TorusGeometry(0.165, 0.03, 6, 18), glow(0x4de3ff, 1.6), -0.95, 0.95, z).rotateX(Math.PI / 2));
    root.add(mesh(new CylinderGeometry(0.06, 0.08, 0.12, 10), LOOK.dark(), -0.95, 1.36, z));
  }
  const halo = surface({ color: 0x9ff0ff, emissive: 0x4de3ff, emissiveIntensity: 0.6, roughness: 0.3, noShadow: true }).clone();
  root.add(mesh(new TorusGeometry(0.42, 0.03, 8, 32), halo, 0, 2.35, -0.55).rotateX(Math.PI / 2));

  const left = servoArm(1);
  left.position.set(-0.75, 0.2, 0.1);
  const right = servoArm(-1);
  right.position.set(0.95, 0.2, 0.1);
  root.add(left, right);
  bakeStatic(root);

  return {
    root,
    update(time, dt, active) {
      const speed = active ? 3.2 : 0.7;
      left.rotation.y = Math.sin(time * speed) * (active ? 0.6 : 0.2) + 0.3;
      right.rotation.y = -Math.sin(time * speed + 1) * (active ? 0.6 : 0.2) - 0.3;
      halo.emissiveIntensity += ((active ? 2.6 : 0.6) - halo.emissiveIntensity) * Math.min(1, dt * 5);
      screenMaterial.emissiveIntensity = 1.1 + Math.sin(time * 3) * 0.2;
    },
  };
}
