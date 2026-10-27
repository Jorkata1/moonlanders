import { SoundId, type Sfx } from '../audio/sfx';
import type { GameEvent } from '../core/events';
import { SUIT_STAT_LABEL } from '../core/suit';
import { ToastTone, type Hud } from '../ui/hud';

export interface FeedbackTargets {
  readonly hud: Hud;
  readonly sfx: Sfx;
  /** Small camera shake; implementations should respect reduced motion. */
  readonly shake: (strength: number) => void;
  /** Called after a teleport so the camera can snap instead of sweeping. */
  readonly onPlayerTeleported: () => void;
}

/** Translates simulation events into sound, toasts and camera feel. */
export function presentEvent(event: GameEvent, targets: FeedbackTargets): void {
  const { hud, sfx } = targets;
  switch (event.type) {
    case 'harvested':
      sfx.play(SoundId.Harvest);
      return;
    case 'deposited':
      sfx.play(SoundId.Deposit);
      return;
    case 'collected':
      sfx.play(SoundId.Collect);
      return;
    case 'padPaid':
      sfx.play(SoundId.Pay);
      return;
    case 'recycled':
      sfx.play(SoundId.Harvest);
      return;
    case 'machineBuilt':
      sfx.play(SoundId.Build);
      targets.shake(0.25);
      hud.toast(`${event.name} built!`, ToastTone.Success);
      return;
    case 'machineUpgraded':
      sfx.play(SoundId.Upgrade);
      hud.toast(`${event.name} upgraded to Lv${event.level}`, ToastTone.Success);
      return;
    case 'suitUpgraded':
      sfx.play(SoundId.Upgrade);
      hud.toast(`${SUIT_STAT_LABEL[event.stat]} upgraded to Lv${event.level}`, ToastTone.Success);
      return;
    case 'backpackFull':
      hud.toast('Backpack full: deliver your load', ToastTone.Info);
      return;
    case 'oxygenLow':
      sfx.play(SoundId.Warning);
      hud.toast('Oxygen low! Head back to the dome', ToastTone.Warning);
      return;
    case 'oxygenDepleted':
      sfx.play(SoundId.Depleted);
      hud.toast(
        event.lostItems > 0 ? `Out of oxygen! Rescued to base, lost ${event.lostItems} items` : 'Out of oxygen! Rescued to base',
        ToastTone.Danger,
      );
      targets.onPlayerTeleported();
      return;
    case 'rocketReady':
      sfx.play(SoundId.Ready);
      hud.toast('Rocket loaded! Press Launch', ToastTone.Success);
      return;
  }
}
