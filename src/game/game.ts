import { Vector3 } from 'three';
import { SoundId, Sfx } from '../audio/sfx';
import { AUTOSAVE_INTERVAL_SECONDS, LAUNCH_DURATION_SECONDS, MAX_FRAME_DT } from '../config/balance';
import { PLANETS } from '../config/planets';
import type { GameEvent } from '../core/events';
import { isOxygenLow } from '../core/oxygen';
import { clearSave, loadGame, saveGame } from '../core/persistence';
import { LaunchOutcome, Simulation } from '../core/simulation';
import { createInitialState, type GameState } from '../core/state';
import { MovementInput } from '../input/movementInput';
import { LabelLayer } from '../render/labelLayer';
import { PlanetView } from '../render/planetView';
import { SceneRig } from '../render/sceneRig';
import { updateWorldLabels } from '../render/worldLabels';
import { prefersReducedMotion } from '../ui/dom';
import { Hud } from '../ui/hud';
import { Screens } from '../ui/screens';
import { presentEvent } from './feedback';

const GamePhase = {
  Menu: 'menu',
  Playing: 'playing',
  Paused: 'paused',
  Launching: 'launching',
} as const;
type GamePhase = (typeof GamePhase)[keyof typeof GamePhase];

/** Wires simulation, rendering, input, audio and UI together and owns the frame loop. */
export class Game {
  private readonly rig: SceneRig;
  private readonly labels: LabelLayer;
  private readonly hud: Hud;
  private readonly screens: Screens;
  private readonly sfx = new Sfx();
  private readonly input: MovementInput;
  private readonly cameraTarget = new Vector3();
  private readonly resizeObserver: ResizeObserver;
  private simulation: Simulation;
  private view: PlanetView;
  private phase: GamePhase = GamePhase.Menu;
  private pendingEvents: GameEvent[] = [];
  private lastFrameTime = 0;
  private elapsed = 0;
  private autosaveTimer = 0;
  private launchElapsed = 0;
  private isTransitioning = false;
  private hasMoved = false;
  private snapCamera = true;

  constructor(private readonly container: HTMLElement) {
    this.rig = new SceneRig(container);
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    container.appendChild(overlay);
    this.labels = new LabelLayer(overlay, this.rig.camera);
    this.input = new MovementInput(this.rig.canvas, overlay);
    this.hud = new Hud(container, {
      onLaunch: () => this.startLaunch(),
      onMenu: () => this.pause(),
      onToggleSound: () => this.toggleSound(),
    });
    this.screens = new Screens(container);
    this.hud.setMuted(this.sfx.isMuted);

    const saved = loadGame();
    this.simulation = this.createSimulation(saved ?? createInitialState());
    this.view = this.buildView();
    this.hud.setVisible(false);
    this.screens.showStart({
      hasSave: saved !== null,
      onContinue: () => this.beginPlaying(),
      onNewGame: () => this.resetProgress(),
    });

    this.resizeObserver = new ResizeObserver(() => this.rig.resize());
    this.resizeObserver.observe(container);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('pagehide', this.persist);
    this.rig.renderer.setAnimationLoop((time) => this.frame(time));
  }

  private createSimulation(state: GameState): Simulation {
    return new Simulation(state, (event) => this.pendingEvents.push(event));
  }

  private buildView(): PlanetView {
    this.view?.dispose();
    this.labels.clear();
    const planet = this.simulation.planet;
    const view = new PlanetView(planet);
    this.rig.scene.add(view.root);
    this.rig.applyPalette(planet.palette);
    this.hud.setPlanet(planet.name, this.simulation.state.planetIndex, PLANETS.length);
    this.snapCamera = true;
    return view;
  }

  private beginPlaying(): void {
    this.sfx.unlock();
    this.sfx.play(SoundId.Click);
    this.screens.close();
    this.hud.setVisible(true);
    this.phase = GamePhase.Playing;
    const planet = this.simulation.planet;
    this.screens.showPlanetBanner(planet.name, planet.tagline);
  }

  private resetProgress(): void {
    clearSave();
    this.simulation = this.createSimulation(createInitialState());
    this.view = this.buildView();
    this.pendingEvents = [];
    this.hasMoved = false;
    this.persist();
    this.beginPlaying();
  }

  private pause(): void {
    if (this.phase !== GamePhase.Playing) return;
    this.sfx.play(SoundId.Click);
    this.phase = GamePhase.Paused;
    this.input.reset();
    this.persist();
    this.screens.showPause({
      onResume: () => this.resume(),
      onRestart: () => this.resetProgress(),
    });
  }

  private resume(): void {
    this.screens.close();
    this.phase = GamePhase.Playing;
  }

  private toggleSound(): void {
    this.sfx.unlock();
    this.sfx.setMuted(!this.sfx.isMuted);
    this.hud.setMuted(this.sfx.isMuted);
    this.sfx.play(SoundId.Click);
  }

  private startLaunch(): void {
    if (this.phase !== GamePhase.Playing || !this.simulation.isRocketReady) return;
    this.phase = GamePhase.Launching;
    this.launchElapsed = 0;
    this.input.reset();
    this.hud.setLaunchPending(true);
    this.view.astronaut.setVisible(false);
    this.sfx.play(SoundId.Launch);
  }

  private async finishLaunch(): Promise<void> {
    this.isTransitioning = true;
    try {
      await this.screens.fadeOut();
      const outcome = this.simulation.launch();
      if (outcome === LaunchOutcome.NextPlanet) {
        this.view = this.buildView();
        this.persist();
        this.phase = GamePhase.Playing;
        await this.screens.fadeIn();
        const planet = this.simulation.planet;
        this.screens.showPlanetBanner(planet.name, planet.tagline);
        return;
      }
      this.view.rocket.resetLaunch();
      this.view.astronaut.setVisible(true);
      this.persist();
      this.phase = GamePhase.Paused;
      await this.screens.fadeIn();
      if (outcome === LaunchOutcome.Completed) {
        this.screens.showVictory({ onKeepPlaying: () => this.resume(), onRestart: () => this.resetProgress() });
      } else {
        this.phase = GamePhase.Playing;
      }
    } finally {
      this.hud.setLaunchPending(false);
      this.isTransitioning = false;
    }
  }

  private frame(now: number): void {
    const dt = this.lastFrameTime === 0 ? 0 : Math.min(MAX_FRAME_DT, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    this.elapsed += dt;
    try {
      this.step(dt);
    } catch (error) {
      this.rig.renderer.setAnimationLoop(null);
      console.error('[moonlanders] Frame failed; stopping the game loop.', error);
      this.persist();
      this.screens.showFatalError('The game hit an unexpected error. Your progress up to a few seconds ago is saved.');
    }
  }

  private step(dt: number): void {
    const simulation = this.simulation;
    if (this.phase === GamePhase.Playing) {
      const move = this.input.worldVector();
      simulation.update(dt, move);
      if (simulation.isMoving) this.hasMoved = true;
      this.flushEvents();
      this.autosaveTimer += dt;
      if (this.autosaveTimer >= AUTOSAVE_INTERVAL_SECONDS) {
        this.autosaveTimer = 0;
        this.persist();
      }
    }

    const objective = simulation.objective;
    this.view.update(simulation, this.elapsed, dt, this.phase === GamePhase.Launching ? null : objective.target);
    this.updateCamera(dt);
    updateWorldLabels(this.labels, simulation);
    this.updateHud(objective.text);
    this.rig.render();
  }

  private updateCamera(dt: number): void {
    const { player } = this.simulation.state;
    if (this.phase === GamePhase.Launching) {
      this.launchElapsed += dt;
      const t = Math.min(1, this.launchElapsed / LAUNCH_DURATION_SECONDS);
      this.view.rocket.updateLaunch(this.elapsed, t);
      if (!prefersReducedMotion()) this.rig.addShake(0.35 * (1 - t));
      const rocket = this.simulation.planet.rocketPosition;
      this.cameraTarget.set(rocket.x, this.view.rocket.shipAltitude * 0.75, rocket.z);
      if (t >= 1 && !this.isTransitioning) void this.finishLaunch();
    } else {
      this.cameraTarget.set(player.x, 0, player.z);
    }
    this.rig.follow(this.cameraTarget, dt, this.snapCamera);
    this.snapCamera = false;
  }

  private updateHud(objectiveText: string): void {
    const { state, suitStats, isInsideDome, isRocketReady } = this.simulation;
    this.hud.setObjective(objectiveText);
    this.hud.setOxygen(state.oxygen, suitStats.oxygenMax, isOxygenLow(state.oxygen, suitStats.oxygenMax), isInsideDome && state.oxygen < suitStats.oxygenMax);
    this.hud.setBackpack(state.backpack, suitStats.capacity);
    this.hud.setLaunchAvailable(isRocketReady && this.phase !== GamePhase.Launching);
    this.hud.setHintVisible(this.phase === GamePhase.Playing && !this.hasMoved);
  }

  private flushEvents(): void {
    if (this.pendingEvents.length === 0) return;
    const events = this.pendingEvents;
    this.pendingEvents = [];
    for (const event of events) {
      presentEvent(event, {
        hud: this.hud,
        sfx: this.sfx,
        shake: (strength) => {
          if (!prefersReducedMotion()) this.rig.addShake(strength);
        },
        onPlayerTeleported: () => {
          this.snapCamera = true;
        },
      });
    }
  }

  private readonly persist = (): void => {
    saveGame(this.simulation.state);
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState !== 'hidden') return;
    this.persist();
    if (this.phase === GamePhase.Playing) this.pause();
  };

  dispose(): void {
    this.rig.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('pagehide', this.persist);
    this.input.dispose();
    this.view.dispose();
    this.labels.clear();
    this.rig.dispose();
    this.container.replaceChildren();
  }
}
