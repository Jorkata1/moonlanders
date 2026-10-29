import { CatmullRomCurve3, Vector3, type Object3D } from "three";
import type { SpaceSet } from "./view/spaceSet";

export interface CameraShot {
  position: Vector3;
  target: Vector3;
}

/** What a prop is, which decides when it appears: crash debris at once, the kit after the astronaut is up. */
export type DropKind = "dome" | "station" | "decor" | "cable" | "pad" | "debris";

export interface DropProp {
  readonly object: Object3D;
  readonly kind: DropKind;
}

/** Story beats the game answers with sound, shaking and vibration. */
export type IntroBeat = "spark" | "blast" | "eject" | "impact" | "wake";

export interface IntroOptions {
  readonly space: SpaceSet;
  /** The emergency kit that unfolds around the pod. */
  readonly props: readonly DropProp[];
  /** Where the astronaut lies after the crash, on the ground. */
  readonly hero: Vector3;
  /** Centre of the base (the dome), on the ground. */
  readonly base: Vector3;
  /** The crashed rocket beyond the ridge, on the ground. */
  readonly crash: Vector3;
  /** The normal gameplay camera the intro hands over to. */
  readonly gameplayShot: CameraShot;
  readonly captions: readonly string[];
  /** Pull the cinematic shots back by this factor (narrow portrait screens need more distance). */
  readonly distanceScale: number;
}

export interface IntroFrame {
  readonly shot: CameraShot;
  /** Which scene the shot looks at: the orbit set, or the world. */
  readonly where: "space" | "ground";
}

export interface Intro {
  /** Advance the intro; returns the shot, or null once it has finished. */
  update(dt: number): IntroFrame | null;
  caption(): string | null;
  /** 0 lying flat, 1 standing; null while the astronaut is not in the shot. */
  heroRise(): number | null;
  /** How far the eyes are open (0 black, 1 clear) and how blurred the view is, in pixels. */
  eyes(): { open: number; blur: number };
  onBeat(handler: (beat: IntroBeat) => void): void;
  skip(): void;
  done(): boolean;
}

/** Timeline, in seconds. */
const T = {
  spark: 1.2,
  blast: 3.0,
  eject: 4.6,
  close: 7.6,
  ground: 8.6,
  wake: 9.2,
  rise: 11.0,
  stood: 12.2,
  crane: 11.4,
  reveal: 13.8,
  end: 16,
} as const;
const CAPTION_TIMES = [0.4, T.eject, 10.6] as const;
const CAPTION_GAP = [T.close - 0.4, 10.6] as const;
const UNFOLD: Readonly<Record<DropKind, number>> = { debris: 0, dome: 13.0, station: 13.5, decor: 13.9, cable: 14.4, pad: 14.8 };
const STAGGER_SECONDS = 0.12;
const GROW_SECONDS = 0.55;
const BLUR_PX = 10;
const SHIP_START_ROTATION = new Vector3(0.9, 0.3, -0.5);
/** The pod is flung toward the camera side; the hull tumbles down toward the Moon. */
const POD_VELOCITY = new Vector3(1.1, -0.55, 1.3);

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

function ease(t: number): number {
  const k = clamp01(t);
  return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
}

function spring(t: number): number {
  const s = 1.6;
  const k = t - 1;
  return 1 + (s + 1) * k * k * k + s * k * k;
}

/** Orbit, blowout and escape, then waking up beside the pod while the base unfolds and the crash smoke rises. */
export function createIntro(options: IntroOptions): Intro {
  const { space } = options;
  let time = 0;
  let beatHandler: (beat: IntroBeat) => void = () => undefined;
  const fired = new Set<IntroBeat>();
  const shot: CameraShot = { position: new Vector3(), target: new Vector3() };
  const podRelease = new Vector3();
  const moonward = space.moonCenter.clone().normalize();
  const counts = new Map<DropKind, number>();
  const schedule = options.props.map((prop) => {
    const index = counts.get(prop.kind) ?? 0;
    counts.set(prop.kind, index + 1);
    return { prop, scale: prop.object.scale.clone(), at: UNFOLD[prop.kind] + index * STAGGER_SECONDS };
  });

  const scaled = (target: Vector3, offset: Vector3) => target.clone().add(offset.multiplyScalar(options.distanceScale));
  const hero = options.hero;
  const closeShot: CameraShot = { position: scaled(hero, new Vector3(2.0, 1.3, 3.4)), target: hero.clone().add(new Vector3(-0.5, 0.3, -0.5)) };
  // The crane rises straight up first so it clears the dome, then swings round to the crash smoke.
  const lift = closeShot.position.clone().add(new Vector3(0.5, 5, 1.5));
  const revealTarget = options.crash.clone().add(new Vector3(0, 6, 0));
  const revealShot: CameraShot = { position: scaled(options.base, new Vector3(-2, 11, 10)), target: revealTarget };
  const cranePosition = new CatmullRomCurve3([closeShot.position, lift, revealShot.position, options.gameplayShot.position], false, "centripetal");
  const craneTarget = new CatmullRomCurve3([closeShot.target, hero.clone().add(new Vector3(0, 1.5, -3)), revealTarget, options.gameplayShot.target], false, "centripetal");

  function beat(name: IntroBeat, at: number): void {
    if (time < at || fired.has(name)) return;
    fired.add(name);
    beatHandler(name);
  }

  function placeShip(): void {
    const { ship, pod } = space;
    const fall = Math.max(0, time - T.blast);
    ship.position.copy(moonward).multiplyScalar(0.35 * fall * fall).add(new Vector3(0, Math.sin(time * 0.8) * 0.05, 0));
    ship.rotation.set(SHIP_START_ROTATION.x + fall * 0.35, SHIP_START_ROTATION.y + fall * 0.2, SHIP_START_ROTATION.z - fall * 0.6);
    const spark = clamp01((time - T.spark) / (T.blast - T.spark));
    const blast = time >= T.blast ? Math.max(0, 1 - (time - T.blast) / 0.8) : 0;
    space.update(time, spark, blast, time >= T.blast, time - T.blast);
    if (time < T.eject) {
      pod.root.visible = false;
      podRelease.copy(ship.position).add(new Vector3(0, 1.5, 0));
      return;
    }
    const flight = time - T.eject;
    pod.root.visible = true;
    pod.root.position.copy(podRelease).addScaledVector(POD_VELOCITY, flight * (1 + flight * 0.15));
    pod.root.rotation.set(-0.5 + flight * 0.05, flight * 0.4, 0.5 - flight * 0.1);
    pod.flame.scale.set(1, 1 + Math.random() * 0.5, 1);
  }

  function spaceShot(): void {
    const { ship, pod } = space;
    if (time < T.eject) {
      // A slow push past the ship toward the Moon below.
      const k = ease(time / T.eject);
      shot.target.set(0, -2.2 + k * 2, -1).add(ship.position);
      shot.position.set(4.5 - k * 1.2, 4 - k * 1.2, 9.5 - k * 2).multiplyScalar(options.distanceScale).add(ship.position);
      return;
    }
    // Follow the pod; the burning hull falls away behind it.
    const k = ease((time - T.eject) / 1.2);
    const follow = pod.root.position.clone().add(new Vector3(3.4, 2.4, 7.5).multiplyScalar(options.distanceScale));
    const before = ship.position.clone().add(new Vector3(3.3, 2.8, 7.5).multiplyScalar(options.distanceScale));
    shot.position.lerpVectors(before, follow, k);
    shot.target.lerpVectors(ship.position, pod.root.position.clone().add(new Vector3(-1.2, -0.8, -2.5)), k);
  }

  function groundShot(): void {
    if (time < T.crane) {
      shot.position.copy(closeShot.position).add(new Vector3(0, (time - T.ground) * 0.06, 0));
      shot.target.copy(closeShot.target).add(new Vector3(0, clamp01((time - T.rise) / (T.stood - T.rise)) * 0.8, 0));
      return;
    }
    const u = ease((time - T.crane) / (T.end - T.crane));
    cranePosition.getPoint(u, shot.position);
    craneTarget.getPoint(u, shot.target);
  }

  function placeProps(): void {
    for (const item of schedule) {
      const k = clamp01((time - item.at) / GROW_SECONDS);
      item.prop.object.visible = time >= T.ground && k > 0;
      item.prop.object.scale.copy(item.scale).multiplyScalar(Math.max(0.001, k >= 1 ? 1 : spring(k)));
    }
  }

  function finish(): void {
    time = T.end;
    for (const item of schedule) {
      item.prop.object.visible = true;
      item.prop.object.scale.copy(item.scale);
    }
    shot.position.copy(options.gameplayShot.position);
    shot.target.copy(options.gameplayShot.target);
  }

  placeProps();

  return {
    update(dt) {
      if (time >= T.end) return null;
      time += dt;
      beat("spark", T.spark);
      beat("blast", T.blast);
      beat("eject", T.eject);
      beat("impact", T.ground - 0.3);
      beat("wake", T.wake);
      placeProps();
      if (time >= T.end) {
        finish();
        return { shot, where: "ground" };
      }
      if (time < T.ground) {
        placeShip();
        spaceShot();
        return { shot, where: "space" };
      }
      groundShot();
      return { shot, where: "ground" };
    },
    caption() {
      if (time >= T.end - 0.6) return null;
      if (time >= CAPTION_GAP[0] && time < CAPTION_GAP[1]) return null;
      let current: string | null = null;
      options.captions.forEach((caption, index) => {
        if (time >= (CAPTION_TIMES[Math.min(index, CAPTION_TIMES.length - 1)] as number)) current = caption;
      });
      return current;
    },
    heroRise() {
      if (time < T.ground) return null;
      return ease((time - T.rise) / (T.stood - T.rise));
    },
    eyes() {
      if (time < T.close) return { open: 1, blur: 0 };
      if (time < T.wake) return { open: Math.max(0, 1 - (time - T.close) / (T.ground - T.close)), blur: BLUR_PX };
      // Two slow blinks open the eyes; the view sharpens as they wake.
      const w = time - T.wake;
      const open = w < 0.5 ? (w / 0.5) * 0.55 : w < 0.75 ? 0.55 - ((w - 0.5) / 0.25) * 0.4 : Math.min(1, 0.15 + ((w - 0.75) / 0.8) * 0.85);
      return { open, blur: BLUR_PX * (1 - clamp01(w / 1.8)) };
    },
    onBeat(handler) {
      beatHandler = handler;
    },
    skip() {
      if (time < T.end) finish();
    },
    done: () => time >= T.end,
  };
}
