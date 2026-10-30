import type { IntroCut } from "./intro";

/** What the cut picker drives: play one cut (by index) or the whole intro (null), and report where playback is. */
export interface CutPlayer {
  play(cut: number | null): void;
  now(): { cut: number | null; seconds: number };
}

export interface CutPicker {
  /** Refresh the status line; cheap to call every frame. */
  update(): void;
}

/**
 * Review mode (open the game with #cuts): a bar of buttons over the intro, one per cut plus the
 * whole run, so each shot can be watched again on its own. Keys 1–8 pick a cut, 0 plays everything.
 */
export function mountCutPicker(cuts: readonly IntroCut[], player: CutPlayer): CutPicker {
  document.body.classList.add("is-cut-review");
  const bar = document.createElement("nav");
  bar.className = "cut-picker";
  bar.setAttribute("aria-label", "Intro cuts");
  const status = document.createElement("p");
  status.className = "cut-status";
  status.setAttribute("aria-live", "off");
  const row = document.createElement("div");
  row.className = "cut-buttons";
  const buttons: HTMLButtonElement[] = [];

  const add = (label: string, cut: number | null) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cut-button";
    button.textContent = label;
    button.addEventListener("click", () => player.play(cut));
    row.append(button);
    buttons.push(button);
  };
  add("All", null);
  cuts.forEach((cut, i) => add(`${i + 1} ${cut.name}`, i));
  bar.append(status, row);
  document.body.append(bar);

  window.addEventListener("keydown", (event) => {
    const digit = Number(event.key);
    if (!Number.isInteger(digit) || event.key.length !== 1 || digit > cuts.length) return;
    player.play(digit === 0 ? null : digit - 1);
  });

  let shown = "";
  return {
    update() {
      const { cut, seconds } = player.now();
      const name = cut === null ? "Whole intro" : `Cut ${cut + 1} · ${cuts[cut]?.name ?? ""}`;
      const text = `${name} — ${seconds.toFixed(2)} s`;
      if (text === shown) return;
      shown = text;
      status.textContent = text;
      buttons.forEach((button, i) => button.setAttribute("aria-pressed", String((i === 0 ? null : i - 1) === cut)));
    },
  };
}
