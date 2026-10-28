import { Vector3 } from "three";
import type { AudioKit } from "./audio";
import { vibrate } from "./haptics";
import { createIntro, type Intro } from "./intro";
import type { GameState } from "./sim/state";
import type { Effects } from "./view/fx";
import { SHIP_REST_HEIGHT } from "./view/rocket";
import type { LanderModel } from "./view/structures";
import type { WorldView } from "./view/world";

/** Cinematic shots pull back further on portrait screens so the rocket and the base fit. */
const PORTRAIT_INTRO_DISTANCE = 1.7;

export interface IntroSetup {
  readonly state: GameState;
  readonly world: WorldView;
  readonly lander: LanderModel;
  readonly fx: Effects;
  readonly audio: AudioKit;
  /** Offset of the gameplay camera from the player, already zoomed for this screen. */
  readonly cameraOffset: Vector3;
  readonly portrait: boolean;
  shake(amount: number): void;
}

/** The crash-landing cinematic wired to this game's world, effects and sounds. */
export function startIntro({ state, world, lander, fx, audio, cameraOffset, portrait, shake }: IntroSetup): Intro {
  const ground = world.groundAt(state.player);
  const podGround = world.groundAt(state.planet.podSpot);
  const intro = createIntro({
    props: world.introProps(),
    rocket: { object: world.rocket.ship, flame: world.rocket.flame, rest: new Vector3(0, SHIP_REST_HEIGHT, 0), spot: world.groundAt(state.planet.rocket) },
    pod: { object: lander.root, flame: lander.flame, rest: podGround, spot: podGround },
    base: world.groundAt(state.planet.dome),
    gameplayShot: { position: ground.clone().add(cameraOffset), target: ground.clone().add(new Vector3(0, 0.6, 0)) },
    captions: state.planet.arrivalCaptions,
    distanceScale: portrait ? PORTRAIT_INTRO_DISTANCE : 1,
  });
  // Smoke and embers stream off the burning rocket.
  intro.onTrail((at) => {
    fx.dust(at.clone(), 2, 0x4a454e);
    fx.sparks(at.clone(), 0xffa040, 1);
  });
  intro.onLand((at, heavy) => {
    fx.dust(at.clone().add(new Vector3(0, 0.2, 0)), heavy ? 34 : 14, state.planet.palette.dust);
    audio.play(heavy ? "impact" : "thud");
    shake(heavy ? 0.4 : 0.15);
    vibrate(heavy ? 40 : 15);
  });
  return intro;
}
