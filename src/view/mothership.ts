import { ConeGeometry, CylinderGeometry, Group, SphereGeometry, Vector3, type MeshStandardMaterial } from "three";
import { LOOK, box, glow, mesh, surface } from "./materials";

/** The carrier's flight over the base in the opening cinematic. */
export const CARRIER = {
  height: 30,
  scale: 1.5,
  /** It crosses the base from west to east over this many seconds, dropping cargo as it goes. */
  passSeconds: 9,
  span: 30,
  z: -4,
  /** Cargo leaves the carrier this far below its hull. */
  bayDrop: 2.4,
} as const;

/** Where the carrier is `t` seconds into the opening, relative to the base centre. */
export function carrierAt(base: Vector3, t: number, out: Vector3): Vector3 {
  const k = Math.min(1, Math.max(0, t / CARRIER.passSeconds));
  return out.copy(base).add(new Vector3(-CARRIER.span + k * 2 * CARRIER.span, CARRIER.height + Math.sin(t * 0.7) * 0.4, CARRIER.z));
}

export interface MothershipModel {
  readonly root: Group;
  readonly engines: MeshStandardMaterial;
}

/** The cargo carrier seen in orbit at the start of the intro, dropping the base piece by piece. */
export function mothershipModel(): MothershipModel {
  const root = new Group();
  const hull = surface({ color: 0xd8dde6, roughness: 0.45, metalness: 0.4, reflective: true, envMapIntensity: 0.6 });
  root.add(mesh(new CylinderGeometry(1.6, 1.9, 11, 16), hull).rotateZ(Math.PI / 2));
  root.add(mesh(new ConeGeometry(1.6, 3.4, 16), hull, 7.2, 0, 0).rotateZ(-Math.PI / 2));
  root.add(mesh(new SphereGeometry(0.7, 14, 10), surface({ color: 0x9fe8ff, emissive: 0x4de3ff, emissiveIntensity: 1.2, roughness: 0.1 }), 7.6, 0.7, 0));
  for (const z of [-1, 1]) {
    root.add(box(5, 0.25, 4.5, LOOK.panel(), -1, 0, z * 3.6, 0.1));
    root.add(box(1.4, 0.3, 1.4, LOOK.orange(), -2.8, 0, z * 5.6, 0.1));
  }
  // Cargo bay rails under the hull.
  for (let i = 0; i < 4; i += 1) root.add(box(1.1, 0.5, 1.6, LOOK.dark(), 3 - i * 1.6, -1.8, 0, 0.08));
  const engines = surface({ color: 0xffb070, emissive: 0x4de3ff, emissiveIntensity: 3, roughness: 0.3, noShadow: true }).clone();
  for (const z of [-0.9, 0.9]) {
    root.add(mesh(new CylinderGeometry(0.75, 0.95, 1.6, 14), LOOK.dark(), -6.2, 0, z).rotateZ(Math.PI / 2));
    root.add(mesh(new CylinderGeometry(0.6, 0.6, 0.1, 14), engines, -7.05, 0, z).rotateZ(Math.PI / 2));
  }
  root.add(mesh(new CylinderGeometry(0.06, 0.06, 3, 6), LOOK.steel(), 2, 2.2, 0), mesh(new SphereGeometry(0.15, 8, 6), glow(0xff5a5a, 3), 2, 3.7, 0));

  // Hull stripe and a row of lit windows along each side.
  const windows = glow(0xbfefff, 2.2);
  for (const z of [-1, 1]) {
    root.add(box(9, 0.18, 0.05, LOOK.orange(), 0, 0.6, z * 1.72, 0.02));
    for (let i = 0; i < 9; i += 1) root.add(box(0.32, 0.18, 0.05, windows, -3.6 + i * 0.95, 0.95, z * 1.66, 0.02));
  }
  // Navigation lights on the wing tips: red to port, green to starboard.
  root.add(mesh(new SphereGeometry(0.16, 8, 6), glow(0xff4a3a, 4), -1, 0.2, -5.85), mesh(new SphereGeometry(0.16, 8, 6), glow(0x46f08c, 4), -1, 0.2, 5.85));
  // Open cargo bay glowing underneath, where the base modules drop from.
  root.add(box(3.6, 0.08, 1.4, glow(0xffc070, 1.8), 1.4, -2.08, 0, 0.02));
  // Engine plumes: translucent so they read as exhaust, not solid spikes.
  const plume = glow(0x6fd8ff, 3);
  plume.transparent = true;
  plume.opacity = 0.45;
  plume.depthWrite = false;
  for (const z of [-0.9, 0.9]) root.add(mesh(new ConeGeometry(0.55, 3.2, 14, 1, true), plume, -8.7, 0, z).rotateZ(Math.PI / 2));
  root.scale.setScalar(CARRIER.scale);
  return { root, engines };
}
