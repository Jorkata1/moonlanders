import { PerspectiveCamera, Scene, Vector3 } from "three";
import type { AudioKit } from "./audio";
import { BOOST, PADS, type ItemId } from "./config";
import { followShot, launchShot } from "./camera";
import { createFeedback } from "./feedback";
import type { Hud } from "./hud";
import { activePanel, buyFromPanel, toggleFromPanel } from "./panels";
import type { MoveControls } from "./input";
import { vibrate } from "./haptics";
import { createIntro, type Intro } from "./intro";
import type { Quality } from "./quality";
import { dropItems } from "./sim/inventory";
import { step } from "./sim/step";
import type { GameState } from "./sim/state";
import { createGuidance } from "./guidance";
import type { TipId } from "./tutorial";
import { createPlayerView, createRobotsView } from "./view/actors";
import { createDronesView } from "./view/drones";
import { createEffects } from "./view/fx";
import { ItemPool } from "./view/items";
import { createRenderPipeline, disposeScene, enableShadows } from "./view/render";
import { landerModel } from "./view/structures";
import { buildWorld } from "./view/world";

const MAX_FRAME_SECONDS = 0.1;
const CAMERA_OFFSET = new Vector3(0, 11.5, 8.2);
const PORTRAIT_ZOOM = 1.45;
/** Cinematic shots pull back further on portrait screens so the carrier and the base fit. */
const PORTRAIT_INTRO_DISTANCE = 1.7;
/** How far the camera aims past the player while a bottom-sheet panel is open on a small screen. */
const PANEL_LIFT = 2.4;
const COMPACT_QUERY = "(max-width: 760px), (max-height: 480px)";
const LAUNCH_SECONDS = 4.2;
const LAUNCH_DONE = -2;
const POD_OFFSET = { x: 1.6, z: -0.9 } as const;

export interface GameOptions {
  playIntro: boolean;
  /** The long opening with the orbiting carrier; later planets get a shorter arrival. */
  fullIntro: boolean;
  tutorialDone: boolean;
  seenTips: ReadonlySet<string>;
  touch: boolean;
}

export interface GameCallbacks {
  onSave(): void;
  onLaunched(): void;
  onIntroDone(): void;
  onTutorialDone(): void;
  onTipSeen(id: TipId): void;
}

export interface Game {
  setRunning(running: boolean): void;
  buy(key: string, id: string): void;
  /** Flip the on/off switch of the open panel (drones). */
  toggle(key: string): void;
  drop(item: ItemId): void;
  /** Drop everything of the type on top of the backpack (keyboard shortcut). */
  dropTop(): void;
  requestTurbo(showAd: () => Promise<boolean>): Promise<void>;
  skipIntro(): void;
  acknowledgeCoach(): void;
  readonly inIntro: () => boolean;
  /** Stop the loop and free the scene so the next planet can take over the canvas. */
  dispose(): void;
}

export function createGame(canvas: HTMLCanvasElement, state: GameState, quality: Quality, controls: MoveControls, hud: Hud, audio: AudioKit, options: GameOptions, callbacks: GameCallbacks): Game {
  const scene = new Scene();
  const camera = new PerspectiveCamera(45, 1, 0.1, 400);
  const pipeline = createRenderPipeline(canvas, scene, camera, quality);
  const pool = new ItemPool();
  const world = buildWorld(scene, state, pool, quality.shadowLights > 0 ? quality.shadowMapSize : 0);
  const fx = createEffects(scene, pool);
  const playerView = createPlayerView(scene, pool, fx);
  const robots = createRobotsView(scene, pool, state.planet, fx);
  const drones = createDronesView(scene, pool, state.planet);
  world.onMachineIntake((at, color) => fx.sparks(at, color, quality.tier === "low" ? 2 : 5));
  const podSpot = { x: state.planet.dome.x + POD_OFFSET.x, z: state.planet.dome.z + POD_OFFSET.z };
  const lander = landerModel();
  lander.root.position.copy(world.groundAt(podSpot));
  scene.add(lander.root);
  enableShadows(scene);
  pipeline.applyReflections(scene);

  let running = false;
  let time = 0;
  let lastFrame = 0;
  let shake = 0;
  let launchTimer = -1;
  let saveTimer = 0;
  let zoom = 1;
  let lift = 0;
  let panelOpen = false;
  const compact = matchMedia(COMPACT_QUERY);
  let turboLoading = false;
  const guidance = createGuidance(state, hud, { ...options, onTutorialDone: callbacks.onTutorialDone, onTipSeen: callbacks.onTipSeen });
  const cameraTarget = new Vector3(state.player.x, 0, state.player.z);
  const workshopSpot = { x: state.planet.workshop.x, z: state.planet.workshop.z + PADS.workshopOffset };
  let intro: Intro | null = null;

  const feedback = createFeedback(state, world, playerView, robots, drones, fx, hud, audio, {
    save: callbacks.onSave,
    shake: (amount) => (shake = Math.max(shake, amount)),
    launch: () => {
      launchTimer = 0;
      controls.setEnabled(false);
      hud.setVisible(false);
    },
    firstOreFall: () => guidance.showTip("orefall"),
    firstStorm: () => guidance.showTip("storm"),
  });

  if (options.playIntro) {
    const startZoom = window.innerWidth < window.innerHeight ? PORTRAIT_ZOOM : 1;
    const ground = world.groundAt(state.player);
    intro = createIntro({
      scene,
      props: world.introProps(),
      lander,
      podSpot: world.groundAt(podSpot),
      base: world.groundAt(state.planet.dome),
      gameplayShot: { position: ground.clone().add(CAMERA_OFFSET.clone().multiplyScalar(startZoom)), target: ground.clone().add(new Vector3(0, 0.6, 0)) },
      captions: state.planet.arrivalCaptions,
      full: options.fullIntro,
      distanceScale: startZoom > 1 ? PORTRAIT_INTRO_DISTANCE : 1,
    });
    intro.onLand((at, heavy) => {
      fx.dust(at.clone().add(new Vector3(0, 0.2, 0)), heavy ? 34 : 14, state.planet.palette.dust);
      audio.play(heavy ? "impact" : "thud");
      shake = Math.max(shake, heavy ? 0.4 : 0.15);
      vibrate(heavy ? 40 : 15);
    });
  }

  function resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    pipeline.resize(width, height);
    camera.aspect = width / height;
    zoom = width < height ? PORTRAIT_ZOOM : 1;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  function updateCamera(dt: number): void {
    if (launchTimer === LAUNCH_DONE || (intro && !intro.done())) return;
    lift += ((panelOpen && compact.matches ? PANEL_LIFT * zoom : 0) - lift) * Math.min(1, dt * 4);
    shake = launchTimer >= 0
      ? launchShot(camera, cameraTarget, world.groundAt(state.planet.rocket), world.rocket.ship.getWorldPosition(new Vector3()), dt, shake)
      : followShot(camera, cameraTarget, state.player, CAMERA_OFFSET.clone().multiplyScalar(zoom), lift, dt, shake);
  }

  function updateLaunch(dt: number): void {
    if (launchTimer < 0) return;
    launchTimer += dt;
    playerView.model.root.visible = false;
    world.rocket.flame.visible = true;
    world.rocket.flame.scale.set(1, 1 + Math.sin(time * 40) * 0.15, 1);
    const rise = Math.max(0, launchTimer - 0.6);
    world.rocket.ship.position.y = 0.6 + rise * rise * 3;
    if (launchTimer < 1.2) shake = 0.25;
    if (Math.random() < 0.6) fx.dust(world.groundAt(state.planet.rocket).add(new Vector3(0, 0.3, 0)), 2, 0xc9c4d6);
    if (launchTimer >= LAUNCH_SECONDS) {
      launchTimer = LAUNCH_DONE;
      callbacks.onLaunched();
    }
  }

  function updateIntro(dt: number): boolean {
    if (!intro || intro.done()) return false;
    const shot = intro.update(dt);
    hud.setIntroCaption(intro.caption());
    playerView.model.root.visible = intro.landed();
    if (shot) {
      camera.position.copy(shot.position);
      camera.lookAt(shot.target);
    }
    if (!intro.done()) return true;
    finishIntro();
    return false;
  }

  function finishIntro(): void {
    hud.showIntro(false);
    hud.setIntroCaption(null);
    playerView.model.root.visible = true;
    cameraTarget.set(state.player.x, 0, state.player.z);
    callbacks.onIntroDone();
    if (running) {
      controls.setEnabled(true);
      hud.setVisible(true);
    }
  }

  pipeline.renderer.setAnimationLoop((now: number) => {
    const seconds = now / 1000;
    const dt = lastFrame === 0 ? 0 : Math.min(MAX_FRAME_SECONDS, seconds - lastFrame);
    lastFrame = seconds;
    time += dt;
    feedback.tick(dt);
    const inIntro = running && updateIntro(dt);

    if (running && !inIntro && launchTimer < 0) {
      for (const event of step(state, controls.read(), dt)) feedback.handle(event);
      saveTimer += dt;
      if (saveTimer > 3) {
        saveTimer = 0;
        callbacks.onSave();
      }
      const panel = activePanel(state, workshopSpot, (id) => world.robotDock(id));
      if (panel?.key === "workshop") guidance.showTip("workshop");
      hud.showPanel(panel, state.credits);
      panelOpen = panel !== null;
      hud.update(state);
      hud.setTurbo(state.boostSeconds > 0 ? "active" : turboLoading ? "loading" : "ready", state.boostSeconds);
      audio.setHum(state.robots.length + [...state.machines.values()].filter((m) => m.progress !== null).length);
      guidance.update(dt);
    }
    updateLaunch(dt);
    world.sync(state, dt, time);
    playerView.sync(state, dt, time);
    if (intro && !intro.landed()) playerView.model.root.visible = false;
    robots.sync(state, dt, time);
    drones.sync(state, dt, time);
    fx.update(dt);
    updateCamera(dt);
    pipeline.render();
  });

  const inIntroNow = () => intro !== null && !intro.done();

  function drop(item: ItemId): void {
    if (!running || launchTimer >= 0 || inIntroNow()) return;
    const result = dropItems(state, item, Number.POSITIVE_INFINITY, feedback.handle);
    if (!result.ok) {
      hud.toast(result.reason, "bad");
      return;
    }
    guidance.noteDropped();
  }

  return {
    inIntro: inIntroNow,
    setRunning(next) {
      running = next;
      const playable = next && launchTimer < 0 && !inIntroNow();
      controls.setEnabled(playable);
      hud.setVisible(playable);
      hud.showIntro(next && inIntroNow());
      if (!next) hud.showPanel(null, state.credits);
    },
    toggle(key) {
      toggleFromPanel(state, key);
      audio.play("pickup");
    },
    buy(key, id) {
      const result = buyFromPanel(state, key, id, feedback.handle);
      if (result.ok) return;
      hud.toast(result.reason, "bad");
      audio.play("error");
    },
    drop,
    dropTop() {
      const top = state.player.carry[state.player.carry.length - 1];
      if (top) drop(top);
    },
    async requestTurbo(showAd) {
      if (turboLoading || state.boostSeconds > 0) return;
      turboLoading = true;
      const watched = await showAd();
      turboLoading = false;
      if (!watched) {
        hud.toast("No ad available right now. Try again in a minute", "bad");
        return;
      }
      state.boostSeconds = BOOST.seconds;
      hud.toast(`Turbo on: ${BOOST.multiplier}× mining and machines for 2 minutes`, "good");
      audio.play("upgrade");
    },
    skipIntro() {
      if (!intro || intro.done()) return;
      intro.skip();
      finishIntro();
    },
    dispose() {
      pipeline.renderer.setAnimationLoop(null);
      window.removeEventListener("resize", resize);
      hud.showPanel(null, state.credits);
      hud.showCoach(null);
      audio.setHum(0);
      disposeScene(scene);
      pipeline.dispose();
    },
    acknowledgeCoach() {
      guidance.acknowledge();
    },
  };
}
