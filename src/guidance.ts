import type { Hud } from "./hud";
import type { GameState } from "./sim/state";
import { TIPS, createTutorial, type TipId, type TutorialSignals } from "./tutorial";

const TIP_SECONDS = 7;

export interface GuidanceOptions {
  tutorialDone: boolean;
  seenTips: ReadonlySet<string>;
  touch: boolean;
  onTutorialDone(): void;
  onTipSeen(id: TipId): void;
}

export interface Guidance {
  /** Show a one-off tip, unless it was seen before or the tutorial is still running. */
  showTip(id: TipId): void;
  update(dt: number): void;
  /** The player pressed the coach card's button. */
  acknowledge(): void;
  /** The player dropped something (a tutorial step waits for it). */
  noteDropped(): void;
}

/** The first-play tutorial, then one-off tips as new things appear. */
export function createGuidance(state: GameState, hud: Hud, options: GuidanceOptions): Guidance {
  const seenTips = new Set(options.seenTips);
  const tutorial = options.tutorialDone ? null : createTutorial(options.touch, 0);
  const signals: TutorialSignals = { movedMeters: 0, secondsInStep: 0, dropped: false };
  const lastPlayer = { x: state.player.x, z: state.player.z };
  let tipTimer = 0;

  function showTip(id: TipId): void {
    if (seenTips.has(id) || (tutorial && !tutorial.finished())) return;
    seenTips.add(id);
    options.onTipSeen(id);
    hud.showCoach(TIPS[id]);
    tipTimer = TIP_SECONDS;
  }

  return {
    showTip,
    update(dt) {
      signals.movedMeters += Math.hypot(state.player.x - lastPlayer.x, state.player.z - lastPlayer.z);
      signals.secondsInStep += dt;
      lastPlayer.x = state.player.x;
      lastPlayer.z = state.player.z;
      if (tutorial && !tutorial.finished()) {
        const card = tutorial.update(state, signals);
        if (card !== undefined) hud.showCoach(card);
        if (tutorial.finished()) options.onTutorialDone();
        return;
      }
      if (tipTimer > 0) {
        tipTimer -= dt;
        if (tipTimer <= 0) hud.showCoach(null);
      }
      if (state.robots.length > 0) showTip("robot");
      if (state.drones.length > 0) showTip("drone");
    },
    acknowledge() {
      if (tutorial && !tutorial.finished()) {
        tutorial.acknowledge();
        return;
      }
      tipTimer = 0;
      hud.showCoach(null);
    },
    noteDropped() {
      signals.dropped = true;
    },
  };
}
