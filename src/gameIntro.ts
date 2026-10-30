import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, Points, PointsMaterial, Vector3, type PerspectiveCamera, type Scene } from "three";
import type { AudioKit, Cue } from "./audio";
import { vibrate } from "./haptics";
import type { Hud } from "./hud";
import { createIntro, INTRO_CUTS, type IntroBeat } from "./intro";
import { applyPose, clearPose } from "./introPose";
import { mountCutPicker } from "./introReview";
import type { GameState } from "./sim/state";
import type { AstronautModel } from "./view/characters";
import type { Effects } from "./view/fx";
import type { RenderPipeline } from "./view/render";
import { createSpaceSet } from "./view/spaceSet";
import { EARTH_POSITION } from "./view/terrain";
import { softTexture } from "./view/textures";
import type { WorldView } from "./view/world";

/** Cinematic shots pull back a little on portrait screens; the lens widening does the rest. */
const PORTRAIT_INTRO_DISTANCE = 1.2;
/** Shots are framed for a 16:9 screen; narrower screens widen the lens to keep the same width in view, up to this. */
const DESIGN_ASPECT = 16 / 9;
const MAX_LENS = 84;
/** The intro's wide shots see through most of the everyday haze. */
const INTRO_HAZE = 0.4;
/** The astronaut comes round a couple of steps from the pod. */
const HERO_FROM_POD = new Vector3(-0.7, 0, 2.3);
const DUST_MOTES = 70;
const WORLD_UP = new Vector3(0, 1, 0);
/** The rocket cruises this way in orbit. */
const ORBIT_TRAVEL = new Vector3(1, 0, 0);
/** Inside the pod a jolt snaps the head round rather than throwing the eye across the cabin. */
const INSIDE_JOLT_MOVE = 0.04;
const INSIDE_JOLT_TURN = 0.06;
/** Space is big: the orbit set needs a far longer view than the base. */
const SPACE_FAR = 2600;
const POD_SMOKE_SECONDS = 0.12;
const SHAKE_DECAY = 2.2;

/** The lens that shows at least as much width on this screen as `fov` shows on a 16:9 one. */
function fitLens(fov: number, aspect: number, widen: number): number {
  if (aspect >= DESIGN_ASPECT || widen <= 0) return fov;
  const halfWidth = Math.tan((fov * Math.PI) / 360) * DESIGN_ASPECT;
  const fitted = Math.min(MAX_LENS, (Math.atan(halfWidth / aspect) * 360) / Math.PI);
  return fov + (Math.max(fov, fitted) - fov) * widen;
}

/** Fine dust still settling after the landing, drifting past the visor in the first-person shot. */
function dustMotes(scene: Scene): { update(eyes: Vector3, dt: number, on: boolean): void; dispose(): void } {
  const positions = new Float32Array(DUST_MOTES * 3);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  const map = softTexture("intro-mote", 32, 32, (ctx) => {
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
  });
  const material = new PointsMaterial({ map, color: 0xd8d2c8, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending });
  const motes = new Points(geometry, material);
  motes.frustumCulled = false;
  motes.visible = false;
  scene.add(motes);
  const drift = Array.from({ length: DUST_MOTES }, () => new Vector3((Math.random() - 0.5) * 0.06, -0.04 - Math.random() * 0.08, (Math.random() - 0.5) * 0.06));
  let placed = false;
  return {
    update(eyes, dt, on) {
      motes.visible = on;
      if (!on) return;
      for (let i = 0; i < DUST_MOTES; i += 1) {
        const out = !placed || positions[i * 3 + 1]! < eyes.y - 0.6;
        if (out) {
          // A loose cloud around the head, a little above it, settling slowly.
          positions.set([eyes.x + (Math.random() - 0.5) * 2.4, eyes.y + Math.random() * 1.2 - (placed ? -0.6 : 0.3), eyes.z + (Math.random() - 0.5) * 2.4], i * 3);
          continue;
        }
        positions[i * 3] = positions[i * 3]! + drift[i]!.x * dt;
        positions[i * 3 + 1] = positions[i * 3 + 1]! + drift[i]!.y * dt;
        positions[i * 3 + 2] = positions[i * 3 + 2]! + drift[i]!.z * dt;
      }
      placed = true;
      geometry.attributes.position!.needsUpdate = true;
    },
    dispose() {
      scene.remove(motes);
      geometry.dispose();
      material.dispose();
    },
  };
}

export interface IntroSetup {
  readonly state: GameState;
  /** The base's scene, for effects that live only in the intro. */
  readonly scene: Scene;
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
  /** Review mode: the intro never hands over to the game, and a bar of buttons replays single cuts. */
  readonly review: boolean;
}

export interface IntroDirector {
  /** Advance and frame the intro; false once it is over. */
  update(dt: number): boolean;
  /** Lay the astronaut down or raise them up; call after the player view has synced. */
  poseHero(): void;
  skip(): void;
  done(): boolean;
}

const BEATS: Readonly<Record<IntroBeat, { cues: readonly Cue[]; shake: number; buzz: number | number[] }>> = {
  cruise: { cues: ["rumble"], shake: 0, buzz: 0 },
  calm: { cues: ["breath"], shake: 0, buzz: 0 },
  warn: { cues: ["warning", "crackle"], shake: 0.02, buzz: 15 },
  alarm: { cues: ["alarm", "warning"], shake: 0.04, buzz: [20, 40, 20] },
  pulse: { cues: ["heartbeat"], shake: 0, buzz: 0 },
  blast: { cues: ["boom", "impact"], shake: 0.9, buzz: [80, 30, 140] },
  eject: { cues: ["pyro"], shake: 0.5, buzz: 40 },
  thrusters: { cues: ["rcs"], shake: 0.15, buzz: 15 },
  steady: { cues: ["rcs"], shake: 0.1, buzz: 10 },
  swing: { cues: ["rcs"], shake: 0.08, buzz: 10 },
  ignite: { cues: ["launch"], shake: 0.08, buzz: 20 },
  strain: { cues: ["creak"], shake: 0.12, buzz: 20 },
  impact: { cues: ["explosion", "thud"], shake: 0.9, buzz: 160 },
  heartbeat: { cues: ["heartbeat"], shake: 0, buzz: [30, 120, 30] },
  breath: { cues: ["breath"], shake: 0, buzz: 0 },
  wake: { cues: [], shake: 0, buzz: 0 },
};

/** The orbit-to-wake-up cinematic wired to this game's camera, scenes, HUD, effects and sounds. */
export function startIntro({ state, scene, world, pipeline, camera, hero, fx, hud, audio, cameraOffset, portrait, review }: IntroSetup): IntroDirector {
  const space = createSpaceSet();
  pipeline.applyReflections(space.scene);
  const pod = world.groundAt(state.planet.podSpot);
  // The astronaut starts where they wake up, so gameplay picks up right there.
  state.player.x = state.planet.podSpot.x + HERO_FROM_POD.x;
  state.player.z = state.planet.podSpot.z + HERO_FROM_POD.z;
  const heroSpot = world.groundAt(state.player);
  const groundFar = camera.far;
  const groundExposure = pipeline.renderer.toneMappingExposure;
  const gameplayFov = camera.fov;
  const intro = createIntro({
    space,
    travel: ORBIT_TRAVEL,
    props: world.introProps(),
    hero: heroSpot,
    pod,
    skyMark: EARTH_POSITION,
    gameplayShot: { position: heroSpot.clone().add(cameraOffset), target: heroSpot.clone().add(new Vector3(0, 0.6, 0)) },
    gameplayFov,
    captions: state.planet.arrivalCaptions,
    distanceScale: portrait ? PORTRAIT_INTRO_DISTANCE : 1,
  });
  let shake = 0;
  let smokeTimer = 0;
  let where: "space" | "ground" | null = null;
  // Where the crashed rocket lies stays a mystery until the player goes looking: no shot shows it,
  // and its smoke column is held back until the intro hands over.
  world.rocket.root.visible = false;
  const motes = dustMotes(scene);
  // In review the intro holds on its last frame instead of handing over to the game.
  const reviewEnd = INTRO_CUTS[INTRO_CUTS.length - 1]?.to ?? 0;
  let reviewCut: number | null = null;
  const picker = review
    ? mountCutPicker(INTRO_CUTS, {
        play(cut) {
          audio.unlock();
          reviewCut = cut;
          const range = cut === null ? { from: 0, to: reviewEnd } : INTRO_CUTS[cut];
          if (!range) return;
          shake = 0;
          intro.seek(range.from, range.to);
        },
        now: () => ({ cut: reviewCut, seconds: intro.storyTime() }),
      })
    : null;
  if (review) intro.seek(0, reviewEnd);
  intro.onBeat((beat) => {
    const { cues, shake: amount, buzz } = BEATS[beat];
    for (const cue of cues) audio.play(cue);
    shake = Math.max(shake, amount);
    if (buzz) vibrate(buzz);
  });

  function show(next: "space" | "ground"): void {
    if (next === where) return;
    where = next;
    pipeline.setScene(next === "space" ? space.scene : null);
    camera.far = next === "space" ? SPACE_FAR : groundFar;
    camera.updateProjectionMatrix();
  }

  function wrapUp(): void {
    show("ground");
    hud.setIntroEyes(1, 0);
    hud.setIntroFade(0, 0);
    hud.setIntroAlarm(0);
    hud.setIntroVisor(false);
    world.storm.setClarity(1);
    camera.fov = gameplayFov;
    camera.up.copy(WORLD_UP);
    camera.updateProjectionMatrix();
    pipeline.renderer.toneMappingExposure = groundExposure;
    pipeline.setGlare();
    world.rocket.root.visible = true;
    motes.dispose();
    clearPose(hero);
  }

  // From the very first frame the screen is black over the orbit set, never a glimpse of the base.
  show("space");
  hud.setIntroFade(1, 0);

  return {
    update(dt) {
      if (intro.done()) return false;
      const frame = intro.update(dt);
      picker?.update();
      hud.setIntroCaption(intro.caption());
      const eyes = intro.eyes();
      hud.setIntroEyes(eyes.open, eyes.blur);
      const fade = intro.fade();
      hud.setIntroFade(fade.black, fade.white);
      hud.setIntroAlarm(intro.alarm());
      hud.setIntroVisor(intro.visor(), intro.visorFog(), intro.readout(), intro.visorCracked());
      world.storm.setClarity(INTRO_HAZE);
      if (frame) {
        show(frame.where);
        pipeline.renderer.toneMappingExposure = groundExposure * frame.exposure;
        pipeline.setGlare(frame.glare);
        camera.up.copy(frame.up ?? WORLD_UP);
        shake = Math.max(0, shake - dt * SHAKE_DECAY);
        const jolt = shake * shake;
        const move = frame.inside ? jolt * INSIDE_JOLT_MOVE : jolt;
        camera.position.copy(frame.shot.position).add(new Vector3((Math.random() - 0.5) * move, (Math.random() - 0.5) * move, (Math.random() - 0.5) * move * 0.5));
        camera.lookAt(frame.shot.target);
        camera.rotateZ(frame.roll + (Math.random() - 0.5) * jolt * 0.04);
        if (frame.inside) {
          camera.rotateX((Math.random() - 0.5) * jolt * INSIDE_JOLT_TURN);
          camera.rotateY((Math.random() - 0.5) * jolt * INSIDE_JOLT_TURN);
        }
        const lens = fitLens(frame.fov, camera.aspect, frame.widen);
        if (camera.fov !== lens) {
          camera.fov = lens;
          camera.updateProjectionMatrix();
        }
      }
      motes.update(camera.position, dt, intro.visor());
      // Smoke curls from the pod while the astronaut comes round.
      smokeTimer -= dt;
      if (frame?.where === "ground" && intro.podSmoking() && smokeTimer <= 0) {
        smokeTimer = POD_SMOKE_SECONDS;
        fx.dust(pod.clone().add(new Vector3((Math.random() - 0.5) * 0.6, 1.6 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6)), 2, 0x8a8592);
      }
      if (intro.done()) {
        wrapUp();
        return false;
      }
      return true;
    },
    poseHero() {
      const now = intro.heroPose();
      hero.root.visible = now !== null;
      if (!now) return;
      // The game's own heading for the player, which the astronaut turns round to by the hand-over.
      const playYaw = hero.root.rotation.y;
      const swing = Math.atan2(Math.sin(playYaw - now.faceYaw), Math.cos(playYaw - now.faceYaw));
      applyPose(hero, now.pose, heroSpot, now.faceYaw + swing * now.turn);
      // A small shuffle of the feet while turning on the spot.
      hero.legs[0].rotation.x += now.shuffle * 0.25;
      hero.legs[1].rotation.x -= now.shuffle * 0.25;
    },
    skip() {
      if (review) return;
      intro.skip();
      wrapUp();
    },
    done: () => intro.done(),
  };
}
