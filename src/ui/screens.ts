import { element, prefersReducedMotion } from './dom';
import { createIcon, type IconName } from './icons';

const FADE_MS = 450;
const INTRO_VISIBLE_MS = 3200;
const RESTART_CONFIRM_MS = 4000;

interface DialogAction {
  readonly label: string;
  readonly icon?: IconName;
  readonly variant: 'primary' | 'secondary' | 'danger';
  readonly onSelect: (button: HTMLButtonElement) => void;
}

interface DialogSpec {
  readonly title: string;
  readonly body: readonly string[];
  readonly actions: readonly DialogAction[];
  readonly eyebrow?: string;
  /** Called on Escape; omit to make the dialog non-dismissable. */
  readonly onDismiss?: () => void;
}

function actionButton(action: DialogAction): HTMLButtonElement {
  const button = element('button', { className: `button button--${action.variant}`, attributes: { type: 'button' } }, [
    ...(action.icon ? [createIcon(action.icon)] : []),
    element('span', { text: action.label }),
  ]);
  button.addEventListener('click', () => action.onSelect(button));
  return button;
}

/** Modal dialogs, transitions and banners layered over the game. */
export class Screens {
  private readonly fade = element('div', { className: 'screen-fade', attributes: { 'aria-hidden': 'true' } });
  private readonly banner = element('div', { className: 'planet-banner', attributes: { role: 'status', 'aria-live': 'polite' } });
  private activeDialog: HTMLDialogElement | null = null;
  private bannerTimer = 0;

  constructor(private readonly container: HTMLElement) {
    container.append(this.fade, this.banner);
  }

  get isDialogOpen(): boolean {
    return this.activeDialog !== null;
  }

  private open(spec: DialogSpec): void {
    this.close();
    const titleId = `dialog-title-${Date.now()}`;
    const dialog = element('dialog', { className: 'dialog', attributes: { 'aria-labelledby': titleId } }, [
      ...(spec.eyebrow ? [element('p', { className: 'dialog__eyebrow', text: spec.eyebrow })] : []),
      element('h2', { className: 'dialog__title', text: spec.title, attributes: { id: titleId } }),
      ...spec.body.map((paragraph) => element('p', { className: 'dialog__body', text: paragraph })),
      element('div', { className: 'dialog__actions' }, spec.actions.map(actionButton)),
    ]);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      spec.onDismiss?.();
    });
    this.container.appendChild(dialog);
    dialog.showModal();
    this.activeDialog = dialog;
  }

  close(): void {
    if (!this.activeDialog) return;
    this.activeDialog.close();
    this.activeDialog.remove();
    this.activeDialog = null;
  }

  showStart(options: { hasSave: boolean; onContinue: () => void; onNewGame: () => void }): void {
    const actions: DialogAction[] = options.hasSave
      ? [
          { label: 'Continue', icon: 'play', variant: 'primary', onSelect: options.onContinue },
          { label: 'New game', icon: 'rotate', variant: 'secondary', onSelect: options.onNewGame },
        ]
      : [{ label: 'Start mission', icon: 'play', variant: 'primary', onSelect: options.onNewGame }];
    this.open({
      eyebrow: 'Moonlanders',
      title: 'Build your way across the solar system',
      body: [
        'Dig resources, feed your machines and upgrade your suit. Load the rocket with what it needs, then launch to the next world.',
        'Your oxygen only refills inside the dome. If it runs out you are rescued to base, but you lose everything you were carrying.',
      ],
      actions,
    });
  }

  showPause(options: { onResume: () => void; onRestart: () => void }): void {
    let confirmUntil = 0;
    this.open({
      title: 'Paused',
      body: ['Progress saves automatically every few seconds.'],
      onDismiss: options.onResume,
      actions: [
        { label: 'Resume', icon: 'play', variant: 'primary', onSelect: options.onResume },
        {
          label: 'Restart progress',
          icon: 'rotate',
          variant: 'danger',
          onSelect: (button) => {
            if (Date.now() < confirmUntil) {
              options.onRestart();
              return;
            }
            confirmUntil = Date.now() + RESTART_CONFIRM_MS;
            const label = button.querySelector('span');
            if (label) label.textContent = 'Tap again to erase all progress';
          },
        },
      ],
    });
  }

  showVictory(options: { onKeepPlaying: () => void; onRestart: () => void }): void {
    this.open({
      eyebrow: 'Mission complete',
      title: 'Warp drive online!',
      body: [
        'You tamed the Moon, Mars and Europa and built a ship that can leave the solar system behind. Well done, pioneer.',
      ],
      onDismiss: options.onKeepPlaying,
      actions: [
        { label: 'Keep exploring', icon: 'play', variant: 'primary', onSelect: options.onKeepPlaying },
        { label: 'New game', icon: 'rotate', variant: 'secondary', onSelect: options.onRestart },
      ],
    });
  }

  showFatalError(message: string): void {
    this.open({
      title: 'Something went wrong',
      body: [message],
      actions: [{ label: 'Reload', icon: 'rotate', variant: 'primary', onSelect: () => window.location.reload() }],
    });
  }

  showPlanetBanner(name: string, tagline: string): void {
    window.clearTimeout(this.bannerTimer);
    this.banner.replaceChildren(
      element('p', { className: 'planet-banner__title', text: `Welcome to ${name}` }),
      element('p', { className: 'planet-banner__tagline', text: tagline }),
    );
    this.banner.classList.add('is-visible');
    this.bannerTimer = window.setTimeout(() => this.banner.classList.remove('is-visible'), INTRO_VISIBLE_MS);
  }

  /** Fades to black; resolves once fully covered. */
  fadeOut(): Promise<void> {
    return this.setFade(true);
  }

  fadeIn(): Promise<void> {
    return this.setFade(false);
  }

  private setFade(isCovered: boolean): Promise<void> {
    this.fade.classList.toggle('is-covered', isCovered);
    const duration = prefersReducedMotion() ? 0 : FADE_MS;
    return new Promise((resolve) => window.setTimeout(resolve, duration));
  }
}
