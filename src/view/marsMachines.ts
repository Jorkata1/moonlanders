import { CylinderGeometry, Group, PointLight, SphereGeometry, TorusGeometry, type Mesh } from "three";
import { ITEMS } from "../config";
import { base, beltMaterial, consolePanel, emitter, intake, outlet, type MachineModel } from "./machines";
import { LOOK, box, glow, mesh, surface } from "./materials";
import { panelTexture } from "./textures";

/** Wire mill: copper ore is drawn through rollers and wound onto a spinning spool. */
export function wireMillModel(): MachineModel {
  const root = new Group();
  base(root);
  const body = surface({ map: panelTexture("wiremill-panels", "#2f6f63", 4), roughness: 0.5, metalness: 0.35, reflective: true, envMapIntensity: 0.35 });
  root.add(box(1.6, 1.1, 1.4, body, 0.05, 0.8, -0.4, 0.1));
  root.add(box(1.7, 0.12, 1.5, LOOK.dark(), 0.05, 1.4, -0.4, 0.04));

  const copper = surface({ color: ITEMS.wire.color, roughness: 0.25, metalness: 0.85, reflective: true, envMapIntensity: 1 });
  const rollers = new Group();
  rollers.userData.dynamic = true;
  for (const x of [-0.45, 0.05, 0.55]) {
    const roller = mesh(new CylinderGeometry(0.16, 0.16, 1.2, 14), LOOK.steel(), x, 1.62, -0.4);
    roller.rotation.x = Math.PI / 2;
    rollers.add(roller);
  }
  root.add(rollers);

  const spool = new Group();
  spool.userData.dynamic = true;
  spool.position.set(0.6, 1.0, 0.55);
  const coil = mesh(new CylinderGeometry(0.34, 0.34, 0.5, 20), copper);
  coil.rotation.z = Math.PI / 2;
  spool.add(coil);
  for (const x of [-0.28, 0.28]) {
    const flange = mesh(new CylinderGeometry(0.46, 0.46, 0.05, 20), LOOK.dark(), x, 0, 0);
    flange.rotation.z = Math.PI / 2;
    spool.add(flange);
  }
  root.add(spool, box(0.12, 0.7, 0.12, LOOK.steel(), 0.25, 0.6, 0.55, 0.02), box(0.12, 0.7, 0.12, LOOK.steel(), 0.95, 0.6, 0.55, 0.02));

  const beacon = surface({ color: 0x5df2c0, emissive: 0x2fd1a0, emissiveIntensity: 0.3, roughness: 0.3, noShadow: true }).clone();
  root.add(mesh(new SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), beacon, -0.5, 1.46, 0.1));

  const belt = beltMaterial();
  const inputTray = intake(root, belt);
  const outputTray = outlet(root);
  const screen = consolePanel(root, 1.4, -0.75, 0x3fd1a0);

  return {
    root,
    inputTray,
    outputTray,
    update(time, dt, working) {
      for (const roller of rollers.children) roller.rotation.y += dt * (working ? 8 : 0.2);
      spool.rotation.x += dt * (working ? 5 : 0.1);
      beacon.emissiveIntensity = working ? 1.5 + Math.max(0, Math.sin(time * 8)) * 3 : 0.3;
      if (belt.map) belt.map.offset.y = (belt.map.offset.y - dt * (working ? 0.8 : 0)) % 1;
      screen.emissiveIntensity = 1 + Math.sin(time * 5) * 0.2;
    },
  };
}

/** Fuel synthesizer: dry ice is cracked in a pressure sphere and bottled into glowing cells. */
export function fuelSynthModel(): MachineModel {
  const root = new Group();
  base(root);
  root.add(mesh(new CylinderGeometry(0.62, 0.7, 0.3, 20), LOOK.steel(), -0.1, 0.39, -0.45));
  const sphere = surface({ color: 0xe8ecf2, roughness: 0.25, metalness: 0.4, reflective: true, envMapIntensity: 0.8 });
  root.add(mesh(new SphereGeometry(0.7, 24, 16), sphere, -0.1, 1.2, -0.45));
  root.add(mesh(new TorusGeometry(0.71, 0.05, 8, 28), LOOK.orange(), -0.1, 1.2, -0.45).rotateX(Math.PI / 2));

  const cellGlow = surface({ color: 0x9cf07a, emissive: ITEMS.fuelCell.color, emissiveIntensity: 0.4, roughness: 0.2, noShadow: true }).clone();
  const cells: Mesh[] = [];
  for (let i = 0; i < 3; i += 1) {
    const cell = mesh(new CylinderGeometry(0.13, 0.13, 0.6, 14), cellGlow, 0.55 + i * 0.3, 0.6, -0.95);
    cells.push(cell);
    root.add(cell, mesh(new CylinderGeometry(0.09, 0.1, 0.06, 10), LOOK.dark(), 0.55 + i * 0.3, 0.93, -0.95));
  }
  root.add(mesh(new CylinderGeometry(0.06, 0.06, 1.2, 8), LOOK.steel(), 0.5, 1.5, -0.45).rotateZ(Math.PI / 2));

  const gauge = new Group();
  gauge.userData.dynamic = true;
  gauge.add(box(0.04, 0.22, 0.02, glow(0xff5a5a, 2)));
  gauge.position.set(-0.1, 1.2, 0.27);
  root.add(gauge, mesh(new CylinderGeometry(0.18, 0.18, 0.04, 20), LOOK.white(), -0.1, 1.2, 0.25).rotateX(Math.PI / 2));

  const light = new PointLight(0x8cf06a, 0, 3, 2);
  light.position.set(0.85, 0.9, -0.5);
  root.add(light);

  const belt = beltMaterial();
  const inputTray = intake(root, belt);
  const outputTray = outlet(root);
  const screen = consolePanel(root, 1.4, 0.0, 0x8cf06a);
  const vapour = emitter(root, -0.1, 1.95, -0.45, 0xf2f4ff, 7, 1.6);

  return {
    root,
    inputTray,
    outputTray,
    update(time, dt, working, progress) {
      cellGlow.emissiveIntensity = working ? 1 + progress * 2 + Math.sin(time * 9) * 0.3 : 0.4;
      cells.forEach((cell, i) => cell.scale.set(1, working ? 0.92 + Math.sin(time * 6 + i) * 0.08 : 1, 1));
      light.intensity = working ? 2 + progress * 2 : 0;
      gauge.rotation.z = working ? -0.4 - progress * 1.6 + Math.sin(time * 20) * 0.05 : 0.6;
      if (belt.map) belt.map.offset.y = (belt.map.offset.y - dt * (working ? 0.8 : 0)) % 1;
      screen.emissiveIntensity = 1 + Math.sin(time * 4) * 0.2;
      vapour(time, dt, working);
    },
  };
}

/** Engine works: wire and fuel cells feed an assembly bay where an engine fires on a test stand. */
export function engineWorksModel(): MachineModel {
  const root = new Group();
  base(root);
  const hull = surface({ map: panelTexture("engineworks-panels", "#5a5f6e", 5), roughness: 0.45, metalness: 0.45, reflective: true, envMapIntensity: 0.4 });
  root.add(box(1.5, 1.7, 1.3, hull, 0.15, 1.05, -0.15, 0.12));
  root.add(box(1.6, 0.14, 1.4, LOOK.orange(), 0.15, 1.95, -0.15, 0.04));

  // Test stand with an engine whose nozzle glows while it is being assembled.
  const stand = new Group();
  stand.position.set(0.15, 2.05, -0.15);
  stand.add(mesh(new CylinderGeometry(0.32, 0.36, 0.45, 16), LOOK.steel(), 0, 0.5, 0));
  const flame = surface({ color: 0xffb070, emissive: ITEMS.engine.color, emissiveIntensity: 0.2, roughness: 0.4, noShadow: true }).clone();
  stand.add(mesh(new CylinderGeometry(0.2, 0.38, 0.35, 16, 1, true), flame, 0, 0.12, 0));
  root.add(stand);

  const arm = new Group();
  arm.userData.dynamic = true;
  arm.position.set(1.1, 1.0, 0.55);
  arm.add(mesh(new CylinderGeometry(0.1, 0.12, 0.9, 10), LOOK.orange(), 0, 0.45, 0));
  const fore = box(0.12, 0.7, 0.12, LOOK.dark(), 0, 1.15, -0.2, 0.03);
  fore.rotation.x = -0.6;
  arm.add(fore, mesh(new SphereGeometry(0.08, 10, 8), glow(0x4de3ff, 2.5), 0, 1.45, -0.42));
  root.add(arm);

  const glowLight = new PointLight(0xff7a3a, 0, 4, 2);
  glowLight.position.set(0.15, 2.4, -0.15);
  root.add(glowLight);

  const belt = beltMaterial();
  const inputTray = intake(root, belt, 1);
  const secondTray = intake(root, belt, -1);
  const outputTray = outlet(root);
  const screen = consolePanel(root, 1.4, -0.9, 0xff8a4a);
  const exhaust = emitter(root, 0.15, 2.6, -0.15, 0xffc08a, 6, 1.8);

  return {
    root,
    inputTray,
    secondTray,
    outputTray,
    update(time, dt, working, progress) {
      const flicker = Math.sin(time * 17) * 0.3 + Math.sin(time * 41) * 0.2;
      flame.emissiveIntensity = working ? 1.5 + progress * 2.5 + flicker : 0.2;
      glowLight.intensity = working ? 2 + progress * 3 + flicker : 0;
      arm.rotation.y = working ? Math.sin(time * 2.4) * 0.9 : arm.rotation.y * 0.95;
      if (belt.map) belt.map.offset.y = (belt.map.offset.y - dt * (working ? 0.8 : 0)) % 1;
      screen.emissiveIntensity = 1 + Math.sin(time * 5) * 0.2;
      exhaust(time, dt, working);
    },
  };
}
