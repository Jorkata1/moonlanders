import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, type MeshBasicMaterial } from 'three';
import type { Vec2 } from '../config/planets/types';
import { HAZARD_YELLOW, ROCKET_RED, STEEL_DARK, STEEL_MID, glow, surface, uniqueGlow } from './materials';

const ROCKET_HEIGHT = 4.2;

/** Rocket on its launch pad. Shows load progress and runs the launch animation. */
export class RocketMesh {
  readonly root = new Group();
  private readonly ship = new Group();
  private readonly flame: Mesh;
  private readonly flameMaterial: MeshBasicMaterial;
  private readonly gauge: Mesh;
  private readonly readyLight: MeshBasicMaterial;

  constructor(position: Vec2, accent: number) {
    const hull = surface(ROCKET_RED);
    const pad = new Mesh(new CylinderGeometry(1.9, 2.1, 0.3, 10), surface(STEEL_DARK));
    pad.position.y = 0.15;
    pad.receiveShadow = true;

    const body = new Mesh(new CylinderGeometry(0.75, 0.85, ROCKET_HEIGHT * 0.62, 12), hull);
    body.position.y = 1.2 + ROCKET_HEIGHT * 0.31;
    const nose = new Mesh(new ConeGeometry(0.75, ROCKET_HEIGHT * 0.32, 12), surface(accent));
    nose.position.y = 1.2 + ROCKET_HEIGHT * 0.62 + ROCKET_HEIGHT * 0.16;
    const band = new Mesh(new CylinderGeometry(0.78, 0.78, 0.22, 12), surface(accent));
    band.position.y = 1.55;
    const window = new Mesh(new SphereGeometry(0.24, 10, 8), glow(0x7dd3fc));
    window.position.set(0, 3.0, 0.68);
    window.scale.z = 0.4;
    const engine = new Mesh(new CylinderGeometry(0.45, 0.65, 0.5, 10), surface(STEEL_MID));
    engine.position.y = 0.95;

    this.ship.add(body, nose, band, window, engine);
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const fin = new Mesh(new BoxGeometry(0.12, 1.0, 0.7), surface(accent));
      fin.position.set(Math.sin(angle) * 0.85, 1.45, Math.cos(angle) * 0.85);
      fin.rotation.y = angle;
      this.ship.add(fin);
    }

    this.flameMaterial = uniqueGlow(0xffa53a, 0.9);
    this.flame = new Mesh(new ConeGeometry(0.5, 1.8, 10), this.flameMaterial);
    this.flame.rotation.x = Math.PI;
    this.flame.position.y = -0.1;
    this.flame.visible = false;
    this.ship.add(this.flame);

    // Vertical gauge on the gantry fills as the rocket is loaded.
    const gantry = new Mesh(new BoxGeometry(0.3, 4.6, 0.3), surface(HAZARD_YELLOW));
    gantry.position.set(-1.55, 2.45, -0.6);
    const gaugeBack = new Mesh(new BoxGeometry(0.34, 3.6, 0.1), surface(STEEL_DARK));
    gaugeBack.position.set(-1.55, 2.3, -0.4);
    this.gauge = new Mesh(new BoxGeometry(0.22, 3.4, 0.12), glow(0x4ade80));
    this.gauge.geometry.translate(0, 1.7, 0);
    this.gauge.position.set(-1.55, 0.6, -0.36);
    this.readyLight = uniqueGlow(0x64748b, 1);
    const beacon = new Mesh(new SphereGeometry(0.2, 8, 6), this.readyLight);
    beacon.position.set(-1.55, 4.9, -0.6);

    this.root.add(pad, this.ship, gantry, gaugeBack, this.gauge, beacon);
    this.root.traverse((child) => {
      if (child instanceof Mesh && child !== this.flame) child.castShadow = true;
    });
    this.root.position.set(position.x, 0, position.z);
  }

  /** World-space Y of the ship's base, used for camera tracking during launch. */
  get shipAltitude(): number {
    return this.ship.position.y;
  }

  update(time: number, loadProgress: number, isReady: boolean): void {
    this.gauge.scale.y = Math.max(0.001, loadProgress);
    this.readyLight.color.setHex(isReady ? (Math.sin(time * 6) > 0 ? 0x4ade80 : 0x166534) : 0x64748b);
  }

  /** `t` in [0, 1] across the launch sequence. */
  updateLaunch(time: number, t: number): void {
    this.flame.visible = true;
    const flicker = 0.85 + Math.sin(time * 40) * 0.15;
    this.flame.scale.set(flicker, 0.8 + t * 1.6, flicker);
    this.flameMaterial.opacity = 0.75 + Math.sin(time * 33) * 0.2;
    const ignitionHold = 0.18;
    const climb = Math.max(0, t - ignitionHold) / (1 - ignitionHold);
    this.ship.position.y = climb * climb * 40;
    this.ship.position.x = Math.sin(time * 30) * 0.03 * (1 - climb);
  }

  resetLaunch(): void {
    this.flame.visible = false;
    this.ship.position.set(0, 0, 0);
  }
}
