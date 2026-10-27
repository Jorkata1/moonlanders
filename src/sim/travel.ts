import { oxygenFor } from "../config";
import { nextPlanet } from "../planets";
import { createState, type GameState } from "./state";

/**
 * Arrive on the planet after `from`. Suit upgrades and spare credits come along;
 * machines, robots and missions start fresh. Returns null when there is no next planet yet.
 */
export function startNextPlanet(from: GameState): GameState | null {
  const destination = nextPlanet(from.planet);
  if (!destination) return null;
  const state = createState(destination);
  state.credits = from.credits;
  state.upgrades = { ...from.upgrades };
  state.player.oxygen = oxygenFor(state.upgrades.oxygen);
  return state;
}
