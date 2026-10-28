import { CylinderGeometry, Group, PointLight, SphereGeometry, TorusGeometry } from "three";
import { base, beltMaterial, consolePanel, emitter, outlet, type MachineModel } from "./machineParts";
import { buildFeeder, type FeederKind } from "./feeders";
import { box, glow, mesh, surface } from "./materials";
import { FINISH, boltRing, hazardTexture, lathe, pipe, platingTexture } from "./kit";

const FURNACE = { x: -0.2, z: -0.4 } as const;
const PRESS = { x: 0.95, z: -0.2, top: 2.0, rest: 1.62, stroke: 0.26 } as const;

/** Furnace shell: a riveted steel drum with bands, a domed roof and a glowing pour slit. */
function furnace(root: Group, heat: ReturnType<typeof surface>): Group {
  const group = new Group();
  group.position.set(FURNACE.x, 0, FURNACE.z);
  const plating = surface({ map: platingTexture("furnace", "#7a3a22", 6, 3), roughness: 0.6, metalness: 0.3, reflective: true, envMapIntensity: 0.35 });
  plating.map?.repeat.set(2, 1);
  group.add(lathe([[0.82, 0.24], [0.84, 0.4], [0.82, 0.48], [0.8, 1.52]], plating, 40));
  // Steel roof dome over the brick-red drum.
  const roof = surface({ map: platingTexture("furnace-roof", "#8a93a3", 8, 2), roughness: 0.35, metalness: 0.7, reflective: true, envMapIntensity: 0.7 });
  group.add(lathe([[0.86, 1.5], [0.86, 1.58], [0.74, 1.74], [0.52, 1.9], [0.28, 2.0], [0, 2.02]], roof, 40));
  for (const y of [0.5, 1.15, 1.5]) {
    group.add(mesh(new CylinderGeometry(0.835, 0.835, 0.09, 40), FINISH.gunmetal(), 0, y, 0));
    group.add(...boltRing(0.84, y, 18, FINISH.chrome(), 0.022));
  }
  // The pour slit: a band of molten light across the front of the drum.
  group.add(mesh(new CylinderGeometry(0.815, 0.815, 0.16, 32, 1, true, -Math.PI * 0.35, Math.PI * 0.7), heat, 0, 0.83, 0));
  // Heavy door with a porthole.
  group.add(box(0.62, 0.5, 0.12, FINISH.graphite(), 0, 1.28, 0.78, 0.08));
  group.add(mesh(new CylinderGeometry(0.15, 0.15, 0.04, 24).rotateX(Math.PI / 2), heat, 0, 1.3, 0.85));
  group.add(mesh(new TorusGeometry(0.16, 0.035, 8, 24), FINISH.chrome(), 0, 1.3, 0.86));
  for (const x of [-0.24, 0.24]) group.add(box(0.06, 0.4, 0.06, FINISH.chrome(), x, 1.28, 0.86, 0.02));
  group.add(box(0.7, 0.07, 0.04, surface({ map: hazardTexture(), roughness: 0.5 }), 0, 1.58, 0.74, 0.01));
  root.add(group);
  return group;
}

/** Three graphite electrodes in the roof whose tips flicker while the arc burns. */
function electrodes(group: Group, arc: ReturnType<typeof surface>): void {
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2 + 0.4;
    const x = Math.sin(angle) * 0.24;
    const z = Math.cos(angle) * 0.24;
    group.add(mesh(new CylinderGeometry(0.07, 0.07, 0.62, 12), FINISH.graphite(), x, 2.15, z));
    group.add(mesh(new CylinderGeometry(0.1, 0.1, 0.08, 12), FINISH.orange(), x, 2.42, z));
    group.add(mesh(new SphereGeometry(0.05, 10, 8), arc, x, 1.88, z));
    group.add(pipe([[x, 2.45, z], [x * 2.2, 2.6, z * 2.2], [x * 3.2, 2.2, z * 3.2]], 0.025, FINISH.rubber()));
  }
}

/** Hydraulic press over the output hatch that stamps each plate. */
function press(root: Group): Group {
  for (const x of [PRESS.x - 0.32, PRESS.x + 0.32]) root.add(box(0.1, PRESS.top - 0.24, 0.12, FINISH.gunmetal(), x, 0.24 + (PRESS.top - 0.24) / 2, PRESS.z, 0.03));
  root.add(box(0.8, 0.18, 0.26, FINISH.orange(), PRESS.x, PRESS.top + 0.05, PRESS.z, 0.05));
  root.add(mesh(new CylinderGeometry(0.11, 0.11, 0.3, 16), FINISH.chrome(), PRESS.x, PRESS.top + 0.25, PRESS.z));
  const ram = new Group();
  ram.userData.dynamic = true;
  ram.add(mesh(new CylinderGeometry(0.06, 0.06, 0.4, 12), FINISH.chrome(), 0, 0.2, 0));
  ram.add(box(0.46, 0.08, 0.22, FINISH.graphite(), 0, 0, 0, 0.02));
  ram.position.set(PRESS.x, PRESS.rest, PRESS.z);
  root.add(ram);
  return ram;
}

/** The new smelter: an arc furnace drum, electrodes on the roof, a stamping press and a tall stack. */
export function smelterModel(feeder: FeederKind = "hoist"): MachineModel {
  const root = new Group();
  const rig = base(root);
  const heat = surface({ color: 0xffb050, emissive: 0xff5a10, emissiveIntensity: 1.2, roughness: 0.4, noShadow: true }).clone();
  const arc = surface({ color: 0xcfe8ff, emissive: 0x7fc8ff, emissiveIntensity: 0.4, roughness: 0.3, noShadow: true }).clone();
  const drum = furnace(root, heat);
  electrodes(drum, arc);

  // Stack with bands and a glowing lip.
  const stackX = 0.45;
  const stackZ = -1.0;
  root.add(lathe([[0.3, 0.24], [0.26, 0.5], [0.22, 3.3], [0.27, 3.4], [0.27, 3.5], [0.2, 3.52]], FINISH.gunmetal(), 20).translateX(stackX).translateZ(stackZ));
  for (const y of [1.2, 2.0, 2.8]) root.add(mesh(new TorusGeometry(0.235, 0.03, 6, 20), FINISH.graphite(), stackX, y, stackZ).rotateX(Math.PI / 2));
  root.add(mesh(new TorusGeometry(0.21, 0.025, 6, 20), glow(0xff7a2a, 1.8), stackX, 3.5, stackZ).rotateX(Math.PI / 2));
  // Coolant pipes round the back.
  root.add(pipe([[-0.9, 0.3, -1.05], [-0.95, 1.0, -1.0], [-0.6, 1.9, -0.95], [stackX - 0.2, 2.2, stackZ]], 0.05, surface({ color: 0x3f6d8f, roughness: 0.4, metalness: 0.5 })));

  const ram = press(root);
  const belt = beltMaterial();
  const input = buildFeeder(feeder, root, belt);
  const output = outlet(root);
  const screen = consolePanel(root, 1.45, -0.85, 0x5df2a0);

  const glowLight = new PointLight(0xff7a2a, 0, 4, 2);
  glowLight.position.set(FURNACE.x, 1.0, FURNACE.z + 1.1);
  root.add(glowLight);
  const smoke = emitter(root, stackX, 3.6, stackZ, 0x8a8a96, 9, 2.4);

  return {
    root,
    inputTray: input.tray,
    inputPath: input.path,
    outputTray: output.tray,
    outputPath: output.path,
    rig,
    update(time, dt, working, progress) {
      const flicker = Math.sin(time * 13) * 0.3 + Math.sin(time * 31) * 0.15;
      heat.emissiveIntensity = working ? 2.8 + flicker + progress : 0.6;
      arc.emissiveIntensity = working ? 2 + Math.max(0, Math.sin(time * 47)) * 4 : 0.3;
      glowLight.intensity = working ? 3.5 + flicker * 2 : 0;
      // The ram drops hard as each plate finishes, then lifts back.
      const stamp = working && progress > 0.85 ? Math.sin(((progress - 0.85) / 0.15) * Math.PI) : 0;
      ram.position.y = PRESS.rest - stamp * PRESS.stroke;
      if (belt.map) belt.map.offset.y = (belt.map.offset.y - dt * (working ? 0.8 : 0)) % 1;
      screen.emissiveIntensity = 1 + Math.sin(time * 5) * 0.2;
      input.update(time, dt, working);
      smoke(time, dt, working);
    },
  };
}
