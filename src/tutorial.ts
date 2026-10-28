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
    card: () => ({ step: "Tutorial 2/7", title: "Mine some iron", text: "Walk up to the rocks with orange veins. Your laser drill cuts the ore out by itself, so just stand next to them." }),
    done: (state) => state.stats.mined.ironOre >= 3,
  },
  {
    card: () => ({ step: "Tutorial 3/7", title: "Your backpack", text: `Ore stacks on your back. It holds ${capacityFor(0)} for now; the list under Backpack shows what you carry.`, button: "Got it" }),
    done: () => false,
  },
  {
    card: () => ({ step: "Tutorial 4/7", title: "Watch your oxygen", text: "Air runs out outside the glass dome. Walk back inside before the bar empties, or you'll pass out and lose your load.", button: "Got it" }),
    done: () => false,
  },
  {
    card: () => ({ step: "Tutorial 5/7", title: "Sell to Zix", text: "Bring the ore to Zix's stall and stand on the green pad. He buys everything you carry." }),
    done: (state) => state.stats.earned > 0,
  },
  {
    card: () => ({ step: "Tutorial 6/7", title: "Build with credits", text: "Yellow pads build things. Stand on one and your credits flow in until it's paid. Start with the smelter." }),
    done: (state) => state.unlocked.has("smelter"),
  },
  {
    card: (touch) => ({
      step: "Tutorial 7/7",
      title: "Machines and dropping",
      text: `Walk onto the orange IN pad to feed ore, and the green OUT pad to collect plates: they sell for more. Carrying the wrong thing? Tap Drop in the backpack list${touch ? "" : " or press Q"}.`,
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
  orefall: { step: "Fresh ore", title: "Ore from the sky", text: "Mined-out rocks crumble away. New ones fall into the field every few seconds, so the field never runs dry.", button: "Got it" },
  drone: { step: "Trader drone", title: "Your drone sells for you", text: "It flies finished goods from its machine to Zix. Stand on its dock to pause it when you need the goods for the rocket.", button: "Got it" },
  workshop: { step: "Workshop", title: "Upgrade yourself", text: "Faster boots, a bigger backpack, a stronger drill and more air. Pick from the list.", button: "Got it" },
  storm: { step: "Watch out", title: "Dust storm coming!", text: "Storms slow you down and burn your air twice as fast outside the dome. Wait it out inside, or keep working if your tank is full.", button: "Got it" },
  robot: { step: "Robots", title: "Your robot is working", text: "It mines and feeds its machine on its own. Stand on its dock to upgrade speed, cargo and drill.", button: "Got it" },
} satisfies Record<string, CoachCard>;

export type TipId = keyof typeof TIPS;
