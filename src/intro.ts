import { CatmullRomCurve3, Quaternion, Vector3, type Object3D } from "three";

export interface CameraShot {
  position: Vector3;
  target: Vector3;
}

/** What a prop is, which decides when it unfolds after the escape pod lands. */
export type DropKind = "dome" | "station" | "decor" | "cable" | "pad";

export interface DropProp {
  readonly object: Object3D;
  readonly kind: DropKind;
}

/** Something that flies in: an object (moved in its parent's space), its engine flame, and where it rests. */
export interface Craft {
  readonly object: Object3D;
  readonly flame: Object3D;
  /** Resting position, in the object's parent space. */
  readonly rest: Vector3;
  /** Where it touches down, on the ground in world space. */
  readonly spot: Vector3;
}

export interface IntroOptions {
  /** The emergency kit that unfolds around the pod once it lands. */
  readonly props: readonly DropProp[];
  /** The crippled rocket that comes down hard beyond the ridge. */
  readonly rocket: Craft;
  /** The escape pod the player rides down to the base. */
  readonly pod: Craft;
  /** Centre of the base (the dome), on the ground. */
  readonly base: Vector3;
  /** The normal gameplay camera the intro hands over to. */
  readonly gameplayShot: CameraShot;
  readonly captions: readonly string[];
  /** Pull the cinematic shots back by this factor (narrow portrait screens need more distance). */
  readonly distanceScale: number;
}

export interface Intro {
  /** Advance the intro; returns the camera shot, or null once it has finished. */
  update(dt: number): CameraShot | null;
  caption(): string | null;
  /** True once the pod has landed, so the astronaut can be shown. */
  landed(): boolean;
  /** Fires on every touchdown with where it hit and whether it was a big crash. */
  onLand(handler: (at: Vector3, heavy: boolean) => void): void;
  /** Fires often while the burning rocket streaks in, for its smoke trail. */
  onTrail(handler: (at: Vector3) => void): void;
  skip(): void;
  done(): boolean;
}

const DURATION = 14;
const CAPTION_TIMES = [0.4, 4.6, 9.6] as const;
const KEY_TIMES = [0, 3.2, 5.8, 8.4, 11.4, 13.6] as const;
/** The rocket streaks in over this window and crashes at its end. */
const ROCKET_START = 0.3;
const ROCKET_IMPACT = 4.6;
/** Where it comes from, relative to the crash site. */
const ROCKET_ORIGIN = new Vector3(30, 32, 28);
/** The pod breaks away from the rocket at this moment and lands at POD_LANDING. */
const POD_RELEASE = 2.2;
const POD_LANDING = 8.4;
const UNFOLD: Readonly<Record<DropKind, number>> = { dome: 8.8, station: 9.4, decor: 9.9, cable: 10.6, pad: 11.1 };
const STAGGER_SECONDS = 0.15;
const GROW_SECONDS = 0.55;
const TRAIL_INTERVAL = 0.05;
const UP = new Vector3(0, 1, 0);

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Overshoot a little, then settle: things unfolding out of the kit. */
function spring(t: number): number {
  const s = 1.6;
  const k = t - 1;
  return 1 + (s + 1) * k * k * k + s * k * k;
}

interface ScheduledProp {
  readonly prop: DropProp;
  readonly finalScale: Vector3;
  readonly at: number;
}

/** Camera keyframes; all stay high and look down so no rock can block the view. */
function keyframes(options: IntroOptions, rocketStart: Vector3): CameraShot[] {
  const base = (x: number, y: number, z: number) => options.base.clone().add(new Vector3(x, y, z));
  const crash = (x: number, y: number, z: number) => options.rocket.spot.clone().add(new Vector3(x, y, z));
  const pod = (x: number, y: number, z: number) => options.pod.spot.clone().add(new Vector3(x, y, z));
  const shots: CameraShot[] = [
    // Low behind the base, looking up at the burning rocket (tracked, see placeCamera).
    { position: base(6, 9, 24), target: rocketStart.clone() },
    { position: base(4, 26, 26), target: crash(4, 6, 6) },
    { position: crash(10, 14, 17), target: crash(0, 1.5, 0) },
    { position: pod(5, 15, 18), target: pod(0, 1, -1) },
    { position: base(6, 15, 17), target: base(-2, 0.6, -2) },
  ];
  for (const shot of shots) shot.position.sub(shot.target).multiplyScalar(options.distanceScale).add(shot.target);
  return [...shots, options.gameplayShot];
}

/** Scripted crash landing: the rocket comes down beyond the ridge, the pod lands, the kit unfolds. */
export function createIntro(options: IntroOptions): Intro {
  let time = 0;
  let trailTimer = 0;
  let podDown = false;
  let rocketDown = false;
  let landHandler: (at: Vector3, heavy: boolean) => void = () => undefined;
  let trailHandler: (at: Vector3) => void = () => undefined;
  const shot: CameraShot = { position: new Vector3(), target: new Vector3() };
  const { rocket, pod } = options;
  const rocketStartLocal = rocket.rest.clone().add(ROCKET_ORIGIN);
  const rocketStartWorld = rocket.spot.clone().add(ROCKET_ORIGIN);
  const shots = keyframes(options, rocketStartWorld);
  const positionCurve = new CatmullRomCurve3(shots.map((s) => s.position), false, "centripetal");
  const targetCurve = new CatmullRomCurve3(shots.map((s) => s.target), false, "centripetal");
  const scratch = new Vector3();
  const velocity = new Vector3();
  const tilt = new Quaternion();
  const podRelease = new Vector3();

  const counts = new Map<DropKind, number>();
  const schedule: ScheduledProp[] = options.props.map((prop) => {
    const index = counts.get(prop.kind) ?? 0;
    counts.set(prop.kind, index + 1);
    return { prop, finalScale: prop.object.scale.clone(), at: UNFOLD[prop.kind] + index * STAGGER_SECONDS };
  });

  /** Where the rocket is (in its parent's space) at time t: a long falling arc ending at its pad. */
  function rocketAt(t: number, out: Vector3): Vector3 {
    const k = Math.min(1, Math.max(0, (t - ROCKET_START) / (ROCKET_IMPACT - ROCKET_START)));
    const across = 1 - (1 - k) ** 1.6;
    const down = k ** 1.8;
    return out.set(
      rocketStartLocal.x + (rocket.rest.x - rocketStartLocal.x) * across,
      rocketStartLocal.y + (rocket.rest.y - rocketStartLocal.y) * down,
      rocketStartLocal.z + (rocket.rest.z - rocketStartLocal.z) * across,
    );
  }

  function placeRocket(dt: number): void {
    const flying = time >= ROCKET_START && time < ROCKET_IMPACT;
    rocket.object.visible = time >= ROCKET_START;
    rocket.flame.visible = flying;
    if (!flying) {
      rocket.object.position.copy(rocket.rest);
      rocket.object.quaternion.identity();
      if (time >= ROCKET_IMPACT && !rocketDown) {
        rocketDown = true;
        landHandler(rocket.spot.clone(), true);
      }
      return;
    }
    rocketAt(time, rocket.object.position);
    // Nose along the direction of travel, swinging upright just before impact.
    rocketAt(time + 0.05, velocity).sub(rocket.object.position).normalize();
    const upright = Math.min(1, Math.max(0, (time - (ROCKET_IMPACT - 0.8)) / 0.8));
    tilt.setFromUnitVectors(UP, velocity.lerp(UP, upright).normalize());
    rocket.object.quaternion.copy(tilt);
    rocket.flame.scale.set(1, 1.2 + Math.random() * 0.6, 1);
    trailTimer -= dt;
    if (trailTimer <= 0) {
      trailTimer = TRAIL_INTERVAL;
      trailHandler(rocket.object.getWorldPosition(scratch));
    }
  }

  function placePod(): void {
    if (time < POD_RELEASE) {
      pod.object.visible = false;
      // Remember where the rocket is: the pod breaks away from there (the pod lives in world space).
      rocket.object.getWorldPosition(podRelease);
      return;
    }
    const k = Math.min(1, (time - POD_RELEASE) / (POD_LANDING - POD_RELEASE));
    const across = 1 - (1 - k) ** 2;
    pod.object.visible = true;
    pod.object.position.set(
      podRelease.x + (pod.rest.x - podRelease.x) * across,
      pod.rest.y + (podRelease.y - pod.rest.y) * (1 - ease(k)),
      podRelease.z + (pod.rest.z - podRelease.z) * across,
    );
    pod.object.rotation.z = (1 - k) * 0.6;
    pod.flame.visible = k > 0.55 && k < 1;
    pod.flame.scale.set(1, 0.8 + Math.random() * 0.4 + (1 - k), 1);
    if (!podDown && k >= 1) {
      podDown = true;
      landHandler(pod.spot.clone(), false);
    }
  }

  function placeProps(): void {
    for (const item of schedule) {
      const k = Math.min(1, Math.max(0, (time - item.at) / GROW_SECONDS));
      item.prop.object.visible = k > 0;
      item.prop.object.scale.copy(item.finalScale).multiplyScalar(Math.max(0.001, k >= 1 ? 1 : spring(k)));
    }
  }

  function placeCamera(): void {
    const last = KEY_TIMES.length - 1;
    let segment = 0;
    while (segment < last - 1 && time > (KEY_TIMES[segment + 1] as number)) segment += 1;
    const from = KEY_TIMES[segment] as number;
    const to = KEY_TIMES[segment + 1] as number;
    const local = ease(Math.min(1, Math.max(0, (time - from) / (to - from))));
    const u = (segment + local) / last;
    positionCurve.getPoint(u, shot.position);
    targetCurve.getPoint(u, shot.target);
    // Keep the falling rocket framed, then let go as the camera turns to the crash site.
    if (segment === 0) shot.target.lerp(rocket.object.getWorldPosition(scratch), 1 - local);
  }

  function finish(): void {
    time = DURATION;
    for (const item of schedule) {
      item.prop.object.visible = true;
      item.prop.object.scale.copy(item.finalScale);
    }
    rocket.object.visible = true;
    rocket.object.position.copy(rocket.rest);
    rocket.object.quaternion.identity();
    rocket.flame.visible = false;
    pod.object.visible = true;
    pod.object.position.copy(pod.rest);
    pod.object.rotation.z = 0;
    pod.flame.visible = false;
    podDown = true;
    rocketDown = true;
  }

  placeRocket(0);
  placePod();
  placeProps();

  return {
    update(dt) {
      if (time >= DURATION) return null;
      time += dt;
      placeRocket(dt);
      placePod();
      placeProps();
      placeCamera();
      if (time >= DURATION) finish();
      return shot;
    },
    caption() {
      if (time >= DURATION - 0.6) return null;
      let current: string | null = null;
      options.captions.forEach((caption, index) => {
        if (time >= (CAPTION_TIMES[Math.min(index, CAPTION_TIMES.length - 1)] as number)) current = caption;
      });
      return current;
    },
    landed: () => podDown,
    onLand(handler) {
      landHandler = handler;
    },
    onTrail(handler) {
      trailHandler = handler;
    },
    skip() {
      if (time < DURATION) finish();
    },
    done: () => time >= DURATION,
  };
}
