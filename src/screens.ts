import { ITEM_IDS } from "./config";
import { PLANETS, UPCOMING, planetIndex } from "./planets";
import type { PlanetDef, RouteCardDef } from "./planets/types";
import type { GameState } from "./sim/state";

/** Planets in the route row: playable ones first, then the ones still to come. */
function routeLength(): number {
  return PLANETS.length + UPCOMING.length;
}

function routeCard(card: RouteCardDef, status: "done" | "current" | "later", detail: string): HTMLElement {
  const element = document.createElement("div");
  element.className = `planet${status === "current" ? " is-current" : status === "done" ? " is-done" : ""}`;
  const dot = document.createElement("div");
  dot.className = "planet-dot";
  dot.style.background = `radial-gradient(circle at 35% 35%, ${card.dot[0]}, ${card.dot[1]})`;
  const name = document.createElement("strong");
  name.textContent = card.label;
  const statusLabel = document.createElement("span");
  statusLabel.className = "planet-status";
  statusLabel.textContent = detail;
  element.append(dot, name, statusLabel);
  if (status === "current") element.setAttribute("aria-current", "step");
  return element;
}

/** Fill the start screen's route row: finished planets, the current one, and those ahead. */
export function renderRoute(container: HTMLElement, current: PlanetDef): void {
  const currentIndex = planetIndex(current);
  const cards = PLANETS.map((planet, index) => {
    if (index < currentIndex) return routeCard(planet.route, "done", "Done ✓");
    return routeCard(planet.route, index === currentIndex ? "current" : "later", planet.route.resources);
  });
  container.replaceChildren(...cards, ...UPCOMING.map((card) => routeCard(card, "later", card.resources)));
}

export function startEyebrow(planet: PlanetDef): string {
  return `Planet ${planetIndex(planet) + 1} of ${routeLength()} · ${planet.name}`;
}

export function startText(planet: PlanetDef): string {
  return `Mine ${planet.phrase}, build machines and load your rocket. When it's ready, fly on to the next world.`;
}

export function totalMined(state: GameState): number {
  return ITEM_IDS.reduce((sum, item) => sum + state.stats.mined[item], 0);
}

export interface CompleteText {
  eyebrow: string;
  text: string;
  stats: string;
}

/** The end screen after lifting off from the last playable planet. */
export function completeText(state: GameState): CompleteText {
  const upcoming = UPCOMING[0];
  return {
    eyebrow: `${state.planet.name} complete`,
    text: upcoming ? `Your rocket is on its way to the ${upcoming.label.toLowerCase()}. It lands in the next update.` : "You have reached the end of the route. Well flown, pioneer.",
    stats: `${state.stats.earned.toLocaleString("en-US")} credits earned · ${totalMined(state)} resources mined on ${state.planet.phrase}`,
  };
}
