import { Vector3, type PerspectiveCamera } from "three";
import type { AudioKit } from "./audio";
import { vibrate } from "./haptics";
import type { Hud } from "./hud";
import { createIntro, type IntroBeat } from "./intro";
import type { GameState } from "./sim/state";
import type { AstronautModel } from "./view/characters";
import type { Effects } from "./view/fx";
import type { RenderPipeline } from "./view/render";
import { createSpaceSet } from "./view/spaceSet";
import type { WorldView } from "./view/world";

/** Cinematic shots pull back further on portrait screens so the rocket and the base fit. */
const PORTRAIT_INTRO_DISTANCE = 1.6;
/** The intro's wide shots see through most of the everyday haze. */
const INTRO_HAZE = 0.4;
/** The astronaut wakes up a step from the pod. */
const HERO_FROM_POD = new Vector3(1.3, 0, 1.0);
const POD_SMOKE_SECONDS = 0.14;
const SHAKE_DECAY = 2.5;

export interface IntroSetup {
  readonly state: GameState;
  readonly world: WorldView;
  readonly pipeline: RenderPipeline;
  readonly camera: PerspectiveCamera;
  readonly hero: AstronautModel;
  readonly fx: Effects;
  readonly hud: Hud;
  readonly audio: AudioKit;
  /** Offset of the gameplay camera from the player, already zoomed for this screen. */
  readonly cameraOffset: Vector3;
  readonly portrait: boolean;
}

export interface IntroDirector {
  /** Advance and frame the intro; false once it is over. */
  update(dt: number): boolean;
  /** Lay the astronaut down or raise them up; call after the player view has synced. */
  poseHero(): void;
  skip(): void;
  done(): boolean;
}

const BEATS: Readonly<Record<IntroBeat, { cue: "alarm" | "impact" | "launch" | "thud" | null; shake: number; buzz: number | number[] }>> = {
  spark: { cue: "alarm", shake: 0.03, buzz: 15 },
  blast: { cue: "impact", shake: 0.35, buzz: [60, 30, 90] },
  eject: { cue: "launch", shake: 0.15, buzz: 30 },
  impact: { cue: "thud", shake: 0.5, buzz: 120 },
  wake: { cue: null, shake: 0, buzz: 0 },
};

/** The orbit-to-wake-up cinematic wired to this game's camera, scenes, HUD, effects and sounds. */
export function startIntro({ state, world, pipeline, camera, hero, fx, hud, audio, cameraOffset, portrait }: IntroSetup): IntroDirector {
  const space = createSpaceSet();
  pipeline.applyReflections(space.scene);
  const pod = world.groundAt(state.planet.podSpot);
  // The astronaut starts where they wake up, so gameplay picks up right there.
  state.player.x = state.planet.podSpot.x + HERO_FROM_POD.x;
  state.player.z = state.planet.podSpot.z + HERO_FROM_POD.z;
  const heroSpot = world.groundAt(state.player);
  const intro = createIntro({
    space,
    props: world.introProps(),
    hero: heroSpot,
    base: world.groundAt(state.planet.dome),
    crash: world.groundAt(state.planet.rocket),
    gameplayShot: { position: heroSpot.clone().add(cameraOffset), target: heroSpot.clone().add(new Vector3(0, 0.6, 0)) },
    captions: state.planet.arrivalCaptions,
    distanceScale: portrait ? PORTRAIT_INTRO_DISTANCE : 1,
  });
  let shake = 0;
  let smokeTimer = 0;
  let where: "space" | "ground" | null = null;
  intro.onBeat((beat) => {
    const { cue, shake: amount, buzz } = BEATS[beat];
    if (cue) audio.play(cue);
    shake = Math.max(shake, amount);
    if (buzz) vibrate(buzz);
  });

  function show(next: "space" | "ground"): void {
    if (next === where) return;
    where = next;
    pipeline.setScene(next === "space" ? space.scene : null);
  }

  function wrapUp(): void {
    show("ground");
    hud.setIntroEyes(1, 0);
    world.storm.setClarity(1);
  }

  return {
    update(dt) {
      if (intro.done()) return false;
      const frame = intro.update(dt);
      hud.setIntroCaption(intro.caption());
      const eyes = intro.eyes();
      hud.setIntroEyes(eyes.open, eyes.blur);
      world.storm.setClarity(INTRO_HAZE);
      if (frame) {
        show(frame.where);
        shake = Math.max(0, shake - dt * SHAKE_DECAY);
        camera.position.copy(frame.shot.position).add(new Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
        camera.lookAt(frame.shot.target);
      }
      // Smoke curls from the pod while the astronaut comes round.
      smokeTimer -= dt;
      if (frame?.where === "ground" && (intro.heroRise() ?? 1) < 1 && smokeTimer <= 0) {
        smokeTimer = POD_SMOKE_SECONDS;
        fx.dust(pod.clone().add(new Vector3(0, 1.9, 0)), 2, 0x8a8592);
      }
      if (intro.done()) {
        wrapUp();
        return false;
      }
      return true;
    },
    poseHero() {
      const rise = intro.heroRise();
      hero.root.visible = rise !== null;
      // Lying on their back, then sitting up and standing.
      hero.root.rotation.x = rise === null ? 0 : -(1 - rise) * Math.PI * 0.47;
      if (rise === null || rise >= 1) return;
      hero.root.position.y += (1 - rise) * 0.3;
    },
    skip() {
      intro.skip();
      wrapUp();
    },
    done: () => intro.done(),
  };
}
