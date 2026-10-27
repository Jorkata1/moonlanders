import {
  CapsuleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { canvasTexture } from "./textures";
import { LOOK, box, glow, mesh, surface } from "./materials";

const SKIN = 0x7be0b4;
const BELLY = 0xc9f7df;
const HAZARD_STRIPES = "hazard-stripes";

export interface MerchantModel {
  root: Group;
  update(time: number, dt: number, lookAt: Vector3 | null, excited: boolean): void;
  /** Little hop and arm wave when something is sold. */
  cheer(): void;
}

function hazardStrip(width: number): Mesh {
  const map = canvasTexture(HAZARD_STRIPES, 128, 32, (ctx) => {
    ctx.fillStyle = "#1c1f28";
    ctx.fillRect(0, 0, 128, 32);
    ctx.fillStyle = "#ffc83d";
    for (let x = -32; x < 160; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 32);
      ctx.lineTo(x + 16, 32);
      ctx.lineTo(x + 32, 0);
      ctx.lineTo(x + 16, 0);
      ctx.fill();
    }
  });
  const tiled = map.clone();
  tiled.wrapS = RepeatWrapping;
  tiled.repeat.set(width / 0.5, 1);
  tiled.needsUpdate = true;
  return new Mesh(new PlaneGeometry(width, 0.12), surface({ map: tiled, roughness: 0.6 }));
}

function canopyFabric(): MeshStandardMaterial {
  const map = canvasTexture("canopy-stripes", 256, 64, (ctx) => {
    for (let i = 0; i < 8; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? "#2fb7c9" : "#f1f3f7";
      ctx.fillRect(i * 32, 0, 32, 64);
    }
  });
  const material = surface({ map, roughness: 0.75 }).clone();
  material.side = DoubleSide;
  return material;
}

function signBoard(): Mesh {
  const draw = (glowPass: boolean) => (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = glowPass ? "#000" : "#101527";
    ctx.fillRect(0, 0, 512, 160);
    ctx.font = "700 92px 'Chakra Petch', 'Trebuchet MS', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = glowPass ? "#ffd25a" : "#ffe7a1";
    ctx.fillText("ZIX TRADE", 256, 84);
  };
  const map = canvasTexture("trader-sign-base", 512, 160, draw(false));
  const emissiveMap = canvasTexture("trader-sign-glow", 512, 160, draw(true));
  return new Mesh(new PlaneGeometry(1.8, 0.56), surface({ map, emissiveMap, emissive: 0xffffff, emissiveIntensity: 2.4, roughness: 0.5, noShadow: true }));
}

function stall(): Group {
  const root = new Group();
  root.add(box(3.2, 0.2, 2.2, LOOK.dark(), 0, 0.1, 0, 0.05));
  const strip = hazardStrip(3.2);
  strip.position.set(0, 0.1, 1.105);
  root.add(strip);

  // Counter facing the trade pad.
  root.add(box(2.7, 0.95, 0.6, LOOK.teal(), 0, 0.68, 0.65, 0.06));
  root.add(box(2.8, 0.08, 0.72, LOOK.panel(), 0, 1.19, 0.65, 0.03));
  root.add(box(2.5, 0.05, 0.03, glow(0xffd25a, 2.6), 0, 0.92, 0.96, 0.01));
  root.add(box(0.5, 0.06, 0.4, LOOK.steel(), 0.8, 1.26, 0.65, 0.02));
  root.add(box(0.3, 0.3, 0.06, glow(0x4de3ff, 1.6), -0.85, 1.4, 0.6, 0.02).rotateX(-0.3));

  // Shelves of goods behind the trader.
  root.add(box(2.6, 1.6, 0.35, LOOK.dark(), 0, 1.0, -0.85, 0.04));
  root.add(box(0.9, 0.42, 0.7, LOOK.orange(), 0, 0.41, 0.0, 0.05));
  for (const y of [0.7, 1.25, 1.75]) root.add(box(2.5, 0.05, 0.4, LOOK.steel(), 0, y, -0.7, 0.02));
  const goods = [0xff8a2a, 0x4de3ff, 0xffc83d, 0x9b6bff, 0x5df2a0];
  for (let i = 0; i < 10; i += 1) {
    const row = Math.floor(i / 5);
    const x = -1.0 + (i % 5) * 0.5;
    const y = row === 0 ? 0.88 : 1.43;
    const color = goods[(i * 3) % goods.length] as number;
    if (i % 3 === 0) root.add(mesh(new CylinderGeometry(0.1, 0.1, 0.3, 12), surface({ color, roughness: 0.3, reflective: true, envMapIntensity: 0.6 }), x, y, -0.7));
    else if (i % 3 === 1) root.add(box(0.3, 0.26, 0.28, surface({ color, roughness: 0.6 }), x, y - 0.02, -0.7, 0.03));
    else root.add(mesh(new SphereGeometry(0.11, 10, 8), glow(color, 1.6), x, y - 0.04, -0.7));
  }

  // Crates by the side.
  root.add(box(0.6, 0.55, 0.6, LOOK.orange(), 1.75, 0.48, 0.3, 0.05));
  root.add(box(0.45, 0.4, 0.45, LOOK.panel(), 1.7, 0.95, 0.25, 0.04).rotateY(0.4));
  root.add(box(0.5, 0.45, 0.5, LOOK.teal(), -1.75, 0.43, 0.45, 0.05).rotateY(-0.3));

  // Canopy on four poles.
  // Awning over the back shelves only, so the camera above can still see Zix at the counter.
  for (const [x, z] of [[-1.45, -0.1], [1.45, -0.1], [-1.45, -0.95], [1.45, -0.95]] as const) {
    root.add(mesh(new CylinderGeometry(0.05, 0.05, 2.5, 8), LOOK.steel(), x, 1.45, z));
  }
  const canopy = mesh(new CylinderGeometry(1.6, 1.6, 3.3, 24, 1, true, 0, Math.PI), canopyFabric(), 0, 2.55, -0.55);
  canopy.rotation.z = Math.PI / 2;
  canopy.scale.set(1, 0.55, 0.3);
  root.add(canopy, box(3.3, 0.08, 0.08, LOOK.steel(), 0, 2.7, -0.08, 0.02));

  const sign = signBoard();
  sign.position.set(0, 3.25, -0.9);
  sign.rotation.x = -0.35;
  root.add(sign, box(1.9, 0.62, 0.06, LOOK.dark(), 0, 3.25, -0.93, 0.03).rotateX(-0.35));

  const lamp = new PointLight(0xffd9a0, 2.2, 4.5, 2);
  lamp.position.set(0, 2.3, 0.5);
  root.add(lamp);
  return root;
}

interface Eye {
  stalk: Group;
  pupil: Mesh;
}

function alien(): { root: Group; body: Group; eyes: Eye[]; arms: Group[]; lids: Mesh[] } {
  const root = new Group();
  const body = new Group();
  root.add(body);
  const skin = surface({ color: SKIN, roughness: 0.4, emissive: 0x1d5a40, emissiveIntensity: 0.15, reflective: true, envMapIntensity: 0.25 });
  const blob = mesh(new SphereGeometry(0.5, 28, 20), skin, 0, 0.55, 0);
  blob.scale.set(1, 1.15, 0.9);
  const belly = mesh(new SphereGeometry(0.36, 20, 16), surface({ color: BELLY, roughness: 0.5 }), 0, 0.45, 0.2);
  belly.scale.set(1, 1.1, 0.6);
  const mouth = mesh(new TorusGeometry(0.13, 0.025, 8, 16, Math.PI), surface({ color: 0x1a2a24, roughness: 0.6 }), 0, 0.72, 0.43);
  mouth.rotation.z = Math.PI;
  body.add(blob, belly, mouth);

  const eyes: Eye[] = [];
  const lids: Mesh[] = [];
  for (const [x, tilt, height] of [[-0.22, -0.35, 0.32], [0, 0, 0.42], [0.22, 0.35, 0.32]] as const) {
    const stalk = new Group();
    stalk.position.set(x, 0.95, 0.05);
    stalk.rotation.z = -tilt;
    stalk.add(mesh(new CylinderGeometry(0.03, 0.045, height, 8), skin, 0, height / 2, 0));
    const ball = mesh(new SphereGeometry(0.1, 16, 12), surface({ color: 0xe8ecf2, roughness: 0.35 }), 0, height + 0.06, 0);
    const pupil = mesh(new SphereGeometry(0.045, 12, 10), surface({ color: 0x111111, roughness: 0.1 }), 0, 0, 0.075);
    ball.add(pupil);
    const lid = mesh(new SphereGeometry(0.105, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), skin, 0, height + 0.06, 0);
    lid.scale.y = 0.05;
    stalk.add(ball, lid);
    body.add(stalk);
    eyes.push({ stalk, pupil });
    lids.push(lid);
  }

  const arms: Group[] = [];
  for (const [x, y] of [[-0.48, 0.62], [0.48, 0.62], [-0.44, 0.38], [0.44, 0.38]] as const) {
    const arm = new Group();
    arm.position.set(x, y, 0.05);
    arm.add(mesh(new CapsuleGeometry(0.05, 0.25, 4, 8), skin, 0, -0.17, 0));
    arm.add(mesh(new SphereGeometry(0.07, 10, 8), surface({ color: BELLY, roughness: 0.5 }), 0, -0.34, 0));
    arm.rotation.z = x < 0 ? -0.5 : 0.5;
    body.add(arm);
    arms.push(arm);
  }
  const antenna = mesh(new CylinderGeometry(0.012, 0.012, 0.3, 6), LOOK.dark(), 0.1, 1.38, -0.15);
  antenna.rotation.z = -0.3;
  const bulb = mesh(new SphereGeometry(0.05, 10, 8), glow(0xff5ad8, 3), 0.15, 1.53, -0.15);
  const visor = mesh(new TorusGeometry(0.42, 0.04, 8, 24, Math.PI * 0.9), LOOK.orange(), 0, 0.98, 0);
  visor.rotation.set(Math.PI / 2 - 0.2, 0, Math.PI * 0.05);
  body.add(antenna, bulb, visor);
  return { root, body, eyes, arms, lids };
}

export function merchantModel(): MerchantModel {
  const root = new Group();
  const stallRoot = stall();
  root.add(stallRoot);
  const creature = alien();
  // Zix stands on a crate behind the counter so he is visible from above.
  creature.root.position.set(0, 0.62, 0.0);
  creature.root.scale.setScalar(1.25);
  creature.root.userData.dynamic = true;
  root.add(creature.root);

  const hologram = new Group();
  hologram.userData.dynamic = true;
  const coin = mesh(new CylinderGeometry(0.16, 0.16, 0.04, 20), glow(0xffd25a, 2), 0, 0, 0);
  coin.rotation.x = Math.PI / 2;
  hologram.add(coin);
  hologram.position.set(0.8, 1.6, 0.65);
  root.add(hologram);

  let cheerTime = 0;
  let blinkTimer = 2;
  const localTarget = new Vector3();

  return {
    root,
    cheer() {
      cheerTime = 0.6;
    },
    update(time, dt, lookAt, excited) {
      cheerTime = Math.max(0, cheerTime - dt);
      const hop = cheerTime > 0 ? Math.sin((1 - cheerTime / 0.6) * Math.PI) * 0.18 : 0;
      creature.body.position.y = hop + Math.sin(time * 2.2) * 0.025;
      const squash = 1 + Math.sin(time * 2.2) * 0.02 - hop * 0.3;
      creature.body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
      creature.arms.forEach((arm, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        const wave = excited || cheerTime > 0 ? Math.sin(time * 9 + index) * 0.6 : Math.sin(time * 1.5 + index) * 0.08;
        arm.rotation.z = side * (0.5 + (index < 2 ? Math.max(0, wave) * 1.2 : 0)) + (index >= 2 ? wave * 0.3 : 0);
      });
      blinkTimer -= dt;
      const closed = blinkTimer < 0.12;
      if (blinkTimer < 0) blinkTimer = 2 + Math.random() * 3;
      for (const lid of creature.lids) lid.scale.y = closed ? 1 : 0.05;
      if (lookAt) {
        creature.eyes.forEach((eye) => {
          localTarget.copy(lookAt);
          eye.stalk.worldToLocal(localTarget);
          const yaw = Math.atan2(localTarget.x, localTarget.z);
          eye.pupil.position.set(Math.sin(yaw) * 0.06, -0.02, Math.cos(yaw) * 0.075);
        });
        creature.root.rotation.y += (Math.atan2(lookAt.x - root.position.x, lookAt.z - root.position.z) * 0.35 - creature.root.rotation.y) * Math.min(1, dt * 4);
      }
      hologram.rotation.y = time * 2;
      hologram.position.y = 1.6 + Math.sin(time * 3) * 0.05;
    },
  };
}
