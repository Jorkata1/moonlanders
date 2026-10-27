import { BOOST, ITEMS, OXYGEN, oxygenFor, type ItemId } from "./config";
import { carryCapacity } from "./sim/economy";
import { carriedCounts } from "./sim/inventory";
import type { GameState } from "./sim/state";

const TOAST_MS = 2600;

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing HUD element #${id}`);
  return element as T;
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

export type ToastTone = "info" | "good" | "bad";
export type TurboState = "ready" | "loading" | "active";

export interface UpgradeRow {
  id: string;
  name: string;
  description: string;
  level: number;
  max: number;
  /** Price of the next level; null when maxed out. */
  cost: number | null;
}

export interface UpgradePanel {
  /** Identifies whose upgrades these are (workshop, or a robot id). */
  key: string;
  title: string;
  rows: UpgradeRow[];
}

export interface CoachCard {
  step: string;
  title: string;
  text: string;
  keys?: string[];
  button?: string;
}

export interface Hud {
  update(state: GameState): void;
  toast(message: string, tone?: ToastTone): void;
  setVisible(visible: boolean): void;
  showPanel(panel: UpgradePanel | null, credits: number): void;
  setTurbo(turbo: TurboState, secondsLeft: number): void;
  showCoach(card: CoachCard | null): void;
  showIntro(visible: boolean): void;
  setIntroCaption(text: string | null): void;
  onBuy(handler: (key: string, id: string) => void): void;
  onDrop(handler: (item: ItemId) => void): void;
  onTurbo(handler: () => void): void;
  onCoachOk(handler: () => void): void;
  onSkipIntro(handler: () => void): void;
  flash(): void;
}

export function createHud(): Hud {
  const root = requireElement<HTMLElement>("hud");
  const credits = requireElement<HTMLElement>("credits");
  const carry = requireElement<HTMLElement>("carry");
  const carryBar = requireElement<HTMLElement>("carry-bar");
  const inventory = requireElement<HTMLUListElement>("inventory");
  const oxygen = requireElement<HTMLElement>("oxygen");
  const oxygenBar = requireElement<HTMLElement>("oxygen-bar");
  const oxygenBox = requireElement<HTMLElement>("oxygen-box");
  const objective = requireElement<HTMLElement>("objective");
  const objectiveStep = requireElement<HTMLElement>("objective-step");
  const toastRegion = requireElement<HTMLElement>("toast");
  const panel = requireElement<HTMLElement>("workshop");
  const panelTitle = requireElement<HTMLElement>("workshop-title");
  const upgradeList = requireElement<HTMLElement>("upgrade-list");
  const turbo = requireElement<HTMLButtonElement>("turbo");
  const turboLabel = requireElement<HTMLElement>("turbo-label");
  const flashLayer = requireElement<HTMLElement>("flash");
  const coach = requireElement<HTMLElement>("coach");
  const coachOk = requireElement<HTMLButtonElement>("coach-ok");
  const intro = requireElement<HTMLElement>("intro");
  const introCaption = requireElement<HTMLElement>("intro-caption");
  let buyHandler: (key: string, id: string) => void = () => undefined;
  let dropHandler: (item: ItemId) => void = () => undefined;
  let toastTimer = 0;
  let lastCredits = -1;
  let lastObjective = -1;
  let inventorySignature = "";
  let panelSignature = "";
  let panelKey = "";

  function renderInventory(state: GameState): void {
    const counts = carriedCounts(state.player.carry);
    const signature = counts.map((c) => `${c.item}:${c.count}`).join("|");
    if (signature === inventorySignature) return;
    inventorySignature = signature;
    inventory.hidden = counts.length === 0;
    inventory.replaceChildren(
      ...counts.map(({ item, count }) => {
        const row = document.createElement("li");
        const swatch = document.createElement("span");
        swatch.className = `item-swatch item-swatch--${ITEMS[item].shape}`;
        swatch.style.setProperty("--swatch", hex(ITEMS[item].color));
        const name = document.createElement("span");
        name.className = "item-name";
        name.textContent = ITEMS[item].plural;
        const amount = document.createElement("span");
        amount.className = "item-count";
        amount.textContent = `×${count}`;
        const drop = document.createElement("button");
        drop.type = "button";
        drop.className = "drop-button";
        drop.textContent = "Drop";
        drop.setAttribute("aria-label", `Drop all ${count} ${ITEMS[item].plural.toLowerCase()} on the ground`);
        drop.addEventListener("click", () => dropHandler(item));
        row.append(swatch, name, amount, drop);
        return row;
      }),
    );
  }

  function renderPanel(next: UpgradePanel, money: number): void {
    const signature = `${next.key}|${money}|${next.rows.map((r) => `${r.level}:${r.cost}`).join(",")}`;
    if (signature === panelSignature) return;
    panelSignature = signature;
    panelKey = next.key;
    panelTitle.textContent = next.title;
    upgradeList.replaceChildren(
      ...next.rows.map((row) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "upgrade";
        button.innerHTML = `<span class="upgrade-name"></span><span class="upgrade-desc"></span><span class="upgrade-pips" aria-hidden="true"></span><span class="upgrade-cost"></span>`;
        (button.children[0] as HTMLElement).textContent = row.name;
        (button.children[1] as HTMLElement).textContent = row.description;
        (button.children[2] as HTMLElement).textContent = "●".repeat(row.level) + "○".repeat(row.max - row.level);
        (button.children[3] as HTMLElement).textContent = row.cost === null ? "MAX" : `◆ ${row.cost}`;
        button.disabled = row.cost === null || money < row.cost;
        button.setAttribute("aria-label", `${row.name}, level ${row.level} of ${row.max}. ${row.cost === null ? "Maxed out" : `Costs ${row.cost} credits`}`);
        button.addEventListener("click", () => buyHandler(panelKey, row.id));
        item.append(button);
        return item;
      }),
    );
  }

  return {
    update(state) {
      if (state.credits !== lastCredits) {
        credits.textContent = state.credits.toLocaleString("en-US");
        if (state.credits > lastCredits && lastCredits >= 0) {
          credits.classList.remove("bump");
          void credits.offsetWidth;
          credits.classList.add("bump");
        }
        lastCredits = state.credits;
      }
      const capacity = carryCapacity(state);
      carry.textContent = `${state.player.carry.length}/${capacity}`;
      carryBar.style.transform = `scaleX(${state.player.carry.length / capacity})`;
      carry.closest(".chip")?.classList.toggle("is-full", state.player.carry.length >= capacity);
      renderInventory(state);
      const max = oxygenFor(state.upgrades.oxygen);
      oxygen.textContent = `${Math.ceil(state.player.oxygen)} s`;
      oxygenBar.style.transform = `scaleX(${state.player.oxygen / max})`;
      oxygenBox.classList.toggle("is-low", state.player.oxygen <= max * OXYGEN.lowRatio);
      oxygenBox.classList.toggle("is-refilling", state.player.oxygen < max && Math.hypot(state.player.x - state.planet.dome.x, state.player.z - state.planet.dome.z) <= state.planet.dome.radius);
      if (state.objectiveIndex !== lastObjective) {
        lastObjective = state.objectiveIndex;
        const current = state.planet.objectives[state.objectiveIndex];
        objective.textContent = current ? current.text : "Moon complete!";
        objectiveStep.textContent = `${Math.min(state.objectiveIndex + 1, state.planet.objectives.length)}/${state.planet.objectives.length}`;
        const card = objective.parentElement;
        card?.classList.remove("is-new");
        void card?.offsetWidth;
        card?.classList.add("is-new");
      }
    },
    toast(message, tone = "info") {
      toastRegion.textContent = message;
      toastRegion.dataset.tone = tone;
      toastRegion.hidden = false;
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        toastRegion.hidden = true;
      }, TOAST_MS);
    },
    setVisible(visible) {
      root.hidden = !visible;
    },
    showPanel(next, money) {
      panel.hidden = next === null;
      if (next) renderPanel(next, money);
      else panelSignature = "";
    },
    setTurbo(mode, secondsLeft) {
      turbo.dataset.mode = mode;
      turbo.disabled = mode !== "ready";
      turbo.setAttribute("aria-busy", String(mode === "loading"));
      if (mode === "active") turboLabel.textContent = `TURBO ${Math.floor(secondsLeft / 60)}:${String(Math.floor(secondsLeft % 60)).padStart(2, "0")}`;
      else if (mode === "loading") turboLabel.textContent = "Loading ad…";
      else turboLabel.textContent = `${BOOST.multiplier}× TURBO · watch ad`;
    },
    showCoach(card) {
      coach.hidden = card === null;
      if (!card) return;
      requireElement("coach-step").textContent = card.step;
      requireElement("coach-title").textContent = card.title;
      requireElement("coach-text").textContent = card.text;
      const keys = requireElement("coach-keys");
      keys.replaceChildren(
        ...(card.keys ?? []).map((key) => {
          const element = document.createElement("kbd");
          element.textContent = key;
          return element;
        }),
      );
      keys.hidden = !card.keys?.length;
      coachOk.hidden = !card.button;
      coachOk.textContent = card.button ?? "";
      coach.classList.remove("is-new");
      void coach.offsetWidth;
      coach.classList.add("is-new");
    },
    showIntro(visible) {
      intro.hidden = !visible;
      if (visible) requireElement<HTMLButtonElement>("intro-skip").focus();
    },
    setIntroCaption(text) {
      introCaption.hidden = text === null;
      if (text === null || introCaption.textContent === text) return;
      introCaption.textContent = text;
      introCaption.classList.remove("is-new");
      void introCaption.offsetWidth;
      introCaption.classList.add("is-new");
    },
    onBuy(handler) {
      buyHandler = handler;
    },
    onDrop(handler) {
      dropHandler = handler;
    },
    onTurbo(handler) {
      turbo.addEventListener("click", handler);
    },
    onCoachOk(handler) {
      coachOk.addEventListener("click", handler);
    },
    onSkipIntro(handler) {
      requireElement<HTMLButtonElement>("intro-skip").addEventListener("click", handler);
    },
    flash() {
      flashLayer.classList.remove("is-on");
      void flashLayer.offsetWidth;
      flashLayer.classList.add("is-on");
    },
  };
}
