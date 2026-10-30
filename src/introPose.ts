import { Euler, Quaternion, Vector3 } from "three";
import type { AstronautModel } from "./view/characters";

/** Hip angle (negative swings the thigh forward) and knee bend (positive folds the shin back), in radians. */
export interface LegPose {
  readonly hip: number;
  readonly knee: number;
}

/** Shoulder swing (negative raises the arm forward), sideways spread and elbow bend (negative folds the forearm up), in radians. */
export interface ArmPose {
  readonly lift: number;
  readonly spread: number;
  readonly elbow: number;
}

/**
 * The whole astronaut, in the hero's own frame: `roll` lies them on their right side, `pitch` leans
 * them forward, `hip` is the hip joint's height above the ground. Legs and arms are [right, left].
 */
export interface HeroPose {
  readonly roll: number;
  readonly pitch: number;
  readonly hip: number;
  readonly legs: readonly [LegPose, LegPose];
  readonly arms: readonly [ArmPose, ArmPose];
}

/** Where the hip joint sits on the model when standing, and the eyes behind the visor. */
const HIP_HEIGHT = 0.6;
const EYES = new Vector3(0, 1.38, 0.16);
const UP = new Vector3(0, 1, 0);

const leg = (hip: number, knee: number): LegPose => ({ hip, knee });
const arm = (lift: number, spread: number, elbow: number): ArmPose => ({ lift, spread, elbow });

/** Curled on the right side where the pod threw them, the right arm out under the head. */
export const LYING: HeroPose = { roll: 1.5, pitch: 0.12, hip: 0.3, legs: [leg(-0.85, 1.25), leg(-1.05, 1.45)], arms: [arm(-1.35, -0.1, -0.45), arm(-0.45, 0.2, -0.9)] };

/** Getting up, in seconds from the first frame of the wake-up shot. */
const WAKE: readonly (readonly [number, HeroPose])[] = [
  [0, LYING],
  // Stirs: the free (left) hand comes over and down to plant on the ground in front of the chest.
  [0.8, { roll: 1.42, pitch: 0.16, hip: 0.31, legs: [leg(-0.9, 1.3), leg(-1.15, 1.55)], arms: [arm(-1.3, -0.1, -0.5), arm(-1.15, -0.6, -0.3)] }],
  // Pushes up onto the right hand, hips still down, legs folded.
  [1.7, { roll: 0.62, pitch: 0.22, hip: 0.36, legs: [leg(-1.15, 1.8), leg(-1.3, 1.95)], arms: [arm(-0.25, -0.55, -0.15), arm(-0.95, 0.2, -0.6)] }],
  // Up on both knees, hands on the thighs, catching their breath.
  [2.5, { roll: 0, pitch: 0.32, hip: 0.34, legs: [leg(-0.3, 1.62), leg(-0.3, 1.62)], arms: [arm(-0.6, -0.15, -0.75), arm(-0.6, 0.15, -0.75)] }],
  // Left foot forward, a hand on that knee.
  [3.2, { roll: 0, pitch: 0.28, hip: 0.37, legs: [leg(-0.1, 1.42), leg(-1.85, 1.62)], arms: [arm(-0.3, -0.15, -0.3), arm(-1.05, 0.1, -0.45)] }],
  // Rising, still stooped, a hand going to the helmet.
  [4.1, { roll: 0.04, pitch: 0.16, hip: 0.55, legs: [leg(-0.12, 0.3), leg(-0.38, 0.5)], arms: [arm(-2.3, -0.25, -1.55), arm(-0.25, 0.1, -0.2)] }],
  // On their feet.
  [4.9, { roll: -0.03, pitch: 0.03, hip: 0.6, legs: [leg(0, 0), leg(0, 0)], arms: [arm(-0.35, -0.1, -0.5), arm(-0.15, 0.08, -0.15)] }],
  [5.6, { roll: 0, pitch: 0, hip: 0.6, legs: [leg(0, 0), leg(0, 0)], arms: [arm(-0.08, -0.05, -0.1), arm(-0.08, 0.05, -0.1)] }],
];

/** How long getting up takes, in seconds. */
export const WAKE_SECONDS = WAKE[WAKE.length - 1]?.[0] ?? 0;

function smooth(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function blend(a: HeroPose, b: HeroPose, t: number): HeroPose {
  return {
    roll: mix(a.roll, b.roll, t),
    pitch: mix(a.pitch, b.pitch, t),
    hip: mix(a.hip, b.hip, t),
    legs: [0, 1].map((i) => leg(mix(a.legs[i]!.hip, b.legs[i]!.hip, t), mix(a.legs[i]!.knee, b.legs[i]!.knee, t))) as unknown as [LegPose, LegPose],
    arms: [0, 1].map((i) => arm(mix(a.arms[i]!.lift, b.arms[i]!.lift, t), mix(a.arms[i]!.spread, b.arms[i]!.spread, t), mix(a.arms[i]!.elbow, b.arms[i]!.elbow, t))) as unknown as [ArmPose, ArmPose],
  };
}

/** The pose `seconds` into getting up, eased between the key poses, with a small stagger once upright. */
export function wakePose(seconds: number): HeroPose {
  let index = 0;
  while (index < WAKE.length - 2 && seconds >= WAKE[index + 1]![0]) index += 1;
  const [fromAt, from] = WAKE[index]!;
  const [toAt, to] = WAKE[index + 1]!;
  const pose = blend(from, to, smooth((seconds - fromAt) / (toAt - fromAt)));
  // Unsteady for a moment after standing: a slow sway that dies away.
  const sway = seconds > 3.8 ? Math.sin((seconds - 3.8) * 4.2) * 0.05 * Math.max(0, 1 - (seconds - 3.8) / 2.2) : 0;
  return { ...pose, roll: pose.roll + sway };
}

/** The model's orientation for a pose: turned to `yaw`, then rolled onto the side, then leaned. */
function orientation(pose: HeroPose, yaw: number, out: Quaternion): Quaternion {
  return out.setFromEuler(new Euler(pose.pitch, yaw, pose.roll, "YZX"));
}

/** Lay the model out in `pose` on the ground at `ground`, facing `yaw`. */
export function applyPose(model: AstronautModel, pose: HeroPose, ground: Vector3, yaw: number): void {
  const turn = orientation(pose, yaw, model.root.quaternion);
  model.root.position.copy(ground).add(new Vector3(0, pose.hip, 0)).sub(new Vector3(0, HIP_HEIGHT, 0).applyQuaternion(turn));
  model.body.position.set(0, 0, 0);
  model.body.rotation.set(0, 0, 0);
  pose.legs.forEach((l, i) => {
    model.legs[i]!.rotation.set(l.hip, 0, 0);
    model.knees[i]!.rotation.set(l.knee, 0, 0);
  });
  pose.arms.forEach((a, i) => {
    model.arms[i]!.rotation.set(a.lift, 0, a.spread);
    model.elbows[i]!.rotation.set(a.elbow, 0, 0);
  });
}

/** Put the model back the way normal play expects it: upright, limbs straight. */
export function clearPose(model: AstronautModel): void {
  model.root.rotation.set(0, model.root.rotation.y, 0);
  for (const knee of model.knees) knee.rotation.set(0, 0, 0);
  for (const elbow of model.elbows) elbow.rotation.set(0, 0, 0);
}

/** Where the eyes are and which way is "up" for the head, for a first-person view in `pose`. */
export function eyesOf(pose: HeroPose, ground: Vector3, yaw: number, eyes: Vector3, up: Vector3): void {
  const turn = orientation(pose, yaw, new Quaternion());
  const root = ground.clone().add(new Vector3(0, pose.hip, 0)).sub(new Vector3(0, HIP_HEIGHT, 0).applyQuaternion(turn));
  eyes.copy(EYES).applyQuaternion(turn).add(root);
  up.copy(UP).applyQuaternion(turn);
}
