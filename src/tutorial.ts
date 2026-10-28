import { capacityFor } from "./config";
import type { CoachCard } from "./hud";
import type { GameState } from "./sim/state";

/** What the tutorial watches besides the game state itself. */
export interface TutorialSignals {
  movedMeters: number;
  secondsInStep: number;
  dropped: boolean;
}

interface Step {
  card: (touch: boolean) => CoachCard;
  done: (state: GameState, signals: TutorialSignals) => boolean;
}

const STEPS: Step[] = [
  {
    card: (touch) => ({
      step: "Tutorial 1/7",
      title: "Walk around",
      text: touch ? "Press anywhere on the screen and drag to walk." : "Walk with WASD or the arrow keys. You can also click and drag.",
      keys: touch ? undefined : ["W", "A", "S", "D"],
    }),
    done: (_state, signals) => signals.movedMeters > 2.5,
  },
  {
    card: () => ({ step: "Tutorial 2/7", title: "Mine some carbon", text: "Stand next to the dark, shiny carbon rocks. Your drill warms up for 2 seconds, then cuts by itself." }),
    done: (state) => state.stats.mined.carbon >= 3,
  },
  {
    card: () => ({ step: "Tutorial 3/7", title: "Your backpack", text: `Everything you mine stacks on your back. It holds ${capacityFor(0)} for now; the list under Backpack shows what you carry.`, button: "Got it" }),
    done: () => false,
  },
  {
    card: () => ({ step: "Tutorial 4/7", title: "Watch your oxygen", text: "Air runs out outside the glass dome. Walk back inside before the bar empties, or you'll pass out and lose your load.", button: "Got it" }),
    done: () => false,
  },
  {
    card: () => ({ step: "Tutorial 5/7", title: "Build with materials", text: "The blue hologram shows what is being built. Stand on its pad to hand over the materials it lists. Start with the workbench: 20 carbon." }),
    done: (state) => state.built.has("workbench"),
  },
  {
    card: () => ({ step: "Tutorial 6/7", title: "Order at the workbench", text: "Stand on the workbench pad and pick the smelter. One build at a time: its hologram appears where it will stand." }),
    done: (state) => state.built.has("smelter") || state.order?.targetId === "smelter",
  },
  {
    card: (touch) => ({
      step: "Tutorial 7/7",
      title: "Machines and dropping",
      text: `Iron falls from the sky once the smelter stands. Feed ore on the orange IN pad and collect plates from the green OUT pad. Carrying the wrong thing? Tap Drop in the backpack list${touch ? "" : " or press Q"}.`,
      button: "Let's go",
    }),
    done: () => false,
  },
];

export interface Tutorial {
  update(state: GameState, signals: TutorialSignals): CoachCard | null | undefined;
  acknowledge(): void;
  readonly finished: () => boolean;
}

/**
 * Steps advance on their own when the player does the thing, or with the card's button.
 * `update` returns the card to show when it changes, null to hide, undefined for no change.
 */
export function createTutorial(touch: boolean, startStep: number): Tutorial {
  let index = startStep;
  let shownIndex = -1;
  let acknowledged = false;

  function update(state: GameState, signals: TutorialSignals): CoachCard | null | undefined {
    const step = STEPS[index];
    if (!step) {
      if (shownIndex !== index) {
        shownIndex = index;
        return null;
      }
      return undefined;
    }
    if (acknowledged || step.done(state, signals)) {
      acknowledged = false;
      index += 1;
      signals.secondsInStep = 0;
      return update(state, signals);
    }
    if (shownIndex === index) return undefined;
    shownIndex = index;
    return step.card(touch);
  }

  return {
    update,
    acknowledge() {
      acknowledged = true;
    },
    finished: () => index >= STEPS.length,
  };
}

/** One-off hints the first time something new happens. */
export const TIPS = {
  orefall: { step: "Fresh material", title: "Rocks from the sky", text: "Mined-out rocks crumble away. New ones fall into the field every few seconds, so a field never runs dry.", button: "Got it" },
  workbench: { step: "Workbench", title: "Pick your next build", text: "Choose one and a hologram appears where it will stand. Bring the materials there; robots and the drone help once you have them.", button: "Got it" },
  robot: { step: "Robots", title: "Your robot is working", text: "Robots only mine: they stack their haul beside their dock. Grab it yourself, or build the cargo drone to haul it. Stand on a dock to upgrade the robot or switch it off.", button: "Got it" },
  drone: { step: "Cargo drone", title: "Your drone hauls for you", text: "It is the only one that hauls: robot stockpiles and smelter plates go to your builds, iron ore goes to the smelter. Stand on its dock to upgrade it or pause it.", button: "Got it" },
  storm: { step: "Watch out", title: "Dust storm coming!", text: "Storms slow you down and burn your air twice as fast outside the dome. Wait it out inside, or keep working if your tank is full.", button: "Got it" },
} satisfies Record<string, CoachCard>;

export type TipId = keyof typeof TIPS;
