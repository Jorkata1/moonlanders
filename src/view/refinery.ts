import { CylinderGeometry, Group, MeshStandardMaterial, SphereGeometry, TorusGeometry, type Mesh } from "three";
import { base, beltMaterial, consolePanel, emitter, outlet, type MachineModel } from "./machineParts";
import { box, glow, mesh, surface } from "./materials";
import { buildFeeder } from "./feeders";
import { FINISH, boltRing, lathe, pipe } from "./kit";

const REACTOR = { x: -0.2, y: 1.25, z: -0.38, radius: 0.6 } as const;
const COLUMN = { x: 0.55, z: -0.92, radius: 0.2, height: 2.5 } as const;
const CAROUSEL = { x: 1.08, z: -0.72, radius: 0.24, cells: 6 } as const;

function glass(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ color: 0xe8ddff, transparent: true, opacity: 0.25, roughness: 0.04, metalness: 0.1, depthWrite: false });
  material.userData.reflective = true;
  return material;
}

/** Spherical reactor on legs: a glass belt shows the violet plasma swirling inside. */
function reactor(root: Group, plasma: MeshStandardMaterial): Group {
  const group = new Group();
  group.position.set(REACTOR.x, REACTOR.y, REACTOR.z);
  const r = REACTOR.radius;
  const caps = surface({ color: 0xc9ced8, roughness: 0.45, metalness: 0.55, reflective: true, envMapIntensity: 0.35 });
  group.add(mesh(new SphereGeometry(r, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.36), caps, 0, 0, 0));
  group.add(mesh(new SphereGeometry(r, 32, 20, 0, Math.PI * 2, Math.PI * 0.64, Math.PI * 0.36), caps, 0, 0, 0));
  group.add(mesh(new CylinderGeometry(r * 0.93, r * 0.93, r * 0.86, 32, 1, true), glass(), 0, 0, 0));
  const core = new Group();
  core.userData.dynamic = true;
  core.add(mesh(new SphereGeometry(r * 0.55, 20, 14), plasma));
  for (let i = 0; i < 3; i += 1) core.add(mesh(new TorusGeometry(r * 0.72, 0.025, 6, 32), glow(0xc49bff, 2.4)).rotateX(Math.PI / 2 + i * 0.6).rotateY(i * 1.1));
  group.add(core);
  for (const y of [r * 0.43, -r * 0.43]) {
    group.add(mesh(new TorusGeometry(r * 0.94, 0.045, 8, 36), FINISH.gunmetal(), 0, y, 0).rotateX(Math.PI / 2));
    group.add(...boltRing(r * 0.97, y, 16, FINISH.chrome(), 0.02));
  }
  group.add(mesh(new CylinderGeometry(0.12, 0.16, 0.2, 14), FINISH.orange(), 0, r + 0.05, 0));
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = box(0.08, REACTOR.y - 0.24, 0.08, FINISH.gunmetal(), Math.sin(angle) * r * 0.75, -(REACTOR.y - 0.24) / 2, Math.cos(angle) * r * 0.75, 0.02);
    group.add(leg);
  }
  root.add(group);
  return core;
}

/** Distillation column with a sight glass where the refined helium level rises and falls. */
function column(root: Group, liquid: MeshStandardMaterial): Mesh {
  const { x, z, radius, height } = COLUMN;
  root.add(lathe([[radius + 0.06, 0.24], [radius, 0.4], [radius, height], [radius * 0.7, height + 0.18], [0.06, height + 0.26]], FINISH.shell(), 24).translateX(x).translateZ(z));
  for (const y of [0.9, 1.5, 2.1]) root.add(mesh(new TorusGeometry(radius + 0.01, 0.03, 6, 20), FINISH.gunmetal(), x, y, z).rotateX(Math.PI / 2));
  // Sight glass on the front.
  root.add(mesh(new CylinderGeometry(0.07, 0.07, 1.7, 12), glass(), x, 1.35, z + radius + 0.04));
  const level = mesh(new CylinderGeometry(0.05, 0.05, 1, 10), liquid, x, 0.6, z + radius + 0.04);
  level.userData.dynamic = true;
  root.add(level);
  root.add(mesh(new SphereGeometry(0.05, 10, 8), glow(0xff5a5a, 2.6), x, height + 0.32, z));
  return level;
}

/** Carousel that fills empty cells and turns them toward the output hatch. */
function carousel(root: Group): { spin: Group; cells: MeshStandardMaterial } {
  const { x, z, radius, cells } = CAROUSEL;
  root.add(mesh(new CylinderGeometry(radius + 0.1, radius + 0.14, 0.5, 20), FINISH.graphite(), x, 0.49, z));
  const spin = new Group();
  spin.userData.dynamic = true;
  spin.position.set(x, 0.74, z);
  const fill = surface({ color: 0x6dffd2, emissive: 0x6dffd2, emissiveIntensity: 1.2, roughness: 0.25, noShadow: true }).clone();
  spin.add(mesh(new CylinderGeometry(radius + 0.06, radius + 0.06, 0.04, 20), FINISH.chrome()));
  for (let i = 0; i < cells; i += 1) {
    const angle = (i / cells) * Math.PI * 2;
    spin.add(mesh(new CylinderGeometry(0.055, 0.055, 0.2, 12), fill, Math.sin(angle) * radius, 0.12, Math.cos(angle) * radius));
    spin.add(mesh(new CylinderGeometry(0.06, 0.06, 0.03, 12), FINISH.graphite(), Math.sin(angle) * radius, 0.235, Math.cos(angle) * radius));
  }
  root.add(spin);
  // Filling nozzle over the carousel.
  root.add(box(0.08, 0.6, 0.08, FINISH.gunmetal(), x + 0.3, 0.95, z - 0.2, 0.02));
  root.add(box(0.36, 0.08, 0.1, FINISH.orange(), x + 0.14, 1.24, z - 0.12, 0.03));
  root.add(mesh(new CylinderGeometry(0.03, 0.05, 0.14, 10), FINISH.chrome(), x, 1.14, z - 0.06));
  return { spin, cells: fill };
}

/** The new helium refinery: a crystal crusher, a glass-belted plasma reactor, a distillation column and a cell-filling carousel. */
export function refineryModel(): MachineModel {
  const root = new Group();
  const rig = base(root);
  const plasma = surface({ color: 0xb27bff, emissive: 0x8a4dff, emissiveIntensity: 1.6, roughness: 0.2, noShadow: true }).clone();
  const liquid = surface({ color: 0x6dffd2, emissive: 0x3dffc0, emissiveIntensity: 1.4, roughness: 0.2, noShadow: true }).clone();
  const core = reactor(root, plasma);
  const level = column(root, liquid);
  const filler = carousel(root);
  root.add(pipe([[REACTOR.x + 0.45, REACTOR.y + 0.35, REACTOR.z - 0.25], [0.3, 2.3, -0.75], [COLUMN.x, 2.2, COLUMN.z + 0.1]], 0.06, FINISH.chrome()));
  root.add(pipe([[COLUMN.x + 0.15, 0.5, COLUMN.z + 0.1], [0.85, 0.9, -0.85], [CAROUSEL.x + 0.3, 1.2, CAROUSEL.z - 0.2]], 0.05, surface({ color: 0x3f6d8f, roughness: 0.4, metalness: 0.5 })));

  const belt = beltMaterial();
  const input = buildFeeder("crusher", root, belt);
  const output = outlet(root);
  const screen = consolePanel(root, 1.45, 0.05, 0x6dffd2);
  const steam = emitter(root, COLUMN.x, COLUMN.height + 0.4, COLUMN.z, 0xd8c8ff, 6, 1.4);

  return {
    root,
    inputTray: input.tray,
    inputPath: input.path,
    outputTray: output.tray,
    outputPath: output.path,
    rig,
    update(time, dt, working, progress) {
      core.rotation.y += dt * (working ? 2.4 : 0.3);
      core.rotation.x = Math.sin(time * 0.7) * 0.2;
      plasma.emissiveIntensity = working ? 2.2 + Math.sin(time * 9) * 0.5 : 0.7;
      const fill = 0.25 + 0.7 * (working ? progress : 0.4);
      level.scale.y = 1.6 * fill;
      level.position.y = 0.52 + (1.6 * fill) / 2;
      filler.spin.rotation.y += dt * (working ? 1.2 : 0);
      filler.cells.emissiveIntensity = working ? 1.6 + Math.sin(time * 6) * 0.4 : 0.8;
      input.update(time, dt, working);
      screen.emissiveIntensity = 1 + Math.sin(time * 4) * 0.2;
      steam(time, dt, working);
    },
  };
}
