import { CatmullRomCurve3, Color, Euler, Matrix4, Object3D, Quaternion, Vector3 } from "three";
import { eyesOf, LYING, wakePose, type HeroPose } from "./introPose";
import type { CabinScreen } from "./view/podCabin";
import { SUN_DIRECTION, type SpaceSet } from "./view/spaceSet";

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
export type IntroBeat =
  | "cruise"
  | "calm"
  | "warn"
  | "alarm"
  | "pulse"
  | "blast"
  | "eject"
  | "thrusters"
  | "steady"
  | "swing"
  | "ignite"
  | "strain"
  | "impact"
  | "heartbeat"
  | "breath"
  | "wake";

export interface IntroOptions {
  readonly space: SpaceSet;
  /** Which way the rocket cruises in orbit. */
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
  /** Whether the camera is the astronaut's head inside the pod, where a jolt turns the head rather than moving it. */
  readonly inside: boolean;
}

/** The suit's readouts inside the visor, either side; a line starting with "!" is an alert. */
export interface VisorReadout {
  readonly left: readonly string[];
  readonly right: readonly string[];
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
  /** What the suit shows in the visor right now. */
  readout(): VisorReadout;
  /** Whether the visor has cracked: from the crash on. */
  visorCracked(): boolean;
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

/** The crash: the screen goes black here and the wake-up on the ground begins this much later. */
const GROUND = 14.2;
/** Timeline, in seconds of story time (the blast plays in slow motion, so it runs longer on screen). */
const T = {
  fadeIn: 1.6,
  warn: 4.4,
  alarm: 5.4,
  blast: 6.8,
  eject: 7.12,
  thrusters: 7.7,
  slowEnd: 7.95,
  settle: 8.5,
  turn: 9.2,
  ignite: 10.0,
  descent: 10.4,
  impact: 13.6,
  ground: GROUND,
  heartbeat: GROUND + 0.5,
  eyes: GROUND + 0.9,
  gazeUp: GROUND + 2.4,
  gazeSky: GROUND + 3.6,
  blinkCut: GROUND + 4.6,
  crane: GROUND + 9.4,
  end: GROUND + 15.0,
} as const;
/** The intro's shots and story beats, in order, for review one at a time. */
export const INTRO_CUTS: readonly IntroCut[] = [
  { name: "Orbit", from: 0, to: T.warn },
  { name: "Drive fails", from: T.warn - 0.3, to: T.blast - 0.05 },
  { name: "Blast", from: T.blast - 0.5, to: T.settle },
  { name: "Pod away", from: T.settle, to: T.descent },
  { name: "Descent", from: T.descent - 0.3, to: T.ground },
  { name: "Black + visor", from: T.ground, to: T.blinkCut - 0.06 },
  { name: "Wake up", from: T.blinkCut - 0.3, to: T.crane + 0.4 },
  { name: "To the game", from: T.crane, to: T.end - 0.01 },
];
/** When each story beat sounds. */
const BEAT_TIMES: readonly (readonly [IntroBeat, number])[] = [
  ["cruise", 0],
  ["calm", 0.9],
  ["warn", T.warn],
  ["alarm", T.alarm],
  ["pulse", T.alarm + 0.6],
  ["blast", T.blast],
  ["eject", T.eject],
  ["thrusters", T.thrusters],
  ["steady", T.thrusters + 0.45],
  ["swing", T.turn],
  ["ignite", T.ignite],
  ["strain", T.descent + 1.6],
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
/** In orbit the blast, the console's lights and the engine glow should bloom, the sunlit hull should not; once the fireball is gone, even less. */
const SPACE_GLARE = 1.15;
const SPACE_GLARE_AFTER = 1.8;
const BASE_GLARE = 0.95;
const CAPTIONS: readonly (readonly [number, number])[] = [
  [1.0, 4.2],
  [8.5, 11.2],
  [GROUND + 10.2, GROUND + 14.4],
];
const EYE_BLUR_PX = 16;
/** Cruise speed in orbit, units per second. */
const CRUISE_SPEED = 7;
/** How hard the dead hull falls toward the Moon after the blast. */
const HULL_FALL = 0.32;
const SHIP_MIDDLE = 2.5;
/** The jump drive ring, where the hull blew open and still burns. */
const SHIP_DRIVE = 0.75;
/** After the blast the dead hull drifts on a touch slower than the pod. */
const HULL_DRIFT = 0.95;
/** Where the astronaut sits, in the pod docked on the hull's flank: this far forward of the engine and out from its axis. */
const EYE_ALONG = 3.9;
const EYE_OUT = 3.4;
/** The pod's seat is this far above its engine. */
const SEAT_HEIGHT = 1.25;
/** The bolts' kick off the hull, and how high over the surface the fall ends when the screen cuts to black. */
const POD_KICK = 5;
const CRASH_HEIGHT = 2.2;
/** Scene units to the kilometres the console and the suit report. */
const KM_PER_UNIT = 1.3;
/** A first-person lens, widened a little on narrow screens. */
const EYE_FOV = 66;
const EYE_WIDEN = 0.5;
/**
 * The natural blinks while all is calm, then a quick half flinch at the blast and another as the bolts
 * fire: [start, how far shut, speed]. The flinches run fast because story time crawls through the blast.
 */
const BLINKS: readonly (readonly [number, number, number])[] = [
  [2.7, 1, 1],
  [4.9, 1, 1],
  [6.85, 0.5, 2.8],
  [7.15, 0.4, 2.8],
];
/** Earth sits this far up from the calm view's centre, so it rises just over the lunar horizon. */
const EARTH_DISTANCE = 520;
const EARTH_LIFT = 0.1;
const EARTH_ASIDE = -0.2;
const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, -1);
const CALM_LIGHT = new Color(0xdfe6ff);
const ARC_LIGHT = new Color(0x8fdcff);
const FIRE_LIGHT = new Color(0xff8a3a);
const FLASH_LIGHT = new Color(0xfff4e0);

/**
 * Where the head turns, relative to the body, through the orbit: [story time, yaw (+ left), pitch (+ up)].
 * Out at the Moon while all is calm, to the arcing drive ring, a glance down at the console as the
 * alarm sounds, back to the window as it goes; after the bolts fire the body turns, not the head, until
 * one last look at the altitude on the way down.
 */
const HEAD_KEYS: readonly (readonly [number, number, number])[] = [
  [0, -0.3, -0.04],
  [3.8, -0.16, -0.1],
  [T.warn + 0.25, -0.16, -0.1],
  [T.warn + 0.95, 0.12, -0.16],
  [T.alarm + 0.3, 0.1, -0.13],
  [T.alarm + 0.7, 0.0, -0.8],
  [T.alarm + 1.05, 0.0, -0.8],
  [T.blast - 0.3, 0.1, -0.12],
  [T.eject, 0.02, -0.04],
  [T.descent + 0.3, 0.0, -0.04],
  [T.descent + 0.8, -0.04, -0.68],
  [T.descent + 1.35, -0.04, -0.68],
  [T.descent + 1.9, 0.0, -0.06],
  [T.impact, 0.0, -0.06],
];

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

/** How far a blink has the lids shut, `since` seconds after it starts: quickly down, a beat closed, up. */
function blinkShut(since: number): number {
  if (since < 0 || since > 0.32) return 0;
  if (since < 0.07) return since / 0.07;
  if (since < 0.13) return 1;
  return 1 - (since - 0.13) / 0.19;
}

/** A turn that looks down `forward` with `up` as near overhead as it can be. */
function lookTurn(forward: Vector3, up: Vector3, out: Quaternion): Quaternion {
  const z = forward.clone().normalize().negate();
  const x = up.clone().cross(z).normalize();
  const y = z.clone().cross(x);
  return out.setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
}

/** Head yaw and pitch relative to the body at `time`, eased between the keys. */
function headAt(time: number): [number, number] {
  const next = HEAD_KEYS.findIndex(([at]) => at > time);
  if (next <= 0) {
    const key = HEAD_KEYS[next === 0 ? 0 : HEAD_KEYS.length - 1]!;
    return [key[1], key[2]];
  }
  const from = HEAD_KEYS[next - 1]!;
  const to = HEAD_KEYS[next]!;
  const k = ease((time - from[0]) / (to[0] - from[0]));
  return [lerp(from[1], to[1], k), lerp(from[2], to[2], k)];
}

/**
 * The opening cinematic, all through the astronaut's eyes. Strapped into the escape pod on the rocket's
 * flank in low lunar orbit: the Moon sliding by below, then the jump drive arcing on the hull outside
 * the window, the master alarm, the blowout in slow motion, the bolts firing and the pod tumbling free,
 * the burning wreck falling away, the engine lighting and the surface rushing up. Black. Then through
 * the cracked visor, lying on one side: eyes opening on the smoking pod, the gaze climbing to Earth. A
 * blink, the astronaut drags themself up, and the camera rises into the game view.
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

  // ---------- Orbit geometry, fixed at the start so every moment can be planned ahead ----------
  const travel = options.travel.clone().normalize();
  const moonCenter = space.moonCenter;
  // The blast goes off at the origin, straight over the Moon's centre.
  const blastPoint = new Vector3();
  const away = blastPoint.clone().sub(moonCenter).normalize();
  const moonward = away.clone().negate();
  // The sunlit flank, square to the path: the pod rides there, a little above the hull's middle.
  const lateral = travel.clone().cross(moonward).normalize();
  if (lateral.dot(SUN_DIRECTION) < 0) lateral.negate();
  const side = lateral.clone().addScaledVector(away, 0.3).normalize();
  // The rocket circles the Moon at a steady height: the orbit's radius, and the axis it turns about.
  const orbitRadius = blastPoint.distanceTo(moonCenter);
  const orbitAxis = away.clone().cross(travel).normalize();
  const shipTurn = new Quaternion().setFromUnitVectors(UP, travel);
  const shipTurnInverse = shipTurn.clone().invert();
  const eyeOnShip = travel.clone().multiplyScalar(EYE_ALONG).addScaledVector(side, EYE_OUT).applyQuaternion(shipTurnInverse);
  // Seated facing aft along the hull, toward the jump drive ring, with the Moon below.
  const seatForward = travel.clone().negate().addScaledVector(side, -0.5).addScaledVector(away, -0.32);
  const seatOnShip = shipTurnInverse.clone().multiply(lookTurn(seatForward, away, new Quaternion()));
  // Out from the hull, down toward the Moon and back, so the wreck falls away behind the window.
  const kick = side.clone().addScaledVector(moonward, 0.45).addScaledVector(travel, -0.25).normalize();
  // The tumble the bolts set off: mostly a roll with some pitch, in the body's own frame.
  const tumbleAxis = new Vector3(0.35, 0.5, 1).normalize();

  const shipPosition = new Vector3();
  const shipVelocity = new Vector3();
  const shipMiddle = new Vector3();
  const shipBreach = new Vector3();
  /** The astronaut's body: eye position and how the seat is turned; the head turns on top. */
  const body = { position: new Vector3(), turn: new Quaternion() };
  const release = { position: new Vector3(), velocity: new Vector3(), turn: new Quaternion(), pull: new Vector3() };
  const bodyUp = new Vector3();
  const head = new Quaternion();
  const headEuler = new Euler(0, 0, 0, "YXZ");
  const turnA = new Quaternion();
  const turnB = new Quaternion();
  const scratch = new Vector3();
  const gaze = new Vector3();
  const eyeUp = new Vector3();
  const spill = new Color();
  let spillStrength = 0;
  let altitudeKm = 0;

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

  /** The rocket on its circular orbit until the blast; then the dead hull drifts on, sinks and tumbles. */
  function placeShip(): void {
    const { ship } = space;
    const sinceBlast = time - T.blast;
    const angle = (CRUISE_SPEED * (sinceBlast < 0 ? sinceBlast : sinceBlast * HULL_DRIFT)) / orbitRadius;
    const radius = orbitRadius - (sinceBlast > 0 ? HULL_FALL * sinceBlast * sinceBlast : 0);
    const turn = new Quaternion().setFromAxisAngle(orbitAxis, angle);
    shipPosition.copy(away).applyQuaternion(turn).multiplyScalar(radius).add(moonCenter);
    shipVelocity.copy(travel).applyQuaternion(turn).multiplyScalar(CRUISE_SPEED * (sinceBlast < 0 ? 1 : HULL_DRIFT));
    if (sinceBlast > 0) shipVelocity.addScaledVector(away.clone().applyQuaternion(turn), -2 * HULL_FALL * sinceBlast);
    ship.position.copy(shipPosition);
    ship.quaternion.copy(turn).multiply(shipTurn);
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
    shipBreach.copy(UP).multiplyScalar(SHIP_DRIVE).applyQuaternion(ship.quaternion).add(shipPosition);
  }

  /** Aim the engine's pull so the fall ends just over the surface as the screen cuts to black. */
  function planFall(): void {
    const coast = scratch.copy(release.position).addScaledVector(release.velocity, T.impact - T.eject).addScaledVector(kick, POD_KICK / 3);
    const drop = coast.distanceTo(moonCenter) - space.moonRadius - CRASH_HEIGHT;
    const burn = T.impact - T.ignite;
    release.pull.copy(moonCenter).sub(coast).normalize().multiplyScalar((2 * drop) / (burn * burn));
  }

  /** Where the astronaut's eyes are and how the seat is turned. */
  function placeBody(): void {
    if (time < T.eject) {
      // Docked: the seat rides the hull, shudder and all.
      body.position.copy(eyeOnShip).applyMatrix4(space.ship.matrixWorld);
      body.turn.copy(space.ship.quaternion).multiply(seatOnShip);
      release.position.copy(body.position);
      release.velocity.copy(shipVelocity);
      release.turn.copy(body.turn);
      planFall();
      return;
    }
    const since = time - T.eject;
    body.position.copy(release.position).addScaledVector(release.velocity, since).addScaledVector(kick, (POD_KICK * (1 - Math.exp(-since * 3))) / 3);
    const burn = Math.max(0, time - T.ignite);
    body.position.addScaledVector(release.pull, 0.5 * burn * burn);
    bodyUp.copy(body.position).sub(moonCenter).normalize();
    // The bolts set it tumbling; the thrusters kill the spin and swing the window round to the wreck.
    turnA.copy(release.turn).multiply(new Quaternion().setFromAxisAngle(tumbleAxis, 1.05 * (1 - Math.exp(-since / 0.55))));
    // Aimed nearer the burning drive end than the middle, so the fire stays in the window.
    lookTurn(scratch.copy(shipMiddle).lerp(shipBreach, 0.6).sub(body.position), bodyUp, turnB);
    if (time < T.turn) {
      body.turn.copy(turnA).slerp(turnB, ease((time - T.thrusters) / (T.settle - T.thrusters)));
      return;
    }
    // Then round to face the way it falls: on along the orbit and steeply down at the surface, wallowing
    // a little as the attitude jets fight to hold it.
    const along = scratch.copy(travel).addScaledVector(bodyUp, -travel.dot(bodyUp)).normalize();
    const descend = lookTurn(along.addScaledVector(bodyUp, -0.8), bodyUp, turnA);
    descend.multiply(new Quaternion().setFromAxisAngle(FORWARD, Math.sin(time * 0.9) * 0.05));
    body.turn.copy(turnB).slerp(descend, ease((time - T.turn) / (T.descent - T.turn)));
  }

  /** The red master-alarm pulse, from the alarm to the crash. */
  function alarmPulse(): number {
    if (time < T.alarm || time >= T.impact) return 0;
    return clamp01((time - T.alarm) / 0.4) * (Math.sin((time - T.alarm) * Math.PI * 2 * 1.6 - Math.PI / 2) * 0.5 + 0.5) ** 2;
  }

  function placeOrbit(): void {
    placeShip();
    placeBody();
    const { pod: podModel, cabin } = space;
    const sinceBlast = time - T.blast;
    const spark = clamp01((time - T.warn) / (T.blast - T.warn));
    altitudeKm = Math.max(0, (body.position.distanceTo(moonCenter) - space.moonRadius - CRASH_HEIGHT) * KM_PER_UNIT);
    // Light through the window: soft moonlight, the drive's blue arcs, then the blast's white flash
    // cooling to firelight, and pale sunlit ground on the way down.
    if (sinceBlast < 0) {
      const arcs = spark * (0.55 + 0.45 * Math.sin(time * 41) * Math.sin(time * 29.3));
      spill.copy(CALM_LIGHT).lerp(ARC_LIGHT, clamp01(arcs * 2));
      spillStrength = 0.35 + arcs * 2.2;
    } else {
      const flash = Math.exp(-sinceBlast * 5);
      spill.copy(FIRE_LIGHT).lerp(FLASH_LIGHT, flash).lerp(CALM_LIGHT, clamp01((time - T.turn) / 1.5));
      spillStrength = 9 * flash + 2.2 * Math.exp(-sinceBlast * 0.9) + 0.4 * clamp01((time - T.turn) / 1.5);
    }
    // The cabin loses power in the blast: a stutter, the dim emergency lights, then backup power.
    const power = sinceBlast < 0 ? 1 : sinceBlast < 0.25 ? (Math.sin(time * 90) > 0 ? 0.9 : 0.05) : time < T.eject + 0.6 ? 0.22 : 0.45;
    const screen: CabinScreen = time < T.warn ? "calm" : time < T.alarm ? "fault" : time < T.blast ? "release" : time < T.eject + 0.6 ? "dead" : time < T.descent ? "free" : "descent";
    cabin.root.position.copy(body.position);
    cabin.root.quaternion.copy(body.turn);
    // The pod itself (only its engine glow is drawn) sits under the seat.
    podModel.root.quaternion.copy(body.turn);
    podModel.root.position.copy(body.position).addScaledVector(scratch.copy(UP).applyQuaternion(body.turn), -SEAT_HEIGHT);
    space.update(time, {
      spark,
      sinceBlast,
      sinceEject: time - T.eject,
      // Coasting in orbit: the main engine is cold the whole time.
      engine: false,
      podThrust: time < T.impact ? clamp01((time - T.ignite) / 0.35) : 0,
      heading: shipVelocity.clone().normalize(),
      shipVelocity,
      viewer: shot.position,
      cabin: { time, power, alarm: alarmPulse(), spill, spillStrength, screen, altitude: altitudeKm },
    });
  }

  /** Earth, fixed in the sky where the astronaut's calm gaze will find it just over the horizon. */
  function placeEarth(): void {
    time = 2.2;
    placeShip();
    placeBody();
    eyeShot();
    const aside = new Vector3(1, 0, 0).applyQuaternion(head);
    space.earth.position.copy(shot.position).addScaledVector(gaze.clone().addScaledVector(eyeUp, EARTH_LIFT).addScaledVector(aside, EARTH_ASIDE).normalize(), EARTH_DISTANCE);
    time = 0;
  }

  /**
   * Tear the hull open on the side that will face the pod's window once the thrusters have steadied
   * it, so the astronaut looks straight at the burning wound as the wreck falls away.
   */
  function aimBreach(): void {
    // The pod's free flight starts from where it was just before the bolts fired.
    time = T.eject - 0.01;
    placeShip();
    placeBody();
    time = T.settle + 0.6;
    placeShip();
    placeBody();
    space.aimBreach(space.ship.worldToLocal(body.position.clone()));
    time = 0;
  }

  /** Through the astronaut's eyes: the head turns on the body, breathes, and shakes on the way down. */
  function eyeShot(): void {
    const [yaw, pitch] = headAt(time);
    const shudder = time < T.blast ? clamp01((time - T.warn) / (T.blast - T.warn)) * 0.006 : 0;
    const fall = time >= T.ignite ? 0.004 + 0.024 * clamp01((time - T.ignite) / (T.impact - T.ignite)) ** 2 : 0;
    const rumble = shudder + fall;
    headEuler.set(
      pitch + Math.sin(time * 1.3) * 0.012 + Math.sin(time * 13.7 + 1) * rumble,
      yaw + Math.sin(time * 0.7) * 0.02 + Math.sin(time * 17.3) * Math.sin(time * 5.1) * rumble * 1.4,
      Math.sin(time * 0.5) * 0.012,
    );
    head.setFromEuler(headEuler).premultiply(body.turn);
    shot.position.copy(body.position).addScaledVector(scratch.copy(UP).applyQuaternion(body.turn), Math.sin(time * 1.4) * 0.006);
    gaze.copy(FORWARD).applyQuaternion(head);
    shot.target.copy(shot.position).addScaledVector(gaze, 4);
    eyeUp.copy(UP).applyQuaternion(head);
    up = eyeUp;
    fov = EYE_FOV;
    roll = 0;
    widen = EYE_WIDEN;
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
  placeEarth();
  aimBreach();

  return {
    update(dt) {
      if (time >= T.end) return null;
      time = Math.min(until, time + dt * playbackRate(time));
      for (const [name, at] of BEAT_TIMES) beat(name, at);
      placeProps();
      if (time >= T.end) {
        finish();
        return { shot, where: "ground", fov, roll, widen, exposure, up, glare, inside: false };
      }
      if (time < T.ground) {
        placeOrbit();
        eyeShot();
        exposure = SPACE_EXPOSURE;
        glare = time < T.blast + 1.2 ? SPACE_GLARE : SPACE_GLARE_AFTER;
        return { shot, where: "space", fov, roll, widen, exposure, up, glare, inside: true };
      }
      groundShot();
      return { shot, where: "ground", fov, roll, widen, exposure, up, glare, inside: false };
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
      if (time < T.impact) {
        // Slow, even breaths misting the visor in orbit; quick, shallow ones once the alarm sounds.
        const calm = time < T.alarm;
        const period = calm ? 3.4 : 1.3;
        const phase = ((time + 0.6) % period) / period;
        return Math.exp(-(((phase - 0.3) / 0.12) ** 2)) * (calm ? 0.22 : 0.3);
      }
      if (time < T.eyes || time >= T.blinkCut) return 0;
      // Each slow breath out mists the visor, which clears as they breathe in.
      const w = time - (T.eyes + 0.1);
      return [1.0, 2.8, 4.4, 5.8].reduce((fog, at) => Math.max(fog, Math.exp(-(((w - at) / 0.35) ** 2))), 0) * 0.85;
    },
    eyes() {
      if (time < T.impact) {
        const shut = BLINKS.reduce((most, [at, depth, speed]) => Math.max(most, blinkShut((time - at) * speed) * depth), 0);
        return { open: 1 - shut, blur: 0 };
      }
      if (time < T.ground) return { open: 0, blur: 0 };
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
      // The blast whites out the window and the cabin for an instant; the crash cuts straight to black.
      const white = time >= T.blast && time < T.impact ? 0.8 * Math.max(0, 1 - (time - T.blast) / 0.14) ** 2 : 0;
      if (time < T.fadeIn) return { black: 1 - ease(time / T.fadeIn), white };
      if (time < T.impact) return { black: 0, white };
      if (time < T.eyes) return { black: 1, white: time < T.impact + 0.06 ? 0.5 : 0 };
      return { black: 0, white: 0 };
    },
    alarm() {
      return alarmPulse() * 0.55;
    },
    visor() {
      // The suit's display dies in the crash and boots again as the astronaut comes round.
      return time < T.impact || (time >= T.ground && time < T.blinkCut);
    },
    readout() {
      if (time >= T.impact) return { left: ["SUIT 03", "PRESSURE 0.61 ATM", "COMMS NO SIGNAL"], right: ["!O2 LOW · 18%", "HEART RATE 141", "POD BEACON ACTIVE"] };
      const heart = Math.round(
        time < T.warn ? 72 + Math.sin(time * 0.8) : time < T.alarm ? lerp(74, 96, time - T.warn) : time < T.blast ? lerp(104, 128, clamp01(time - T.alarm)) : time < T.descent ? 146 : 152 + (time - T.descent) * 3,
      );
      const height = `ALT ${altitudeKm.toFixed(1)} KM`;
      const status = time < T.warn ? "O2 98%" : time < T.blast ? "!JUMP DRIVE FAULT" : time < T.eject ? "!HULL BREACH" : time < T.descent ? "!POD FREE" : "!DESCENT TOO FAST";
      return {
        left: ["SUIT 03", time < T.blast ? "PRESSURE 1.00 ATM" : "PRESSURE 0.97 ATM", time < T.blast ? "COMMS LINK OK" : "!COMMS NO SIGNAL"],
        right: [status, `HEART RATE ${heart}`, time < T.descent ? height : `!${height}`],
      };
    },
    visorCracked: () => time >= T.impact,
    podSmoking() {
      return time >= T.ground && time < T.crane;
    },
    onBeat(handler) {
      beatHandler = handler;
    },
    seek(at, stop) {
      // Replay the orbit silently from the top in small steps, so the blast, the pod's release and its
      // fall land exactly where they do in a full run.
      time = 0;
      while (time < Math.min(at, T.ground)) {
        placeOrbit();
        eyeShot();
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
