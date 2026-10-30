import { CatmullRomCurve3, Object3D, Quaternion, Vector3 } from "three";
import { eyesOf, LYING, wakePose, WAKE_SECONDS, type HeroPose } from "./introPose";
import type { SpaceSet } from "./view/spaceSet";

export interface CameraShot {
  position: Vector3;
  target: Vector3;
}

/** What a prop is, which decides when it appears: crash debris and the dome are already standing; the rest of the kit unfolds once the astronaut is up. */
export type DropKind = "dome" | "station" | "decor" | "cable" | "pad" | "debris";

export interface DropProp {
  readonly object: Object3D;
  readonly kind: DropKind;
}

/** Story beats the game answers with sound, shaking and vibration. */
export type IntroBeat = "cruise" | "warn" | "alarm" | "blast" | "eject" | "ignite" | "impact" | "heartbeat" | "breath" | "wake";

export interface IntroOptions {
  readonly space: SpaceSet;
  /** Which way the rocket cruises in orbit (the space set's dust is laid along it). */
  readonly travel: Vector3;
  /** The emergency kit that unfolds around the pod. */
  readonly props: readonly DropProp[];
  /** Where the astronaut lies after the crash, on the ground. */
  readonly hero: Vector3;
  /** The escape pod on the ground. */
  readonly pod: Vector3;
  /** Earth in the sky over the base, which the waking astronaut looks up at. */
  readonly skyMark: Vector3;
  /** The normal gameplay camera the intro hands over to. */
  readonly gameplayShot: CameraShot;
  readonly gameplayFov: number;
  readonly captions: readonly string[];
  /** Pull the cinematic shots back by this factor (narrow portrait screens need more distance). */
  readonly distanceScale: number;
}

export interface IntroFrame {
  readonly shot: CameraShot;
  /** Which scene the shot looks at: the orbit set, or the world. */
  readonly where: "space" | "ground";
  /** Lens, as a vertical field of view in degrees. */
  readonly fov: number;
  /** Camera roll in radians (a dazed, tilted head in first person). */
  readonly roll: number;
  /** Exposure relative to the base's: low in hard sunlight on white hulls and through the gold visor. */
  readonly exposure: number;
  /** The camera's up direction, when it is not the world's (a head lying on its side). */
  readonly up: Vector3 | null;
  /** Bloom threshold: high keeps sunlit white hulls from glowing, the base's normal value is 0.95. */
  readonly glare: number;
  /** How far to widen the lens on narrow screens so the subject stays in frame: 1 for cinematic shots, 0 for the gameplay camera. */
  readonly widen: number;
}

export interface Intro {
  /** Advance the intro; returns the shot, or null once it has finished. */
  update(dt: number): IntroFrame | null;
  caption(): string | null;
  /** How the astronaut lies, gets up and turns; null while they are not in the shot. */
  heroPose(): { pose: HeroPose; faceYaw: number; turn: number; shuffle: number } | null;
  /** Breath fogging the inside of the visor, 0..1. */
  visorFog(): number;
  /** How far the eyes are open (0 black, 1 clear) and how blurred the view is, in pixels. */
  eyes(): { open: number; blur: number };
  /** Full-screen fades: `black` to and from black, `white` for the blast's flash. */
  fade(): { black: number; white: number };
  /** The red master-alarm pulse around the screen edges, 0..1. */
  alarm(): number;
  /** Whether the view is through the astronaut's helmet visor. */
  visor(): boolean;
  /** Whether the pod should still be smoking. */
  podSmoking(): boolean;
  onBeat(handler: (beat: IntroBeat) => void): void;
  /** Jump to a moment (story seconds) and play on until `until`, then hold that frame. For reviewing single cuts. */
  seek(at: number, until: number): void;
  /** Current story time, in seconds. */
  storyTime(): number;
  skip(): void;
  done(): boolean;
}

export interface IntroCut {
  readonly name: string;
  /** Story seconds; each cut starts a beat early so it lands on its first sound. */
  readonly from: number;
  readonly to: number;
}

/** Timeline, in seconds of story time (the blast plays in slow motion, so it runs longer on screen). */
const T = {
  fadeIn: 1.4,
  warn: 5.0,
  alarm: 5.9,
  blast: 6.8,
  eject: 7.12,
  ignite: 7.7,
  slowEnd: 7.95,
  wide: 8.3,
  chase: 10.8,
  fadeOut: 12.4,
  ground: 13.0,
  impact: 13.2,
  heartbeat: 13.5,
  eyes: 13.9,
  gazeUp: 15.4,
  gazeSky: 16.6,
  blinkCut: 17.6,
  crane: 22.4,
  end: 28.0,
} as const;
/** The intro's shots and story beats, in order, for review one at a time. */
export const INTRO_CUTS: readonly IntroCut[] = [
  { name: "Orbit", from: 0, to: T.warn },
  { name: "Drive fails", from: T.warn - 0.3, to: T.blast - 0.05 },
  { name: "Blast", from: T.blast - 0.5, to: T.wide },
  { name: "Pod away", from: T.wide, to: T.chase },
  { name: "Chase", from: T.chase, to: T.ground },
  { name: "Black + visor", from: T.ground, to: T.blinkCut - 0.06 },
  { name: "Wake up", from: T.blinkCut - 0.3, to: T.crane + 0.4 },
  { name: "To the game", from: T.crane, to: T.end - 0.01 },
];
/** When each story beat sounds. */
const BEAT_TIMES: readonly (readonly [IntroBeat, number])[] = [
  ["cruise", 0],
  ["warn", T.warn],
  ["alarm", T.alarm],
  ["blast", T.blast],
  ["eject", T.eject],
  ["ignite", T.ignite],
  ["impact", T.impact],
  ["heartbeat", T.heartbeat],
  ["breath", T.eyes + 0.1],
  ["wake", T.blinkCut],
];
const SEEK_STEP = 1 / 30;
const SLOW_MOTION = 0.35;
/** Exposure, relative to the base's, in orbit, through the visor and on the white pod right after. */
const SPACE_EXPOSURE = 0.7;
const VISOR_EXPOSURE = 0.62;
const WAKE_EXPOSURE = 0.8;
/** Bloom thresholds: in the intro only real light sources glow; the base's own look takes over at the end. */
const INTRO_GLARE = 2.4;
/** In orbit the blast and the engine flames should still bloom, the sunlit hull should not; once the fireball is gone, even less. */
const SPACE_GLARE = 1.15;
const SPACE_GLARE_AFTER = 1.8;
const BASE_GLARE = 0.95;
const CAPTIONS: readonly (readonly [number, number])[] = [
  [1.0, 4.2],
  [8.5, 11.2],
  [23.2, 27.4],
];
const EYE_BLUR_PX = 16;
/** Cruise speed in orbit, units per second, and how far before its blast point the ship starts. */
const CRUISE_SPEED = 7;
/** How hard the dead hull falls toward the Moon after the blast. */
const HULL_FALL = 0.32;
/** The pod's kick off the hull, how hard its engine pulls it toward the Moon, and the extra dive once the camera chases it. */
const POD_KICK = 6;
const POD_PULL = 3;
const POD_DIVE = 1.2;
/** The pod rides on the hull's flank: this far from its axis, its base this high up the hull. */
const DOCK_OFFSET = 1.74;
const DOCK_HEIGHT = 1.55;
const SHIP_MIDDLE = 2.5;
const UP = new Vector3(0, 1, 0);

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

function ease(t: number): number {
  const k = clamp01(t);
  return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Story time runs at a crawl through the blast and the pod breaking away. */
function playbackRate(time: number): number {
  if (time < T.blast + 0.04 || time >= T.slowEnd) return 1;
  if (time < T.slowEnd - 0.4) return SLOW_MOTION;
  return lerp(SLOW_MOTION, 1, (time - (T.slowEnd - 0.4)) / 0.4);
}

/**
 * The opening cinematic. In orbit: a fly-by of the rocket cruising over the Moon, a tracking shot as
 * the jump drive starts arcing, the blowout in slow motion, the pod blasting free and diving for the
 * Moon. Black. Then through the visor, lying on one side: eyes opening on the smoking pod, the gaze
 * climbing to Earth. A blink, the astronaut drags themself up, and the camera rises into the game view.
 */
export function createIntro(options: IntroOptions): Intro {
  const { space } = options;
  const scale = options.distanceScale;
  let time = 0;
  /** Playback holds here; the end of the intro unless a single cut is being reviewed. */
  let until: number = T.end;
  let beatHandler: (beat: IntroBeat) => void = () => undefined;
  const fired = new Set<IntroBeat>();
  const shot: CameraShot = { position: new Vector3(), target: new Vector3() };
  let fov = 35;
  let roll = 0;
  let widen = 1;
  let exposure = SPACE_EXPOSURE;
  let glare = INTRO_GLARE;
  let up: Vector3 | null = null;

  // ---------- Orbit geometry, fixed at the start so every shot can be planned ahead ----------
  const travel = options.travel.clone().normalize();
  const shipStart = travel.clone().multiplyScalar(-CRUISE_SPEED * T.blast);
  const blastPoint = travel.clone().multiplyScalar(0);
  const moonward = space.moonCenter.clone().sub(blastPoint).normalize();
  // The sun-lit side of the ship, square to its path: every orbit shot looks from there.
  const sun = new Vector3(-80, 60, 120).normalize();
  const lateral = travel.clone().cross(moonward).normalize();
  if (lateral.dot(sun) < 0) lateral.negate();
  const away = moonward.clone().negate();
  const shipTurn = new Quaternion().setFromUnitVectors(UP, travel);
  // Dock the pod on the flank that faces the tracking camera.
  const dockWorld = lateral.clone().multiplyScalar(1).addScaledVector(away, 0.55);
  dockWorld.addScaledVector(travel, -dockWorld.dot(travel)).normalize();
  const dockLocal = dockWorld.clone().applyQuaternion(shipTurn.clone().invert()).multiplyScalar(DOCK_OFFSET).setY(DOCK_HEIGHT);
  // Out, down toward the Moon and back behind the coasting hull, so the two part clearly on screen.
  const kickDirection = dockWorld.clone().multiplyScalar(0.8).addScaledVector(moonward, 1).addScaledVector(travel, -0.6).normalize();

  const shipPosition = new Vector3();
  const shipVelocity = new Vector3();
  const shipMiddle = new Vector3();
  const podRelease = new Vector3();
  const podVelocity = new Vector3();
  const podTurn = new Quaternion();
  const podAim = new Quaternion();
  const podMoonward = new Vector3();
  const wideFrom = new Vector3();
  const wideAim = new Vector3();
  let wideSet = false;

  // ---------- Ground geometry ----------
  // The astronaut lies curled on their side, facing the pod that brought them down.
  const hero = options.hero;
  const pod = options.pod;
  const faceYaw = Math.atan2(pod.x - hero.x, pod.z - hero.z);
  const facing = new Vector3(Math.sin(faceYaw), 0, Math.cos(faceYaw));
  const lyingEyes = new Vector3();
  const lyingUp = new Vector3();
  eyesOf(LYING, hero, faceYaw, lyingEyes, lyingUp);
  const podLow = pod.clone().add(new Vector3(0, 0.7, 0));
  const podTop = pod.clone().add(new Vector3(0, 2.3, 0));
  const sky = options.skyMark.clone();
  const look = new Vector3();
  const headUp = new Vector3();
  // After the blink: behind and to the right of the astronaut (the open side, away from the dome),
  // looking past them to the same pod the visor saw, low so the ground fills the background.
  const right = new Vector3(-Math.cos(faceYaw), 0, Math.sin(faceYaw));
  const wakeFrom = hero.clone().addScaledVector(right, 2.1 * scale).addScaledVector(facing, -1.5 * scale).add(new Vector3(0, 0.95 * scale, 0));
  const wakeTo = hero.clone().addScaledVector(facing, 0.9).addScaledVector(right, -0.25);
  const wakeEnd = wakeFrom.clone().addScaledVector(facing, 0.35).addScaledVector(right, -0.3).add(new Vector3(0, 0.25, 0));
  // Then one slow, continuous rise round behind the astronaut to the game's own camera, always looking
  // down at them, so the horizon (and whatever lies beyond the ridge) never fills the frame.
  const cranePath = new CatmullRomCurve3(
    // The middle point climbs steeply close behind the astronaut, clearing the suit station to the south-east.
    [wakeEnd, hero.clone().addScaledVector(right, 1.6 * scale).addScaledVector(facing, -1.2 * scale).add(new Vector3(0, 4.6 * scale, 0)), hero.clone().addScaledVector(facing, -3 * scale).add(new Vector3(0.6, 6.5 * scale, 4 * scale)), options.gameplayShot.position],
    false,
    "centripetal",
  );

  function beat(name: IntroBeat, at: number): void {
    if (time < at || fired.has(name)) return;
    fired.add(name);
    beatHandler(name);
  }

  function placeShip(): void {
    const { ship, pod } = space;
    const sinceBlast = time - T.blast;
    if (sinceBlast < 0) {
      shipPosition.copy(shipStart).addScaledVector(travel, CRUISE_SPEED * time);
      shipVelocity.copy(travel).multiplyScalar(CRUISE_SPEED);
    } else {
      // Thrust gone: the hull coasts on, slowing, and starts to drop toward the Moon.
      shipPosition.copy(blastPoint).addScaledVector(travel, CRUISE_SPEED * 0.7 * sinceBlast).addScaledVector(moonward, HULL_FALL * sinceBlast * sinceBlast);
      shipVelocity.copy(travel).multiplyScalar(CRUISE_SPEED * 0.7).addScaledVector(moonward, 2 * HULL_FALL * sinceBlast);
    }
    ship.position.copy(shipPosition);
    ship.quaternion.copy(shipTurn);
    // A faint shudder as the drive fails, then the dead hull tumbles end over end.
    const failing = clamp01((time - T.warn) / (T.blast - T.warn));
    if (sinceBlast < 0) {
      ship.rotateX(Math.sin(time * 31) * 0.004 * failing);
      ship.rotateZ(Math.sin(time * 27 + 1) * 0.004 * failing);
    } else {
      const tumble = sinceBlast * sinceBlast * 0.05 + sinceBlast * 0.25;
      ship.rotateZ(-tumble);
      ship.rotateX(tumble * 0.35);
      ship.rotateY(sinceBlast * 0.4);
    }
    ship.updateMatrixWorld();
    shipMiddle.copy(UP).multiplyScalar(SHIP_MIDDLE).applyQuaternion(ship.quaternion).add(shipPosition);

    const sinceEject = time - T.eject;
    const thrust = clamp01((time - T.ignite) / 0.35);
    space.update(time, {
      spark: clamp01((time - T.warn) / (T.blast - T.warn)),
      sinceBlast,
      sinceEject,
      engine: sinceBlast < 0,
      podThrust: thrust,
      heading: shipVelocity.clone().normalize(),
      shipVelocity,
      viewer: shot.position,
    });

    if (sinceEject < 0) {
      // Docked on the hull's flank, riding along until the bolts blow.
      pod.root.position.copy(ship.localToWorld(dockLocal.clone()));
      pod.root.quaternion.copy(ship.quaternion);
      podRelease.copy(pod.root.position);
      podVelocity.copy(shipVelocity);
      podTurn.copy(pod.root.quaternion);
      podMoonward.copy(space.moonCenter).sub(podRelease).normalize();
      podAim.setFromUnitVectors(UP, podMoonward);
      return;
    }
    // Blown clear sideways, then the engine lights and the pod dives for the Moon.
    const burn = Math.max(0, time - T.ignite);
    pod.root.position.copy(podRelease).addScaledVector(podVelocity, sinceEject).addScaledVector(kickDirection, (POD_KICK * (1 - Math.exp(-sinceEject * 3))) / 3 + sinceEject * 0.6).addScaledVector(podMoonward, 0.5 * POD_PULL * burn * burn + POD_DIVE * Math.max(0, burn - 3) ** 3);
    // It tumbles off the hull, then swings its nose round to the Moon and holds steady.
    const settle = ease((time - (T.ignite - 0.3)) / 1.4);
    pod.root.quaternion.copy(podTurn).slerp(podAim, settle);
    const wobble = (1 - settle) * sinceEject;
    pod.root.rotateX(wobble * 1.4);
    pod.root.rotateZ(-wobble * 0.8);
    pod.root.rotateY(time * 0.3);
  }

  function orbitShot(): void {
    const pod = space.pod.root.position;
    if (time < T.wide) {
      // One continuous move, no cut: from high above with the Moon filling the frame, down alongside
      // the hull as the drive fails, then thrown back by the blast.
      const k = ease(time / T.blast);
      const sinceBlast = Math.max(0, time - T.blast);
      const recoil = 1 - Math.exp(-sinceBlast * 5);
      const anchor = time < T.blast ? shipPosition : blastPoint.clone().addScaledVector(travel, CRUISE_SPEED * 0.8 * sinceBlast);
      shot.position
        .copy(anchor)
        .addScaledVector(away, (lerp(11, 5.4, k) + recoil * 1.5) * scale)
        .addScaledVector(lateral, (lerp(2.4, 3.2, k) + recoil * 2) * scale)
        .addScaledVector(travel, lerp(5, 1.4, k));
      // A breathing, hand-held drift that grows as we get close.
      shot.position.addScaledVector(away, Math.sin(time * 1.3) * 0.05 * k).addScaledVector(travel, Math.sin(time * 0.9) * 0.06 * k);
      const middle = time < T.eject ? shipMiddle : shipMiddle.clone().lerp(pod, 0.35);
      // Aim at the hull's middle, so its nose, the drive ring and the flame all stay in frame.
      shot.target.copy(middle).addScaledVector(travel, lerp(0.8, -0.2, k)).addScaledVector(moonward, lerp(1.2, 0.9, k));
      fov = lerp(30, 34, k) + recoil * 8;
      roll = Math.sin(time * 0.7) * 0.015 * k;
      return;
    }
    if (time < T.chase) {
      // Wide, the Moon below: the burning hull coasts on and tumbles while the pod drops away toward the surface.
      const k = ease((time - T.wide) / (T.chase - T.wide));
      if (!wideSet) {
        wideSet = true;
        wideFrom.copy(shipPosition).lerp(pod, 0.5).addScaledVector(lateral, 13 * scale).addScaledVector(away, 12 * scale).addScaledVector(travel, 3);
      }
      shot.position.copy(wideFrom).addScaledVector(travel, k * 4).addScaledVector(moonward, k * 2);
      shot.target.copy(shipPosition).lerp(pod, 0.45 + k * 0.25).addScaledVector(moonward, 3);
      fov = lerp(40, 36, k);
      roll = 0;
      return;
    }
    // Chase: three-quarters behind the pod, so it reads as a capsule riding its flame, the Moon swelling ahead.
    const toMoon = space.moonCenter.clone().sub(pod).normalize();
    const side = lateral.clone().addScaledVector(toMoon, -lateral.dot(toMoon)).normalize();
    const upish = side.clone().cross(toMoon).normalize();
    const k = (time - T.chase) / (T.ground - T.chase);
    shot.position.copy(pod).addScaledVector(toMoon, -(4.6 - k * 1.0) * scale).addScaledVector(side, 2.3 * scale).addScaledVector(upish, 1.2 * scale);
    shot.target.copy(pod).addScaledVector(toMoon, 5).addScaledVector(side, 0.5);
    fov = lerp(46, 56, k);
    roll = Math.sin(time * 2.1) * 0.02;
  }

  /** The astronaut's pose for the wake-up and the rise; their hip stays put on the ground. */
  function heroNow(): HeroPose {
    return wakePose(Math.max(0, time - T.blinkCut));
  }

  function groundShot(): void {
    glare = INTRO_GLARE;
    if (time < T.blinkCut) {
      // Through the visor, curled on one side: the pod lying sideways in the view, then the gaze climbs
      // its hull to the sky and Earth while the head lifts a little and the world swings level.
      widen = 0.6;
      exposure = VISOR_EXPOSURE;
      const climb = ease((time - T.gazeUp) / (T.gazeSky - T.gazeUp));
      const toSky = ease((time - (T.gazeUp + 0.5)) / (T.gazeSky - T.gazeUp));
      look.copy(podLow).lerp(podTop, climb).lerp(sky, toSky);
      // Breathing and a dazed drift.
      look.add(new Vector3(Math.sin(time * 0.7) * 0.12, Math.sin(time * 1.9) * 0.05, Math.cos(time * 0.5) * 0.1));
      const lift = 0.35 * climb;
      shot.position.copy(lyingEyes).add(new Vector3(0, 0.1 * lift + Math.sin(time * 1.9) * 0.008, 0));
      shot.target.copy(look);
      headUp.copy(lyingUp).lerp(new Vector3(0, 1, 0), lift).normalize();
      up = headUp;
      fov = 70;
      roll = Math.sin(time * 0.9) * 0.02;
      return;
    }
    up = null;
    roll = 0;
    widen = 1;
    if (time < T.crane) {
      // A slow push in while they get up; the aim follows the hips as they rise.
      exposure = WAKE_EXPOSURE;
      const k = ease((time - T.blinkCut) / (T.crane - T.blinkCut));
      shot.position.copy(wakeFrom).lerp(wakeEnd, k);
      shot.target.copy(wakeTo).add(new Vector3(0, 0.15 + heroNow().hip * 0.9, 0));
      fov = 40;
      return;
    }
    const u = ease((time - T.crane) / (T.end - T.crane));
    cranePath.getPoint(u, shot.position);
    shot.target.copy(wakeTo).add(new Vector3(0, 0.15 + heroNow().hip * 0.9, 0)).lerp(options.gameplayShot.target, ease(u * 1.15));
    fov = lerp(40, options.gameplayFov, u);
    widen = 1 - u;
    // Ease back to the base's normal look as the camera rises into the game view.
    exposure = lerp(WAKE_EXPOSURE, 1, u);
    glare = lerp(INTRO_GLARE, BASE_GLARE, u);
  }

  // The base kit is already standing when the astronaut comes round; nothing pops into being.
  function placeProps(): void {
    for (const prop of options.props) prop.object.visible = time >= T.ground;
  }

  function finish(): void {
    time = T.end;
    for (const prop of options.props) prop.object.visible = true;
    shot.position.copy(options.gameplayShot.position);
    shot.target.copy(options.gameplayShot.target);
    fov = options.gameplayFov;
    roll = 0;
    widen = 0;
    exposure = 1;
    glare = BASE_GLARE;
    up = null;
  }

  placeProps();

  return {
    update(dt) {
      if (time >= T.end) return null;
      time = Math.min(until, time + dt * playbackRate(time));
      for (const [name, at] of BEAT_TIMES) beat(name, at);
      placeProps();
      if (time >= T.end) {
        finish();
        return { shot, where: "ground", fov, roll, widen, exposure, up, glare };
      }
      if (time < T.ground) {
        placeShip();
        widen = 1;
        exposure = SPACE_EXPOSURE;
        glare = time < T.wide ? SPACE_GLARE : SPACE_GLARE_AFTER;
        up = null;
        orbitShot();
        return { shot, where: "space", fov, roll, widen, exposure, up, glare };
      }
      groundShot();
      return { shot, where: "ground", fov, roll, widen, exposure, up, glare };
    },
    caption() {
      const index = CAPTIONS.findIndex(([from, to]) => time >= from && time < to);
      return index < 0 ? null : options.captions[index] ?? null;
    },
    heroPose() {
      if (time < T.blinkCut) return null;
      // Once up, they turn round toward the base while the camera rises, shuffling their feet as they go.
      const turn = ease((time - (T.crane + 0.6)) / 2.6);
      return { pose: heroNow(), faceYaw, turn, shuffle: turn > 0 && turn < 1 ? Math.sin(turn * Math.PI * 4) * Math.sin(turn * Math.PI) : 0 };
    },
    visorFog() {
      if (time < T.eyes || time >= T.blinkCut) return 0;
      // Each slow breath out mists the visor, which clears as they breathe in.
      const w = time - (T.eyes + 0.1);
      return [1.0, 2.8, 4.4, 5.8].reduce((fog, at) => Math.max(fog, Math.exp(-(((w - at) / 0.35) ** 2))), 0) * 0.85;
    },
    eyes() {
      if (time < T.ground) return { open: 1, blur: 0 };
      if (time < T.blinkCut - 0.2) {
        // Groggy: a crack of light, the lids sag shut, then they open properly and the view sharpens.
        const w = time - T.eyes;
        const open = w < 0 ? 0 : w < 0.4 ? (w / 0.4) * 0.45 : w < 0.65 ? 0.45 - ((w - 0.4) / 0.25) * 0.35 : w < 0.95 ? 0.1 + ((w - 0.65) / 0.3) * 0.5 : w < 1.1 ? 0.6 - ((w - 0.95) / 0.15) * 0.15 : Math.min(1, 0.45 + ((w - 1.1) / 0.7) * 0.55);
        return { open, blur: EYE_BLUR_PX * (1 - clamp01(w / 2.6)) };
      }
      // A slow, deliberate blink covers the cut: the lids close, stay shut a beat, and open on the astronaut.
      const d = time - T.blinkCut;
      const open = d < -0.05 ? clamp01(-(d + 0.05) / 0.2) : d < 0.12 ? 0 : clamp01((d - 0.12) / 0.3);
      return { open, blur: d > 0 ? 3 * (1 - clamp01((d - 0.12) / 0.5)) : 0 };
    },
    fade() {
      const white = time >= T.blast ? Math.max(0, 1 - (time - T.blast) / 0.14) ** 2 : 0;
      if (time < T.fadeIn) return { black: 1 - ease(time / T.fadeIn), white };
      if (time < T.fadeOut) return { black: 0, white };
      if (time < T.eyes) return { black: ease((time - T.fadeOut) / (T.ground - T.fadeOut)), white: 0 };
      return { black: 0, white: 0 };
    },
    alarm() {
      if (time < T.warn || time >= T.blast) return 0;
      const pulse = (Math.sin((time - T.warn) * Math.PI * 2 * 1.6 - Math.PI / 2) * 0.5 + 0.5) ** 2;
      return clamp01((time - T.warn) / 0.6) * pulse * 0.85;
    },
    visor() {
      return time >= T.ground && time < T.blinkCut;
    },
    podSmoking() {
      return time >= T.ground && time < T.crane;
    },
    onBeat(handler) {
      beatHandler = handler;
    },
    seek(at, stop) {
      // Replay the orbit silently from the top in small steps, so the blast, the pod's release point
      // and the wide shot's camera land exactly where they do in a full run.
      wideSet = false;
      time = 0;
      while (time < Math.min(at, T.ground)) {
        placeShip();
        orbitShot();
        time += SEEK_STEP * playbackRate(time);
      }
      time = at;
      until = Math.min(T.end, stop);
      fired.clear();
      // Beats before the cut stay quiet; the cut's own first beat still sounds.
      for (const [name, beatAt] of BEAT_TIMES) if (beatAt < at - 0.001) fired.add(name);
      placeProps();
    },
    storyTime: () => time,
    skip() {
      if (time < T.end) finish();
    },
    done: () => time >= T.end,
  };
}
