import { resourceColorCss, resourceName, type ResourceBag } from '../config/resources';
import { entriesOf, totalOf } from '../core/inventory';
import { element } from './dom';
import { createIcon } from './icons';

export const ToastTone = {
  Info: 'info',
  Success: 'success',
  Warning: 'warning',
  Danger: 'danger',
} as const;
export type ToastTone = (typeof ToastTone)[keyof typeof ToastTone];

const TOAST_LIFETIME_MS = 2600;
const MAX_TOASTS = 3;

export interface HudHandlers {
  readonly onLaunch: () => void;
  readonly onMenu: () => void;
  readonly onToggleSound: () => void;
}

/** In-game heads-up display. All writes are diffed to avoid layout churn. */
export class Hud {
  readonly root: HTMLElement;
  private readonly planetName = element('span', { className: 'hud-planet__name' });
  private readonly planetStep = element('span', { className: 'hud-planet__step' });
  private readonly objectiveText = element('p', { className: 'hud-objective__text' });
  private readonly oxygenFill = element('div', { className: 'hud-oxygen__fill' });
  private readonly oxygenValue = element('span', { className: 'hud-oxygen__value' });
  private readonly oxygenMeter: HTMLDivElement;
  private readonly backpackCount = element('span', { className: 'hud-backpack__count' });
  private readonly backpackItems = element('ul', { className: 'hud-backpack__items', attributes: { 'aria-label': 'Backpack contents' } });
  private readonly soundButton: HTMLButtonElement;
  private readonly launchButton: HTMLButtonElement;
  private readonly toasts = element('div', { className: 'hud-toasts', attributes: { role: 'status', 'aria-live': 'polite' } });
  private readonly hint = element('p', {
    className: 'hud-hint',
    text: window.matchMedia('(pointer: coarse)').matches ? 'Drag anywhere to move' : 'Use WASD, arrows or drag to move',
  });
  private readonly cache = new Map<string, string>();

  constructor(container: HTMLElement, handlers: HudHandlers) {
    this.soundButton = element('button', { className: 'icon-button', attributes: { type: 'button' } });
    this.soundButton.addEventListener('click', handlers.onToggleSound);
    const menuButton = element('button', { className: 'icon-button', attributes: { type: 'button', 'aria-label': 'Open menu' } }, [createIcon('menu')]);
    menuButton.addEventListener('click', handlers.onMenu);

    this.launchButton = element('button', { className: 'launch-button', attributes: { type: 'button' } }, [
      createIcon('rocket', 24),
      element('span', { text: 'Launch' }),
    ]);
    this.launchButton.hidden = true;
    this.launchButton.addEventListener('click', handlers.onLaunch);

    this.oxygenMeter = element('div', {
      className: 'hud-oxygen',
      attributes: { role: 'meter', 'aria-label': 'Oxygen', 'aria-valuemin': '0', 'aria-valuemax': '100' },
    }, [
      createIcon('wind', 16),
      element('div', { className: 'hud-oxygen__track' }, [this.oxygenFill]),
      this.oxygenValue,
    ]);

    const topBar = element('div', { className: 'hud-top' }, [
      element('div', { className: 'hud-row' }, [
        element('div', { className: 'hud-planet' }, [this.planetName, this.planetStep]),
        element('div', { className: 'hud-actions' }, [this.soundButton, menuButton]),
      ]),
      this.oxygenMeter,
      element('div', { className: 'hud-objective' }, [createIcon('target', 16), this.objectiveText]),
      this.toasts,
    ]);

    const backpack = element('section', { className: 'hud-backpack', attributes: { 'aria-label': 'Backpack' } }, [
      element('div', { className: 'hud-backpack__header' }, [createIcon('backpack', 16), this.backpackCount]),
      this.backpackItems,
    ]);

    const bottomBar = element('div', { className: 'hud-bottom' }, [backpack, this.launchButton]);
    this.root = element('div', { className: 'hud' }, [topBar, this.hint, bottomBar]);
    container.appendChild(this.root);
  }

  /** Writes `value` via `apply` only when it differs from the last write for `key`. */
  private write(key: string, value: string, apply: (value: string) => void): void {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    apply(value);
  }

  setPlanet(name: string, index: number, total: number): void {
    this.write('planet', name, (value) => (this.planetName.textContent = value));
    this.write('planetStep', `${index + 1}/${total}`, (value) => (this.planetStep.textContent = `Planet ${value}`));
  }

  setObjective(text: string): void {
    this.write('objective', text, (value) => (this.objectiveText.textContent = value));
  }

  setOxygen(current: number, max: number, isLow: boolean, isRefilling: boolean): void {
    const ratio = max > 0 ? current / max : 0;
    const percent = Math.round(ratio * 100);
    this.write('oxygenFill', ratio.toFixed(3), (value) => (this.oxygenFill.style.transform = `scaleX(${value})`));
    this.write('oxygenValue', `${Math.ceil(current)}s`, (value) => (this.oxygenValue.textContent = value));
    this.write('oxygenAria', String(percent), (value) => {
      this.oxygenMeter.setAttribute('aria-valuenow', value);
      this.oxygenMeter.setAttribute('aria-valuetext', `${value}% oxygen`);
    });
    const state = isLow ? 'low' : isRefilling ? 'refill' : 'normal';
    this.write('oxygenState', state, (value) => (this.oxygenMeter.dataset.state = value));
  }

  setBackpack(bag: Readonly<ResourceBag>, capacity: number): void {
    const total = totalOf(bag);
    this.write('backpackCount', `${total}/${capacity}`, (value) => {
      this.backpackCount.textContent = value;
      this.backpackCount.dataset.full = String(total >= capacity);
    });
    const entries = entriesOf(bag);
    this.write('backpackItems', JSON.stringify(entries), () => {
      const items = entries.map(([id, amount]) => {
        const swatch = element('span', { className: 'swatch' });
        swatch.style.background = resourceColorCss(id);
        return element('li', { className: 'resource-chip', attributes: { title: resourceName(id) } }, [
          swatch,
          element('span', { className: 'resource-chip__name', text: resourceName(id) }),
          element('span', { className: 'resource-chip__amount', text: String(amount) }),
        ]);
      });
      if (items.length === 0) items.push(element('li', { className: 'hud-backpack__empty', text: 'Empty' }));
      this.backpackItems.replaceChildren(...items);
    });
  }

  setLaunchAvailable(isAvailable: boolean): void {
    this.write('launch', String(isAvailable), () => {
      this.launchButton.hidden = !isAvailable;
      this.launchButton.disabled = !isAvailable;
    });
  }

  setLaunchPending(isPending: boolean): void {
    this.launchButton.disabled = isPending;
    this.launchButton.setAttribute('aria-busy', String(isPending));
  }

  setMuted(isMuted: boolean): void {
    this.write('muted', String(isMuted), () => {
      this.soundButton.replaceChildren(createIcon(isMuted ? 'volumeOff' : 'volume'));
      this.soundButton.setAttribute('aria-label', isMuted ? 'Unmute sound' : 'Mute sound');
      this.soundButton.setAttribute('aria-pressed', String(isMuted));
    });
  }

  setHintVisible(isVisible: boolean): void {
    this.write('hint', String(isVisible), () => this.hint.classList.toggle('is-hidden', !isVisible));
  }

  setVisible(isVisible: boolean): void {
    this.root.classList.toggle('is-hidden', !isVisible);
  }

  toast(message: string, tone: ToastTone = ToastTone.Info): void {
    const toast = element('p', { className: `toast toast--${tone}`, text: message });
    this.toasts.appendChild(toast);
    while (this.toasts.childElementCount > MAX_TOASTS) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => {
      toast.classList.add('is-leaving');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
      window.setTimeout(() => toast.remove(), 400);
    }, TOAST_LIFETIME_MS);
  }
}
