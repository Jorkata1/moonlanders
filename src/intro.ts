import { Vector3 } from "three";
import type { Point } from "./planets/types";
import type { LanderModel } from "./view/structures";

export interface CameraShot {
  position: Vector3;
  target: Vector3;
}

export interface IntroCue {
  /** Seconds from the start of the intro. */
  at: number;
  caption: string | null;
}

const DURATION = 12;
const TOUCHDOWN = 7.6;
const DROP_HEIGHT = 34;
const CUES: IntroCue[] = [
  { at: 0.4, caption: "Year 2187. Your scout pod is running on fumes." },
  { at: 3.8, caption: "The only way home is forward: rebuild a rocket and hop from world to world." },
  { at: 8.2, caption: "First stop, the Moon. Mine it, build on it, and get off this rock, pioneer." },
];

export interface Intro {
  /** Advance the intro; returns the camera shot, or null once it has finished. */
  update(dt: number): CameraShot | null;
  caption(): string | null;
  /** True once the pod has landed, so the astronaut can be shown. */
  landed(): boolean;
  /** The moment the pod touches down, for dust and sound. */
  onTouchdown(handler: () => void): void;
  skip(): void;
  done(): boolean;
}

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Scripted opening: the pod falls out of the stars and lands inside the dome. */
export function createIntro(lander: LanderModel, pad: Point, groundY: number, gameplayOffset: Vector3): Intro {
  let time = 0;
  let touchedDown = false;
  let touchdownHandler: () => void = () => undefined;
  const landing = new Vector3(pad.x, groundY, pad.z);
  const shot: CameraShot = { position: new Vector3(), target: new Vector3() };

  function placeLander(): void {
    const t = Math.min(1, time / TOUCHDOWN);
    const height = DROP_HEIGHT * (1 - ease(t)) ** 1.2;
    lander.root.position.set(landing.x + (1 - t) * 4, groundY + height, landing.z - (1 - t) * 3);
    lander.root.rotation.z = (1 - t) * 0.25;
    lander.flame.visible = t < 1;
    lander.flame.scale.set(1, 0.8 + Math.random() * 0.4 + (1 - t), 1);
  }

  return {
    update(dt) {
      if (time >= DURATION) return null;
      time += dt;
      placeLander();
      if (!touchedDown && time >= TOUCHDOWN) {
        touchedDown = true;
        touchdownHandler();
      }
      const pod = lander.root.position;
      if (time < 3.8) {
        // High, slow orbit over the base while the pod is a speck in the sky.
        const angle = 0.6 + time * 0.08;
        shot.position.set(landing.x + Math.sin(angle) * 26, groundY + 24, landing.z + Math.cos(angle) * 26);
        shot.target.copy(landing).add(new Vector3(0, 2, 0));
      } else if (time < TOUCHDOWN + 0.6) {
        // Low chase shot of the falling pod.
        const k = ease(Math.min(1, (time - 3.8) / 1.5));
        const chase = new Vector3(landing.x + 9, groundY + 4, landing.z + 11);
        shot.position.lerp(chase, Math.min(1, dt * 2 + k * 0.05));
        shot.target.lerp(pod.clone().add(new Vector3(0, 1, 0)), Math.min(1, dt * 4));
      } else {
        // Settle into the normal gameplay camera.
        const k = ease(Math.min(1, (time - TOUCHDOWN - 0.6) / 2.6));
        const end = landing.clone().add(gameplayOffset);
        shot.position.lerp(end, Math.min(1, dt * 1.5 + k * 0.08));
        shot.target.lerp(landing.clone().add(new Vector3(0, 0.6, 0)), Math.min(1, dt * 2 + k * 0.08));
      }
      return shot;
    },
    caption() {
      let current: string | null = null;
      for (const cue of CUES) if (time >= cue.at) current = cue.caption;
      return time >= DURATION - 0.6 ? null : current;
    },
    landed: () => touchedDown,
    onTouchdown(handler) {
      touchdownHandler = handler;
    },
    skip() {
      time = DURATION;
      if (!touchedDown) {
        touchedDown = true;
        placeLander();
        lander.root.position.copy(landing);
        lander.root.rotation.z = 0;
        lander.flame.visible = false;
      }
    },
    done: () => time >= DURATION,
  };
}
