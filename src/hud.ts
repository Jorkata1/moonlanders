import { BOOST, ITEMS, OXYGEN, oxygenFor, type ItemId } from "./config";
import { carryCapacity } from "./sim/economy";
import { carriedCounts } from "./sim/inventory";
import { isInsideDome } from "./sim/hazards";
import { isStormRaging, type GameState } from "./sim/state";
import { createPanelView } from "./hudPanel";
import type { UpgradePanel } from "./panels";
import { orderLabel, orderProgress } from "./sim/orders";

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
  showPanel(panel: UpgradePanel | null): void;
  setTurbo(turbo: TurboState, secondsLeft: number): void;
  showCoach(card: CoachCard | null): void;
  showIntro(visible: boolean): void;
  setIntroCaption(text: string | null): void;
  onOrder(handler: (key: string, id: string) => void): void;
  onToggle(handler: (key: string) => void): void;
  onDrop(handler: (item: ItemId) => void): void;
  onTurbo(handler: () => void): void;
  onCoachOk(handler: () => void): void;
  onSkipIntro(handler: () => void): void;
  flash(): void;
}

export function createHud(): Hud {
  const root = requireElement<HTMLElement>("hud");
  const orderChip = requireElement<HTMLElement>("order-chip");
  const orderTitle = requireElement<HTMLElement>("order-title");
  const orderList = requireElement<HTMLElement>("order-list");
  const carry = requireElement<HTMLElement>("carry");
  const carryBar = requireElement<HTMLElement>("carry-bar");
  const inventory = requireElement<HTMLUListElement>("inventory");
  const oxygen = requireElement<HTMLElement>("oxygen");
  const oxygenBar = requireElement<HTMLElement>("oxygen-bar");
  const oxygenBox = requireElement<HTMLElement>("oxygen-box");
  const objective = requireElement<HTMLElement>("objective");
  const objectiveStep = requireElement<HTMLElement>("objective-step");
  const toastRegion = requireElement<HTMLElement>("toast");
  const turbo = requireElement<HTMLButtonElement>("turbo");
  const turboLabel = requireElement<HTMLElement>("turbo-label");
  const flashLayer = requireElement<HTMLElement>("flash");
  const coach = requireElement<HTMLElement>("coach");
  const coachOk = requireElement<HTMLButtonElement>("coach-ok");
  const intro = requireElement<HTMLElement>("intro");
  const introCaption = requireElement<HTMLElement>("intro-caption");
  let orderHandler: (key: string, id: string) => void = () => undefined;
  let toggleHandler: (key: string) => void = () => undefined;
  const panelView = createPanelView((key, id) => orderHandler(key, id), (key) => toggleHandler(key));
  let dropHandler: (item: ItemId) => void = () => undefined;
  let toastTimer = 0;
  let orderSignature = "";
  let lastObjective = -1;
  let inventorySignature = "";

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

  /** The active build in the top-left corner: its name and each material's count. */
  function renderOrder(state: GameState): void {
    const rows = orderProgress(state);
    const title = state.order ? orderLabel(state, state.order) : "";
    const signature = `${title}|${rows.map((r) => `${r.item}:${r.delivered}/${r.needed}`).join(",")}`;
    if (signature === orderSignature) return;
    orderSignature = signature;
    orderChip.hidden = !state.order;
    orderTitle.textContent = title;
    orderList.replaceChildren(
      ...rows.map(({ item, needed, delivered }) => {
        const row = document.createElement("li");
        row.classList.toggle("is-done", delivered >= needed);
        const swatch = document.createElement("span");
        swatch.className = `item-swatch item-swatch--${ITEMS[item].shape}`;
        swatch.style.setProperty("--swatch", hex(ITEMS[item].color));
        const name = document.createElement("span");
        name.className = "item-name";
        name.textContent = ITEMS[item].plural;
        const count = document.createElement("span");
        count.className = "item-count";
        count.textContent = `${delivered}/${needed}`;
        row.append(swatch, name, count);
        row.setAttribute("aria-label", `${ITEMS[item].plural}: ${delivered} of ${needed}`);
        return row;
      }),
    );
  }

  return {
    update(state) {
      renderOrder(state);
      const capacity = carryCapacity(state);
      carry.textContent = `${state.player.carry.length}/${capacity}`;
      carryBar.style.transform = `scaleX(${state.player.carry.length / capacity})`;
      carry.closest(".chip")?.classList.toggle("is-full", state.player.carry.length >= capacity);
      renderInventory(state);
      const max = oxygenFor(state.suit.oxygen);
      oxygen.textContent = `${Math.ceil(state.player.oxygen)} s`;
      oxygenBar.style.transform = `scaleX(${state.player.oxygen / max})`;
      oxygenBox.classList.toggle("is-low", state.player.oxygen <= max * OXYGEN.lowRatio);
      oxygenBox.classList.toggle("is-storm", isStormRaging(state) && !isInsideDome(state, state.player));
      oxygenBox.classList.toggle("is-refilling", state.player.oxygen < max && Math.hypot(state.player.x - state.planet.dome.x, state.player.z - state.planet.dome.z) <= state.planet.dome.radius);
      if (state.objectiveIndex !== lastObjective) {
        lastObjective = state.objectiveIndex;
        const current = state.planet.objectives[state.objectiveIndex];
        objective.textContent = current ? current.text : `${state.planet.name} complete!`;
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
    showPanel(next) {
      panelView.render(next);
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
    onOrder(handler) {
      orderHandler = handler;
    },
    onToggle(handler) {
      toggleHandler = handler;
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
