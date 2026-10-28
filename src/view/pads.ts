import { AdditiveBlending, BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, type Material } from "three";
import { PADS } from "../config";
import { bakeStatic } from "./bake";
import { hologram, type HologramIcon } from "./holograms";
import { createLabel, type Label } from "./labels";
import { LOOK, glow, surface } from "./materials";

const LED_COUNT = 12;
const HOLOGRAM_HEIGHT = 1.0;
const PRICE_BOARD_WIDTH = 2.5;
const HOLOGRAM_SCALE = 1.55;

export type PadStyle = "pay" | "sell" | "input" | "output" | "rocket" | "workshop";

const STYLES: Record<PadStyle, { icon: HologramIcon; color: number }> = {
  pay: { icon: "coin", color: 0xffd25a },
  sell: { icon: "coin", color: 0x5df2a0 },
  input: { icon: "in", color: 0xff9a4a },
  output: { icon: "out", color: 0x5df2a0 },
  rocket: { icon: "rocket", color: 0x4de3ff },
  workshop: { icon: "wrench", color: 0x4de3ff },
};

export interface PadView {
  readonly root: Group;
  readonly label: Label;
  /** 0..1 of the rim lights lit (payment progress). Pads without progress leave it alone. */
  setProgress(ratio: number): void;
  /** Lights chase round the rim and the hologram brightens while the player stands on it. */
  setActive(active: boolean, time: number): void;
}

const ledGeometry = new BoxGeometry(0.16, 0.05, 0.08);
const ledOff = surface({ color: 0x1b2030, roughness: 0.5, metalness: 0.3 });

interface Shared {
  lit: Material;
  glass: Material;
  beam: MeshBasicMaterial;
}

const shared = new Map<number, Shared>();

function materialsFor(color: number): Shared {
  const cached = shared.get(color);
  if (cached) return cached;
  const created: Shared = {
    lit: glow(color, 2.6),
    glass: surface({ color: 0x0b1020, emissive: color, emissiveIntensity: 0.18, roughness: 0.2, metalness: 0.3, reflective: true, envMapIntensity: 0.6 }),
    beam: new MeshBasicMaterial({ color, transparent: true, opacity: 0.1, blending: AdditiveBlending, depthWrite: false }),
  };
  shared.set(color, created);
  return created;
}

/** Hexagonal metal plate with a glass inlay; merged into a few draw calls. */
function platform(radius: number, glass: Material): Group {
  const base = new Group();
  base.add(new Mesh(new CylinderGeometry(radius, radius * 1.08, 0.14, 6), LOOK.dark()).translateY(0.07));
  base.add(new Mesh(new CylinderGeometry(radius * 0.97, radius * 0.97, 0.04, 6), LOOK.steel()).translateY(0.15));
  base.add(new Mesh(new CylinderGeometry(radius * 0.8, radius * 0.8, 0.03, 6), glass).translateY(0.175));
  // Corner bolts.
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    base.add(new Mesh(new CylinderGeometry(0.05, 0.05, 0.03, 8), LOOK.steel()).translateX(Math.sin(angle) * radius * 0.9).translateY(0.18).translateZ(Math.cos(angle) * radius * 0.9));
  }
  for (const piece of base.children) piece.receiveShadow = true;
  bakeStatic(base);
  return base;
}

/**
 * A pad the player walks onto. `icon` overrides the style's hologram (e.g. a robot for a robot
 * pad), and `withProgress` marks pay pads, whose rim lights fill up as credits flow in.
 */
export function createPad(style: PadStyle, radius: number = PADS.radius, labelHeight = 1.6, withProgress = false, icon?: HologramIcon): PadView {
  const root = new Group();
  const look = STYLES[style];
  const materials = materialsFor(look.color);
  root.add(platform(radius, materials.glass));

  const leds: Mesh[] = [];
  const ring = new Group();
  ring.userData.dynamic = true;
  for (let i = 0; i < LED_COUNT; i += 1) {
    const angle = (i / LED_COUNT) * Math.PI * 2;
    const led = new Mesh(ledGeometry, withProgress ? ledOff : materials.lit);
    led.position.set(Math.sin(angle) * radius * 0.885, 0.19, Math.cos(angle) * radius * 0.885);
    led.rotation.y = angle;
    leds.push(led);
    ring.add(led);
  }
  root.add(ring);

  const holo = new Group();
  holo.userData.dynamic = true;
  holo.position.y = HOLOGRAM_HEIGHT;
  const icon3d = hologram(icon ?? look.icon, look.color);
  icon3d.scale.setScalar(HOLOGRAM_SCALE);
  holo.add(icon3d);
  const beam = new Mesh(new CylinderGeometry(0.22, radius * 0.55, HOLOGRAM_HEIGHT - 0.2, 18, 1, true), materials.beam);
  beam.position.y = 0.2 + (HOLOGRAM_HEIGHT - 0.2) / 2;
  beam.userData.dynamic = true;
  root.add(holo, beam);

  const label = createLabel(PRICE_BOARD_WIDTH);
  label.sprite.position.y = labelHeight;
  root.add(label.sprite);

  let litCount = withProgress ? 0 : LED_COUNT;
  return {
    root,
    label,
    setProgress(ratio) {
      if (!withProgress) return;
      const next = Math.round(Math.min(1, Math.max(0, ratio)) * LED_COUNT);
      if (next === litCount) return;
      litCount = next;
      leds.forEach((led, i) => (led.material = i < litCount ? materials.lit : ledOff));
    },
    setActive(active, time) {
      holo.rotation.y = time * (active ? 2.6 : 1.1);
      holo.position.y = HOLOGRAM_HEIGHT + Math.sin(time * 2.2) * 0.06;
      holo.scale.setScalar(active ? 1.2 : 1);
      materials.beam.opacity = active ? 0.2 : 0.1;
      if (withProgress) return;
      // A dark gap chases round the rim while someone stands on the pad.
      const gap = active ? Math.floor(time * 14) % LED_COUNT : -1;
      leds.forEach((led, i) => (led.material = i === gap || i === (gap + 1) % LED_COUNT ? ledOff : materials.lit));
    },
  };
}
