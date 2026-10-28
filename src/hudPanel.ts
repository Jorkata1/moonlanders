import { ITEMS } from "./config";
import type { PanelCard, UpgradePanel } from "./panels";
import { upgradeIconSvg } from "./upgradeIcons";

const STATE_BADGES: Partial<Record<PanelCard["state"], string>> = { active: "Building", maxed: "Max", locked: "Locked" };

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing HUD element #${id}`);
  return element as T;
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function span(className: string, text: string): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  return element;
}

function costChips(card: PanelCard): HTMLSpanElement {
  const chips = span("upgrade-costs", "");
  for (const { item, amount } of card.cost) {
    const chip = span("cost-chip", "");
    const swatch = span(`item-swatch item-swatch--${ITEMS[item].shape}`, "");
    swatch.style.setProperty("--swatch", hex(ITEMS[item].color));
    chip.append(swatch, document.createTextNode(String(amount)));
    chip.title = ITEMS[item].plural;
    chips.append(chip);
  }
  return chips;
}

function describe(card: PanelCard): string {
  const cost = card.cost.map(({ item, amount }) => `${amount} ${ITEMS[item].plural.toLowerCase()}`).join(", ");
  const level = card.level ? `, level ${card.level.current} of ${card.level.max}` : "";
  const status = card.state === "ready" ? `Costs ${cost}` : (card.note ?? STATE_BADGES[card.state] ?? "");
  return `${card.name}${level}. ${card.description}. ${status}`;
}

function cardButton(card: PanelCard, onPress: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "upgrade";
  button.dataset.state = card.state;
  // The icon markup is a fixed constant; every text from the card goes in through textContent.
  button.innerHTML = upgradeIconSvg(card.icon);
  button.append(span("upgrade-name", card.name), span("upgrade-desc", card.description));
  if (card.level) button.append(span("upgrade-pips", "●".repeat(card.level.current) + "○".repeat(card.level.max - card.level.current)));
  if (card.cost.length > 0 && card.state !== "maxed") button.append(costChips(card));
  const badge = STATE_BADGES[card.state];
  if (card.note || badge) button.append(span("upgrade-note", card.note ?? badge ?? ""));
  button.disabled = card.state !== "ready";
  button.setAttribute("aria-label", describe(card));
  button.addEventListener("click", onPress);
  return button;
}

export interface PanelView {
  render(panel: UpgradePanel | null): void;
}

/** The workbench, suit station and dock panel: cards with material prices, and an on/off switch for workers. */
export function createPanelView(onOrder: (key: string, id: string) => void, onToggle: (key: string) => void): PanelView {
  const root = requireElement<HTMLElement>("workshop");
  const title = requireElement<HTMLElement>("workshop-title");
  const list = requireElement<HTMLElement>("upgrade-list");
  const toggle = requireElement<HTMLButtonElement>("panel-toggle");
  const toggleLabel = requireElement<HTMLElement>("panel-toggle-label");
  let key = "";
  let signature = "";
  toggle.addEventListener("click", () => onToggle(key));

  return {
    render(panel) {
      root.hidden = panel === null;
      if (!panel) {
        signature = "";
        return;
      }
      const next = JSON.stringify(panel);
      if (next === signature) return;
      signature = next;
      key = panel.key;
      title.textContent = panel.title;
      toggle.hidden = !panel.toggle;
      if (panel.toggle) {
        toggle.setAttribute("aria-pressed", String(panel.toggle.on));
        toggle.setAttribute("aria-label", panel.toggle.on ? `${panel.title} is working. Switch it off` : `${panel.title} is off. Switch it on`);
        toggleLabel.textContent = panel.toggle.label;
      }
      list.replaceChildren(
        ...panel.cards.map((card) => {
          const item = document.createElement("li");
          item.append(cardButton(card, () => onOrder(key, card.id)));
          return item;
        }),
      );
    },
  };
}
