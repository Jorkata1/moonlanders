import { CatmullRomCurve3, ConeGeometry, Mesh, Vector3, type Object3D, type Scene } from "three";
import { glow } from "./view/materials";
import { CARRIER, carrierAt, mothershipModel } from "./view/mothership";
import type { LanderModel } from "./view/structures";

export interface CameraShot {
  position: Vector3;
  target: Vector3;
}

/** What a prop is, which decides when it lands and how it arrives. */
export type DropKind = "dome" | "rocket" | "trader" | "decor" | "cable" | "pad";

export interface DropProp {
  readonly object: Object3D;
  readonly kind: DropKind;
}

export interface IntroOptions {
  readonly scene: Scene;
  readonly props: readonly DropProp[];
  readonly lander: LanderModel;
  /** Where the pod touches down, on the ground. */
  readonly podSpot: Vector3;
  /** Centre of the base (the dome), on the ground. */
  readonly base: Vector3;
  /** The normal gameplay camera the intro hands over to. */
  readonly gameplayShot: CameraShot;
  readonly captions: readonly string[];
  /** The full opening (orbit, mothership) on the first planet; a shorter arrival elsewhere. */
  readonly full: boolean;
  /** Pull the cinematic shots back by this factor (narrow portrait screens need more distance). */
  readonly distanceScale: number;
}

export interface Intro {
  /** Advance the intro; returns the camera shot, or null once it has finished. */
  update(dt: number): CameraShot | null;
  caption(): string | null;
  /** True once the pod has landed, so the astronaut can be shown. */
  landed(): boolean;
  /** Fires on every touchdown with where it hit and whether it was a big piece. */
  onLand(handler: (at: Vector3, heavy: boolean) => void): void;
  skip(): void;
  done(): boolean;
}

interface Timing {
  readonly duration: number;
  readonly podTouchdown: number;
  readonly fallSeconds: number;
  readonly dropHeight: number;
  /** Touchdown time of the first prop of each kind; later ones of a kind follow a little after. */
  readonly touchdown: Readonly<Record<DropKind, number>>;
  readonly captionTimes: readonly number[];
  /** Camera keyframe times; the last one is the gameplay shot. */
  readonly keyTimes: readonly number[];
}

const FULL: Timing = {
  duration: 14,
  podTouchdown: 9.8,
  fallSeconds: 1.4,
  dropHeight: 30,
  touchdown: { dome: 4.0, rocket: 5.0, trader: 6.1, decor: 7.0, cable: 8.8, pad: 10.6 },
  captionTimes: [0.4, 4.4, 9.9],
  keyTimes: [0, 3.2, 6.4, 9.6, 12.8],
};

const ARRIVAL: Timing = {
  duration: 10.5,
  podTouchdown: 6.6,
  fallSeconds: 1.1,
  dropHeight: 24,
  touchdown: { dome: 1.8, rocket: 2.6, trader: 3.5, decor: 4.2, cable: 5.6, pad: 7.2 },
  captionTimes: [0.3, 3.2, 6.8],
  keyTimes: [0, 3.5, 6.4, 9.4],
};

/** Kinds that grow in place instead of dropping from the sky. */
const GROW_KINDS: ReadonlySet<DropKind> = new Set(["cable", "pad"]);
const HEAVY_KINDS: ReadonlySet<DropKind> = new Set(["dome", "rocket", "trader"]);
const STAGGER_SECONDS = 0.18;
const GROW_SECONDS = 0.45;
const BOUNCE_SECONDS = 0.35;
const RETRO_FROM = 0.55;

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

interface ScheduledProp {
  readonly prop: DropProp;
  /** Where the prop leaves the carrier, or null when it falls straight down from high above. */
  release: Vector3 | null;
  readonly final: Vector3;
  readonly finalScale: Vector3;
  readonly touchdown: number;
  flame: Mesh | null;
  landed: boolean;
}

/** Camera keyframes around the base; all stay high and look down so no rock can block the view. */
function keyframes(base: Vector3, full: boolean, gameplay: CameraShot, distanceScale: number): CameraShot[] {
  const at = (x: number, y: number, z: number) => base.clone().add(new Vector3(x, y, z));
  const opening: CameraShot[] = full
    ? [
        // Opening: level with the carrier, which the camera tracks (see placeCamera), stars above the horizon.
        { position: at(-6, 33, 26), target: carrierAt(base, 0, new Vector3()) },
        // High above the base (never past the edge mountains) so the carrier and the ground share the frame.
        { position: at(-8, 38, 24), target: at(-4, 14, -6) },
      ]
    : [{ position: at(-16, 30, 30), target: at(0, 2, -6) }];
  const shots = [...opening, { position: at(10, 23, 25), target: at(0, 0, -6) }, { position: at(5, 16, 17), target: at(0, 0.5, -1) }];
  for (const shot of shots) shot.position.sub(shot.target).multiplyScalar(distanceScale).add(shot.target);
  return [...shots, gameplay];
}

/** Scripted arrival: a carrier drops the base piece by piece, then the player's pod lands. */
export function createIntro(options: IntroOptions): Intro {
  const timing = options.full ? FULL : ARRIVAL;
  let time = 0;
  let touchedDown = false;
  let landHandler: (at: Vector3, heavy: boolean) => void = () => undefined;
  const shot: CameraShot = { position: new Vector3(), target: new Vector3() };
  const shots = keyframes(options.base, options.full, options.gameplayShot, options.distanceScale);
  const positionCurve = new CatmullRomCurve3(shots.map((s) => s.position), false, "centripetal");
  const targetCurve = new CatmullRomCurve3(shots.map((s) => s.target), false, "centripetal");
  const flameGeometry = new ConeGeometry(0.6, 1.6, 12, 1, true);
  const flameMaterial = glow(0xffa040, 4);
  const lander = options.lander;
  const landing = options.podSpot.clone();
  const scratch = new Vector3();

  const counts = new Map<DropKind, number>();
  const schedule: ScheduledProp[] = options.props.map((prop) => {
    const index = counts.get(prop.kind) ?? 0;
    counts.set(prop.kind, index + 1);
    return { prop, release: null, final: prop.object.position.clone(), finalScale: prop.object.scale.clone(), touchdown: timing.touchdown[prop.kind] + index * STAGGER_SECONDS, flame: null, landed: false };
  });

  const mothership = options.full ? mothershipModel() : null;
  if (mothership) {
    options.scene.add(mothership.root);
  }

  const shipAt = (t: number, out: Vector3): Vector3 => carrierAt(options.base, t, out);

  // Dropped props leave from the carrier's bay at the moment they start to fall.
  if (mothership) {
    for (const item of schedule) {
      if (GROW_KINDS.has(item.prop.kind)) continue;
      item.release = shipAt(item.touchdown - timing.fallSeconds, new Vector3()).add(new Vector3(0, -CARRIER.bayDrop, 0));
    }
  }

  function placeMothership(): void {
    if (!mothership) return;
    shipAt(time, mothership.root.position);
    // A gentle bank as it slows over the base.
    mothership.root.rotation.set(0, 0, Math.sin(time * 0.5) * 0.03);
    mothership.root.visible = time < CARRIER.passSeconds + 1.5;
  }

  function clearFlame(item: ScheduledProp): void {
    if (!item.flame) return;
    item.flame.removeFromParent();
    item.flame = null;
  }

  function finish(item: ScheduledProp): void {
    clearFlame(item);
    item.prop.object.visible = true;
    item.prop.object.position.copy(item.final);
    item.prop.object.scale.copy(item.finalScale);
  }

  function placeProp(item: ScheduledProp): void {
    const { object, kind } = item.prop;
    if (GROW_KINDS.has(kind)) {
      const k = Math.min(1, Math.max(0, (time - item.touchdown) / GROW_SECONDS));
      object.scale.copy(item.finalScale).multiplyScalar(Math.max(0.001, ease(k)));
      return;
    }
    const start = item.touchdown - timing.fallSeconds;
    object.visible = time >= start;
    if (time < start) return;
    if (time < item.touchdown) {
      const k = (time - start) / timing.fallSeconds;
      if (item.release) {
        // Drift out from under the carrier and fall faster and faster, braking only at the very end.
        const across = 1 - (1 - k) ** 2;
        object.position.set(
          item.release.x + (item.final.x - item.release.x) * across,
          item.final.y + (item.release.y - item.final.y) * (1 - k ** 1.6),
          item.release.z + (item.final.z - item.release.z) * across,
        );
      } else {
        object.position.set(item.final.x, item.final.y + timing.dropHeight * (1 - k) ** 2, item.final.z);
      }
      object.scale.copy(item.finalScale);
      if (k > RETRO_FROM && !item.flame) {
        item.flame = new Mesh(flameGeometry, flameMaterial);
        item.flame.rotation.x = Math.PI;
        item.flame.position.y = -0.7;
        object.add(item.flame);
      }
      if (item.flame) item.flame.scale.set(1, 0.7 + Math.random() * 0.5, 1);
      return;
    }
    if (!item.landed) {
      item.landed = true;
      clearFlame(item);
      landHandler(item.final.clone(), HEAVY_KINDS.has(kind));
    }
    // Squash on touchdown, then spring back.
    const b = Math.min(1, (time - item.touchdown) / BOUNCE_SECONDS);
    object.position.copy(item.final);
    object.scale.set(item.finalScale.x * (1 + Math.sin(b * Math.PI) * 0.08), item.finalScale.y * (1 - Math.sin(b * Math.PI) * 0.14), item.finalScale.z * (1 + Math.sin(b * Math.PI) * 0.08));
  }

  function placeLander(): void {
    const start = timing.podTouchdown - timing.fallSeconds * 1.6;
    const k = Math.min(1, Math.max(0, (time - start) / (timing.fallSeconds * 1.6)));
    lander.root.visible = time >= start;
    lander.root.position.set(landing.x + (1 - k) * 3, landing.y + timing.dropHeight * (1 - ease(k)) ** 1.4, landing.z - (1 - k) * 2);
    lander.root.rotation.z = (1 - k) * 0.25;
    lander.flame.visible = time >= start && k < 1;
    lander.flame.scale.set(1, 0.8 + Math.random() * 0.4 + (1 - k), 1);
    if (!touchedDown && k >= 1) {
      touchedDown = true;
      landHandler(landing.clone(), false);
    }
  }

  function placeCamera(): void {
    const keys = timing.keyTimes;
    const last = keys.length - 1;
    let segment = 0;
    while (segment < last - 1 && time > (keys[segment + 1] as number)) segment += 1;
    const from = keys[segment] as number;
    const to = keys[segment + 1] as number;
    const local = ease(Math.min(1, Math.max(0, (time - from) / (to - from))));
    const u = (segment + local) / last;
    positionCurve.getPoint(u, shot.position);
    targetCurve.getPoint(u, shot.target);
    // While the carrier is the subject, keep it framed, then let go as the camera tips down to the base.
    if (mothership && segment === 0) shot.target.lerp(shipAt(time, scratch), 1 - local);
  }

  function cleanUp(): void {
    for (const item of schedule) finish(item);
    mothership?.root.removeFromParent();
    flameGeometry.dispose();
  }

  for (const item of schedule) placeProp(item);
  placeLander();

  return {
    update(dt) {
      if (time >= timing.duration) return null;
      time += dt;
      placeMothership();
      for (const item of schedule) placeProp(item);
      placeLander();
      placeCamera();
      if (time >= timing.duration) cleanUp();
      return shot;
    },
    caption() {
      let current: string | null = null;
      options.captions.forEach((caption, index) => {
        const at = timing.captionTimes[index] ?? timing.captionTimes[timing.captionTimes.length - 1] ?? 0;
        if (time >= at) current = caption;
      });
      return time >= timing.duration - 0.6 ? null : current;
    },
    landed: () => touchedDown,
    onLand(handler) {
      landHandler = handler;
    },
    skip() {
      if (time >= timing.duration) return;
      time = timing.duration;
      cleanUp();
      touchedDown = true;
      lander.root.visible = true;
      lander.root.position.copy(landing);
      lander.root.rotation.z = 0;
      lander.flame.visible = false;
    },
    done: () => time >= timing.duration,
  };
}
