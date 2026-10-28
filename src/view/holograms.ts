import { AdditiveBlending, BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, SphereGeometry, TorusGeometry } from "three";

/** Shapes floating above a pad that say what it does. */
export type HologramIcon = "coin" | "in" | "out" | "rocket" | "gear" | "wrench" | "path" | "robot" | "drone";

const cache = new Map<number, MeshBasicMaterial>();

/** Glowing, slightly see-through material shared by every hologram of one colour. */
export function hologramMaterial(color: number): MeshBasicMaterial {
  const cached = cache.get(color);
  if (cached) return cached;
  const material = new MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false });
  cache.set(color, material);
  return material;
}

function part(geometry: ConstructorParameters<typeof Mesh>[0], material: MeshBasicMaterial, x = 0, y = 0, z = 0): Mesh {
  const piece = new Mesh(geometry, material);
  piece.position.set(x, y, z);
  return piece;
}

function coin(m: MeshBasicMaterial): Group {
  const group = new Group();
  group.add(part(new CylinderGeometry(0.3, 0.3, 0.06, 28), m).rotateX(Math.PI / 2));
  group.add(part(new TorusGeometry(0.22, 0.03, 6, 24), m, 0, 0, 0.05));
  group.add(part(new BoxGeometry(0.06, 0.26, 0.04), m, 0, 0, 0.06));
  return group;
}

function arrow(m: MeshBasicMaterial, up: boolean): Group {
  const group = new Group();
  group.add(part(new CylinderGeometry(0.07, 0.07, 0.34, 10), m, 0, up ? -0.1 : 0.1, 0));
  const head = part(new ConeGeometry(0.2, 0.26, 14), m, 0, up ? 0.18 : -0.18, 0);
  if (!up) head.rotation.x = Math.PI;
  group.add(head);
  return group;
}

function rocket(m: MeshBasicMaterial): Group {
  const group = new Group();
  group.add(part(new CylinderGeometry(0.12, 0.14, 0.4, 14), m));
  group.add(part(new ConeGeometry(0.12, 0.2, 14), m, 0, 0.3, 0));
  for (const x of [-0.16, 0.16]) group.add(part(new BoxGeometry(0.08, 0.16, 0.03), m, x, -0.14, 0));
  return group;
}

function gear(m: MeshBasicMaterial): Group {
  const group = new Group();
  group.add(part(new TorusGeometry(0.2, 0.06, 8, 24), m));
  for (let i = 0; i < 8; i += 1) {
    const tooth = part(new BoxGeometry(0.09, 0.12, 0.08), m, Math.cos((i / 8) * Math.PI * 2) * 0.28, Math.sin((i / 8) * Math.PI * 2) * 0.28, 0);
    tooth.rotation.z = (i / 8) * Math.PI * 2 + Math.PI / 2;
    group.add(tooth);
  }
  return group;
}

function wrench(m: MeshBasicMaterial): Group {
  const group = new Group();
  group.add(part(new BoxGeometry(0.08, 0.42, 0.05), m));
  group.add(part(new TorusGeometry(0.1, 0.035, 6, 14, Math.PI * 1.5), m, 0, 0.27, 0).rotateZ(-Math.PI / 4));
  group.rotation.z = -0.6;
  return group;
}

function path(m: MeshBasicMaterial): Group {
  const group = new Group();
  for (const x of [-0.14, 0.14]) group.add(part(new BoxGeometry(0.06, 0.5, 0.04), m, x, 0, 0));
  for (const y of [-0.14, 0.04, 0.22]) group.add(part(new BoxGeometry(0.22, 0.04, 0.04), m, 0, y, 0));
  return group;
}

function robot(m: MeshBasicMaterial): Group {
  const group = new Group();
  group.add(part(new BoxGeometry(0.36, 0.24, 0.12), m));
  group.add(part(new SphereGeometry(0.05, 10, 8), m, 0, 0, 0.08));
  group.add(part(new CylinderGeometry(0.015, 0.015, 0.14, 6), m, 0, 0.19, 0));
  for (const x of [-0.12, 0.12]) group.add(part(new CylinderGeometry(0.06, 0.06, 0.05, 12), m, x, -0.17, 0).rotateZ(Math.PI / 2));
  return group;
}

function drone(m: MeshBasicMaterial): Group {
  const group = new Group();
  group.add(part(new SphereGeometry(0.12, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m));
  for (const [x, z] of [[0.22, 0.22], [-0.22, 0.22], [0.22, -0.22], [-0.22, -0.22]] as const) {
    group.add(part(new TorusGeometry(0.1, 0.018, 6, 16), m, x, 0.02, z).rotateX(Math.PI / 2));
  }
  group.rotation.x = 0.5;
  return group;
}

const BUILDERS: Record<HologramIcon, (m: MeshBasicMaterial) => Group> = {
  coin,
  in: (m) => arrow(m, false),
  out: (m) => arrow(m, true),
  rocket,
  gear,
  wrench,
  path,
  robot,
  drone,
};

export function hologram(icon: HologramIcon, color: number): Group {
  const group = BUILDERS[icon](hologramMaterial(color));
  group.traverse((object) => {
    object.userData.noCastShadow = true;
  });
  return group;
}
