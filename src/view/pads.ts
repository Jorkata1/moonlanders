import { AdditiveBlending, CircleGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, RingGeometry } from "three";
import { PADS } from "../config";
import { createLabel, iconDecal, type Label } from "./labels";

const PAD_Y = 0.05;

export type PadStyle = "pay" | "sell" | "input" | "output" | "rocket" | "workshop";

const STYLES: Record<PadStyle, { icon: string; ring: string; fill: string; glow: number }> = {
  pay: { icon: "$", ring: "#ffd25a", fill: "rgba(40, 32, 8, 0.85)", glow: 0xffd25a },
  sell: { icon: "$", ring: "#5df2a0", fill: "rgba(8, 40, 26, 0.85)", glow: 0x5df2a0 },
  input: { icon: "IN", ring: "#ff9a4a", fill: "rgba(44, 20, 6, 0.85)", glow: 0xff9a4a },
  output: { icon: "OUT", ring: "#5df2a0", fill: "rgba(8, 40, 26, 0.85)", glow: 0x5df2a0 },
  rocket: { icon: "▲", ring: "#4de3ff", fill: "rgba(6, 30, 44, 0.85)", glow: 0x4de3ff },
  workshop: { icon: "⚙", ring: "#4de3ff", fill: "rgba(6, 30, 44, 0.85)", glow: 0x4de3ff },
};

export interface PadView {
  readonly root: Group;
  readonly label: Label;
  /** 0..1 fill of the outer ring (payment progress). */
  setProgress(ratio: number): void;
  /** Pulse while the player stands on it. */
  setActive(active: boolean, time: number): void;
}

export function createPad(style: PadStyle, radius: number = PADS.radius, labelHeight = 1.6, beam = false): PadView {
  const root = new Group();
  const look = STYLES[style];
  const decal = iconDecal(look.icon, look.ring, look.fill);
  // Polygon offset keeps the decal on top of the ground instead of flickering into it.
  const discMaterial = new MeshStandardMaterial({ map: decal, emissiveMap: decal, emissive: 0xffffff, emissiveIntensity: 0.55, transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const disc = new Mesh(new CircleGeometry(radius, 48), discMaterial);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = PAD_Y;
  disc.receiveShadow = true;
  root.add(disc);

  const progressMaterial = new MeshBasicMaterial({ color: look.glow, transparent: true, opacity: 0.95, depthWrite: false });
  const progress = new Mesh(new RingGeometry(radius + 0.04, radius + 0.2, 64, 1, Math.PI / 2, 0.0001), progressMaterial);
  progress.rotation.x = -Math.PI / 2;
  progress.position.y = PAD_Y + 0.01;
  root.add(progress);

  let beamMesh: Mesh | null = null;
  if (beam) {
    const beamMaterial = new MeshBasicMaterial({ color: look.glow, transparent: true, opacity: 0.12, blending: AdditiveBlending, depthWrite: false });
    beamMesh = new Mesh(new CylinderGeometry(radius * 0.9, radius, 2.4, 32, 1, true), beamMaterial);
    beamMesh.position.y = 1.2;
    root.add(beamMesh);
  }

  const label = createLabel();
  label.sprite.position.y = labelHeight;
  root.add(label.sprite);

  let lastRatio = -1;
  return {
    root,
    label,
    setProgress(ratio) {
      const clamped = Math.min(1, Math.max(0, ratio));
      if (Math.abs(clamped - lastRatio) < 0.004) return;
      lastRatio = clamped;
      progress.geometry.dispose();
      progress.geometry = new RingGeometry(radius + 0.04, radius + 0.2, 64, 1, Math.PI / 2, Math.max(0.0001, clamped * Math.PI * 2));
    },
    setActive(active, time) {
      discMaterial.emissiveIntensity = active ? 0.9 + Math.sin(time * 10) * 0.25 : 0.55;
      if (beamMesh) {
        (beamMesh.material as MeshBasicMaterial).opacity = 0.08 + Math.sin(time * 2.5) * 0.04 + (active ? 0.1 : 0);
        beamMesh.rotation.y = time * 0.5;
      }
    },
  };
}
