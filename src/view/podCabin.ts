import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Path,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
} from "three";
import { FINISH } from "./kit";
import { box } from "./materials";
import { canvasTexture, seeded } from "./textures";

/** The cabin is built round the astronaut's eye: the origin, looking down −z with +y up. */
const WALL_Z = -0.62;
const WINDOW_WIDTH = 0.44;
const WINDOW_HEIGHT = 0.58;
const WINDOW_Y = -0.02;
const WINDOW_CORNER = 0.09;
/** How deep the hull is round the window, so the glass sits back in a short tunnel. */
const WINDOW_DEPTH = 0.14;
const SIDE_X = 0.7;
const CEILING_Y = 0.64;
const FLOOR_Y = -1.0;
const BACK_Z = 0.5;
/** One tile of the padded wall texture covers this much wall. */
const PANEL_TILE = 0.8;
const BUTTON_COUNT = 46;

/** What the console screen shows. */
export type CabinScreen = "calm" | "fault" | "release" | "free" | "descent" | "dead";

export interface CabinMoment {
  readonly time: number;
  /** Cabin lamp and consoles: 1 normal, 0 dark once the power is gone. */
  readonly power: number;
  /** The red master-alarm pulse, 0..1. */
  readonly alarm: number;
  /** Light pouring in through the window: its colour and how strong it is. */
  readonly spill: Color;
  readonly spillStrength: number;
  readonly screen: CabinScreen;
  /** Height above the surface for the descent screen, in kilometres. */
  readonly altitude: number;
}

export interface PodCabin {
  /** Place this at the astronaut's eye, turned with their body (not their head). */
  readonly root: Group;
  update(moment: CabinMoment): void;
}

/** A rounded rectangle traced into `path`, centred on (cx, cy). */
function roundedRect(path: Path, width: number, height: number, corner: number, cx = 0, cy = 0): Path {
  const x = cx - width / 2;
  const y = cy - height / 2;
  path.moveTo(x + corner, y);
  path.lineTo(x + width - corner, y);
  path.quadraticCurveTo(x + width, y, x + width, y + corner);
  path.lineTo(x + width, y + height - corner);
  path.quadraticCurveTo(x + width, y + height, x + width - corner, y + height);
  path.lineTo(x + corner, y + height);
  path.quadraticCurveTo(x, y + height, x, y + height - corner);
  path.lineTo(x, y + corner);
  path.quadraticCurveTo(x, y, x + corner, y);
  return path;
}

/** Padded off-white wall panels: seams, rivets, the odd stencilled label and a scuff or two. */
function wallTexture(): CanvasTexture {
  const texture = canvasTexture("cabin-wall", 512, 512, (ctx) => {
    const random = seeded(17);
    ctx.fillStyle = "#a9adb6";
    ctx.fillRect(0, 0, 512, 512);
    // Two by two quilted panels per tile, each a little different in tone.
    for (let i = 0; i < 4; i += 1) {
      const x = (i % 2) * 256;
      const y = Math.floor(i / 2) * 256;
      ctx.fillStyle = `rgba(${150 + random() * 30},${154 + random() * 30},${164 + random() * 30},1)`;
      ctx.fillRect(x + 8, y + 8, 240, 240);
      const quilt = ctx.createLinearGradient(x, y, x + 256, y + 256);
      quilt.addColorStop(0, "rgba(255,255,255,0.10)");
      quilt.addColorStop(1, "rgba(0,0,0,0.12)");
      ctx.fillStyle = quilt;
      ctx.fillRect(x + 8, y + 8, 240, 240);
      ctx.fillStyle = "rgba(40,42,50,0.55)";
      for (const [rx, ry] of [[20, 20], [236, 20], [20, 236], [236, 236]] as const) {
        ctx.beginPath();
        ctx.arc(x + rx, y + ry, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.strokeStyle = "rgba(30,32,40,0.8)";
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 506, 506);
    ctx.beginPath();
    ctx.moveTo(256, 0);
    ctx.lineTo(256, 512);
    ctx.moveTo(0, 256);
    ctx.lineTo(512, 256);
    ctx.stroke();
    ctx.font = "600 22px monospace";
    ctx.fillStyle = "rgba(40,42,52,0.75)";
    ctx.fillText("PANEL 3B", 40, 60);
    ctx.fillText("O2 LINE", 300, 330);
    // Hazard stripes on a strap anchor.
    for (let k = 0; k < 6; k += 1) {
      ctx.fillStyle = k % 2 === 0 ? "rgba(220,170,40,0.85)" : "rgba(30,30,30,0.85)";
      ctx.fillRect(60 + k * 14, 420, 14, 26);
    }
    for (let i = 0; i < 160; i += 1) {
      ctx.fillStyle = `rgba(30,30,40,${random() * 0.08})`;
      ctx.fillRect(random() * 512, random() * 512, 2 + random() * 18, 1 + random() * 3);
    }
  });
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/** Dust specks and a faint smear on the inside of the glass, only seen when light catches it. */
function glassTexture(): CanvasTexture {
  return canvasTexture("cabin-glass", 256, 256, (ctx) => {
    const random = seeded(23);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 256, 256);
    const smear = ctx.createLinearGradient(0, 256, 256, 0);
    smear.addColorStop(0.2, "rgba(255,255,255,0)");
    smear.addColorStop(0.45, "rgba(255,255,255,0.35)");
    smear.addColorStop(0.6, "rgba(255,255,255,0)");
    ctx.fillStyle = smear;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 220; i += 1) {
      ctx.fillStyle = `rgba(255,255,255,${0.2 + random() * 0.6})`;
      ctx.fillRect(random() * 256, random() * 256, 1 + random() * 1.5, 1 + random() * 1.5);
    }
  });
}

/** A plane `width` × `height` whose texture repeats once per wall tile. */
function wall(width: number, height: number, material: MeshStandardMaterial): Mesh {
  const geometry = new PlaneGeometry(width, height);
  const uv = geometry.attributes.uv!;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, (uv.getX(i) * width) / PANEL_TILE, (uv.getY(i) * height) / PANEL_TILE);
  return new Mesh(geometry, material);
}

/** Scale a shape geometry's uvs (which are its own x, y) to one repeat per wall tile. */
function tileUvs(geometry: BufferGeometry): BufferGeometry {
  const uv = geometry.attributes.uv!;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) / PANEL_TILE, uv.getY(i) / PANEL_TILE);
  return geometry;
}

/** What the console's status screen says, drawn fresh whenever it changes. */
function drawScreen(ctx: CanvasRenderingContext2D, screen: CabinScreen, altitude: number, blink: boolean): void {
  ctx.fillStyle = "#03080a";
  ctx.fillRect(0, 0, 256, 160);
  if (screen === "dead") return;
  const cyan = "#7fe9ff";
  const amber = "#ffb547";
  const red = "#ff5a48";
  ctx.font = "600 17px monospace";
  ctx.fillStyle = "rgba(127,233,255,0.45)";
  ctx.fillText("POD-1  SYS", 14, 24);
  ctx.fillRect(14, 32, 228, 2);
  const lines: readonly (readonly [string, string])[] =
    screen === "calm"
      ? [["JUMP DRIVE   OK", cyan], ["HULL         OK", cyan], ["POD DOCKED", cyan]]
      : screen === "fault"
        ? [["JUMP DRIVE", amber], [blink ? "FAULT" : "", red], ["CORE 412%", red]]
        : screen === "release"
          ? [["POD RELEASE", red], [blink ? "ARMED" : "", red], ["BRACE", amber]]
          : screen === "free"
            ? [["POD FREE", amber], ["ATTITUDE HOLD", cyan], ["MAIN ENGINE", cyan]]
            : [["DESCENT", amber], [`ALT ${altitude.toFixed(1)} KM`, altitude < 3 ? red : amber], [blink ? "TOO FAST" : "", red]];
  ctx.font = "700 24px monospace";
  lines.forEach(([text, color], i) => {
    ctx.fillStyle = color;
    ctx.fillText(text, 14, 66 + i * 34);
  });
}

/**
 * The inside of the escape pod: a cramped, padded capsule with a tall window, a console under it with
 * a status screen and rows of lit buttons, an overhead panel with the master-alarm lamp, and the
 * lights that tell the story: the cabin lamp, the red alarm, and whatever pours in through the glass.
 */
export function podCabin(): PodCabin {
  const root = new Group();
  const random = seeded(41);
  const padding = new MeshStandardMaterial({ map: wallTexture(), roughness: 0.85, metalness: 0.05, color: 0xb8bcc6 });
  const metal = new MeshStandardMaterial({ color: 0x3a3e48, roughness: 0.45, metalness: 0.7 });
  const dark = new MeshStandardMaterial({ color: 0x1c1f26, roughness: 0.7, metalness: 0.3 });

  // The front wall with the window cut out of it, the tunnel through the hull and a heavy bezel.
  const front = new Shape();
  front.moveTo(-SIDE_X, FLOOR_Y);
  front.lineTo(SIDE_X, FLOOR_Y);
  front.lineTo(SIDE_X, CEILING_Y);
  front.lineTo(-SIDE_X, CEILING_Y);
  front.lineTo(-SIDE_X, FLOOR_Y);
  front.holes.push(roundedRect(new Path(), WINDOW_WIDTH, WINDOW_HEIGHT, WINDOW_CORNER, 0, WINDOW_Y));
  const frontWall = new Mesh(tileUvs(new ShapeGeometry(front, 16)), padding);
  frontWall.position.z = WALL_Z;
  const bezelShape = roundedRect(new Shape(), WINDOW_WIDTH + 0.16, WINDOW_HEIGHT + 0.16, WINDOW_CORNER + 0.07, 0, WINDOW_Y) as Shape;
  bezelShape.holes.push(roundedRect(new Path(), WINDOW_WIDTH, WINDOW_HEIGHT, WINDOW_CORNER, 0, WINDOW_Y));
  const bezel = new Mesh(new ExtrudeGeometry(bezelShape, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 16 }), metal);
  bezel.position.z = WALL_Z;
  const tunnelShape = roundedRect(new Shape(), WINDOW_WIDTH + 0.03, WINDOW_HEIGHT + 0.03, WINDOW_CORNER + 0.015, 0, WINDOW_Y) as Shape;
  tunnelShape.holes.push(roundedRect(new Path(), WINDOW_WIDTH, WINDOW_HEIGHT, WINDOW_CORNER, 0, WINDOW_Y));
  const tunnel = new Mesh(new ExtrudeGeometry(tunnelShape, { depth: WINDOW_DEPTH, bevelEnabled: false, curveSegments: 16 }), dark);
  tunnel.position.z = WALL_Z - WINDOW_DEPTH;
  root.add(frontWall, bezel, tunnel);
  // Bolts round the bezel.
  const boltGeometry = new CylinderGeometry(0.012, 0.012, 0.012, 8).rotateX(Math.PI / 2);
  for (let i = 0; i < 14; i += 1) {
    const angle = (i / 14) * Math.PI * 2;
    const bolt = new Mesh(boltGeometry, metal);
    bolt.position.set(Math.sin(angle) * (WINDOW_WIDTH / 2 + 0.05) * 1.08, WINDOW_Y + Math.cos(angle) * (WINDOW_HEIGHT / 2 + 0.05), WALL_Z + 0.05);
    root.add(bolt);
  }
  // The glass, recessed: faint dust and a smear that only show when light catches them.
  const glass = new MeshBasicMaterial({ map: glassTexture(), transparent: true, opacity: 0.05, blending: AdditiveBlending, depthWrite: false, color: 0xffffff });
  const pane = new Mesh(new PlaneGeometry(WINDOW_WIDTH, WINDOW_HEIGHT), glass);
  pane.position.set(0, WINDOW_Y, WALL_Z - WINDOW_DEPTH + 0.02);
  root.add(pane);

  // The rest of the capsule: side walls, ceiling, floor and the back wall behind the seat.
  const depth = BACK_Z - WALL_Z;
  const height = CEILING_Y - FLOOR_Y;
  const left = wall(depth, height, padding);
  left.rotation.y = Math.PI / 2;
  left.position.set(-SIDE_X, (CEILING_Y + FLOOR_Y) / 2, (BACK_Z + WALL_Z) / 2);
  const right = wall(depth, height, padding);
  right.rotation.y = -Math.PI / 2;
  right.position.set(SIDE_X, (CEILING_Y + FLOOR_Y) / 2, (BACK_Z + WALL_Z) / 2);
  const ceiling = wall(SIDE_X * 2, depth, padding);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, CEILING_Y, (BACK_Z + WALL_Z) / 2);
  const floor = wall(SIDE_X * 2, depth, padding);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, FLOOR_Y, (BACK_Z + WALL_Z) / 2);
  const back = wall(SIDE_X * 2, height, padding);
  back.rotation.y = Math.PI;
  back.position.set(0, (CEILING_Y + FLOOR_Y) / 2, BACK_Z);
  root.add(left, right, ceiling, floor, back);

  // The console under the window, sloped up toward the eye.
  const desk = new Group();
  desk.position.set(0, -0.44, -0.47);
  desk.rotation.x = 0.62;
  desk.add(new Mesh(new BoxGeometry(1.2, 0.03, 0.34), dark));
  const screenCanvas = document.createElement("canvas");
  screenCanvas.width = 256;
  screenCanvas.height = 160;
  const screenContext = screenCanvas.getContext("2d");
  const screenTexture = new CanvasTexture(screenCanvas);
  screenTexture.colorSpace = SRGBColorSpace;
  const screenMaterial = new MeshBasicMaterial({ map: screenTexture, color: 0xffffff });
  const screen = new Mesh(new PlaneGeometry(0.24, 0.15), screenMaterial);
  screen.rotation.x = -Math.PI / 2;
  screen.position.set(0, 0.02, 0.01);
  const screenBezel = new Mesh(new BoxGeometry(0.27, 0.012, 0.18), metal);
  screenBezel.position.set(0, 0.012, 0.01);
  desk.add(screenBezel, screen);
  // Rows of small lit buttons and switches either side of the screen, and on the overhead panel.
  const buttonGeometry = new BoxGeometry(0.022, 0.012, 0.016);
  const buttons: { mesh: Mesh; material: MeshStandardMaterial; blink: number }[] = [];
  const palette = [0x5dff9a, 0xffb547, 0xe8f4ff, 0x5dff9a, 0x7fe9ff];
  const addButton = (parent: Group, x: number, y: number, z: number) => {
    const color = palette[Math.floor(random() * palette.length)]!;
    const material = new MeshStandardMaterial({ color: 0x222222, emissive: color, emissiveIntensity: 1, roughness: 0.4 });
    const mesh = new Mesh(buttonGeometry, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    buttons.push({ mesh, material, blink: random() < 0.25 ? 2 + random() * 5 : 0 });
  };
  for (let i = 0; i < BUTTON_COUNT / 2; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const column = Math.floor(i / 2) % 6;
    const row = Math.floor(i / 12);
    addButton(desk, side * (0.2 + column * 0.055), 0.02, -0.08 + row * 0.07);
  }
  root.add(desk);

  // Overhead panel: switches, a guarded release lever and the master-alarm lamp.
  const overhead = new Group();
  overhead.position.set(0, 0.47, -0.5);
  overhead.rotation.x = 0.75;
  overhead.add(new Mesh(new BoxGeometry(1.0, 0.03, 0.3), dark));
  for (let i = 0; i < BUTTON_COUNT / 2; i += 1) addButton(overhead, -0.4 + (i % 12) * 0.07, -0.02, -0.06 + Math.floor(i / 12) * 0.08);
  const alarmLamp = new MeshStandardMaterial({ color: 0x330000, emissive: 0xff2a1a, emissiveIntensity: 0, roughness: 0.3 });
  const lamp = new Mesh(new BoxGeometry(0.1, 0.02, 0.05), alarmLamp);
  lamp.position.set(0, -0.025, 0.1);
  const lever = new Mesh(new BoxGeometry(0.05, 0.02, 0.12), new MeshStandardMaterial({ color: 0xd8a022, roughness: 0.5 }));
  lever.position.set(0.3, -0.03, 0.08);
  overhead.add(lamp, lever);
  root.add(overhead);

  // The astronaut's own forearms and gloves, braced on the console's near edge: seen whenever they look down.
  const suit = FINISH.suit();
  const glove = FINISH.orange();
  for (const side of [-1, 1]) {
    const hand = new Vector3(side * 0.19, -0.5, -0.37);
    const elbow = new Vector3(side * 0.28, -0.66, -0.02);
    const along = hand.clone().sub(elbow).normalize();
    const sleeve = new Mesh(new CapsuleGeometry(0.06, hand.distanceTo(elbow) - 0.08, 6, 12), suit);
    sleeve.position.copy(elbow).lerp(hand, 0.45);
    sleeve.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), along);
    const cuff = new Mesh(new CylinderGeometry(0.072, 0.072, 0.04, 16), glove);
    cuff.position.copy(hand).addScaledVector(along, -0.08);
    cuff.quaternion.copy(sleeve.quaternion);
    const palm = box(0.11, 0.06, 0.12, glove, hand.x, hand.y, hand.z, 0.025);
    palm.rotation.set(0.62, side * 0.15, 0);
    const thumb = new Mesh(new CapsuleGeometry(0.02, 0.04, 4, 8), glove);
    thumb.position.set(hand.x - side * 0.065, hand.y - 0.01, hand.z + 0.02);
    thumb.rotation.set(0.9, 0, side * 0.6);
    root.add(sleeve, cuff, palm, thumb);
  }

  // A grab handle and a bundle of cables along the left wall, a strap on the right.
  const handle = new Mesh(new TubeGeometry(new CatmullRomCurve3([new Vector3(-0.66, 0.2, -0.45), new Vector3(-0.6, 0.2, -0.38), new Vector3(-0.6, 0.2, -0.1), new Vector3(-0.66, 0.2, -0.03)]), 16, 0.012, 6), metal);
  const cables = new Mesh(new TubeGeometry(new CatmullRomCurve3([new Vector3(-0.68, -0.9, 0.3), new Vector3(-0.66, -0.4, -0.2), new Vector3(-0.64, 0.3, -0.5), new Vector3(-0.5, 0.6, -0.58)]), 24, 0.02, 6), dark);
  const strap = new Mesh(new BoxGeometry(0.01, 0.6, 0.05), new MeshStandardMaterial({ color: 0x3b4a6a, roughness: 0.9 }));
  strap.position.set(0.68, -0.2, -0.2);
  strap.rotation.x = 0.3;
  root.add(handle, cables, strap);
  // A soft white strip light along the ceiling.
  const stripMaterial = new MeshStandardMaterial({ color: 0x222222, emissive: 0xfff0dc, emissiveIntensity: 1 });
  const strip = new Mesh(new BoxGeometry(0.5, 0.01, 0.04), stripMaterial);
  strip.position.set(0, CEILING_Y - 0.006, 0.05);
  root.add(strip);

  const lampLight = new PointLight(0xffe2c4, 1.1, 2.6, 2);
  lampLight.position.set(0, 0.5, 0.1);
  const alarmLight = new PointLight(0xff2a1a, 0, 3, 2);
  alarmLight.position.set(0, 0.42, -0.35);
  const spillLight = new PointLight(0xffffff, 0, 3.2, 1.5);
  spillLight.position.set(0, WINDOW_Y, WALL_Z - 0.3);
  root.add(lampLight, alarmLight, spillLight);

  let drawn = "";
  return {
    root,
    update({ time, power, alarm, spill, spillStrength, screen: shown, altitude }) {
      const blink = Math.floor(time * 2.6) % 2 === 0;
      const key = `${shown}|${altitude.toFixed(1)}|${blink}`;
      if (screenContext && key !== drawn) {
        drawn = key;
        drawScreen(screenContext, shown, altitude, blink);
        screenTexture.needsUpdate = true;
      }
      // A dying screen flickers before it goes.
      screenMaterial.color.setScalar(shown === "dead" ? 0 : Math.max(0.15, power));
      for (const button of buttons) {
        const on = button.blink === 0 || Math.sin(time * button.blink) > -0.3;
        button.material.emissiveIntensity = on ? power * 1.1 : power * 0.1;
      }
      stripMaterial.emissiveIntensity = power * 1.4;
      lampLight.intensity = power * 1.1;
      alarmLamp.emissiveIntensity = alarm * 4;
      alarmLight.intensity = alarm * 2.6;
      spillLight.color.copy(spill);
      spillLight.intensity = spillStrength;
      // The glass shows its dust only when light catches it from the cabin or outside.
      glass.opacity = 0.03 + alarm * 0.05 + Math.min(0.12, spillStrength * 0.03);
      glass.color.setRGB(1, 1 - alarm * 0.6, 1 - alarm * 0.7);
    },
  };
}
