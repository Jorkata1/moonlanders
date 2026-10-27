import { Vector3 } from "three";
import type { AudioKit, Cue } from "./audio";
import { ITEMS, ROBOT_UPGRADES, UPGRADES } from "./config";
import type { Hud } from "./hud";
import type { Point } from "./planets/types";
import type { SimEvent } from "./sim/events";
import type { GameState } from "./sim/state";
import type { PlayerView, RobotsView } from "./view/actors";
import type { Effects } from "./view/fx";
import { chipColor } from "./view/deposits";
import type { WorldView } from "./view/world";

const SOUND_GAP_SECONDS = 0.05;

export interface FeedbackHooks {
  save(): void;
  shake(amount: number): void;
  launch(): void;
  firstMeteor(): void;
  firstStorm(): void;
}

/** Turns simulation events into sound, particles, flying items and HUD messages. */
export function createFeedback(state: GameState, world: WorldView, player: PlayerView, robots: RobotsView, fx: Effects, hud: Hud, audio: AudioKit, hooks: FeedbackHooks) {
  let lastSound = -1;
  let clock = 0;
  let backpackToastCooldown = 0;

  function sound(cue: Cue): void {
    if (clock - lastSound < SOUND_GAP_SECONDS) return;
    lastSound = clock;
    audio.play(cue);
  }

  function lift(point: Point, y: number): Vector3 {
    return world.groundAt(point).add(new Vector3(0, y, 0));
  }

  function handle(event: SimEvent): void {
    switch (event.type) {
      case "mined": {
        if (event.robotId === null) {
          fx.flyItem(event.item, lift(event.from, 0.5), () => player.stackTop());
          sound("mine");
        } else {
          const robotId = event.robotId;
          const from = lift(event.from, 0.5);
          fx.flyItem(event.item, from, () => robots.positionOf(robotId) ?? from);
        }
        fx.chips(lift(event.from, 0.4), ITEMS[event.item].color, chipColor(event.item), 4);
        return;
      }
      case "sold":
        fx.flyItem(event.item, player.stackTop(), () => lift(state.planet.trader, 1.3));
        fx.floatText(`+${event.credits}`, "#ffd25a", lift(state.planet.sellPad, 2.2));
        world.merchant.cheer();
        sound("coin");
        return;
      case "delivered":
        fx.flyItem(event.item, player.stackTop(), () => lift(event.to, 1.4));
        sound("drop");
        return;
      case "pickedUp":
        fx.flyItem(event.item, lift(event.from, 0.6), () => player.stackTop());
        sound("pickup");
        return;
      case "dropped":
        fx.flyItem(event.item, player.stackTop(), () => lift(event.at, 0.1));
        sound("drop");
        return;
      case "robotUnloaded": {
        const from = robots.positionOf(event.robotId);
        if (from) fx.flyItem(event.item, from, () => lift(event.to, 1.4));
        return;
      }
      case "paying":
        sound("pay");
        return;
      case "unlocked": {
        const unlock = state.planet.unlocks.find((u) => u.id === event.id);
        world.celebrateUnlock(event.id);
        if (unlock) fx.dust(lift(unlock, 0.2), 22);
        audio.play("build");
        hud.toast(`${unlock?.label ?? "Unlocked"} ready!`, "good");
        hooks.save();
        return;
      }
      case "upgraded":
        audio.play("upgrade");
        hud.toast(`${UPGRADES[event.id].name} level ${event.level}`, "good");
        hooks.save();
        return;
      case "robotUpgraded":
        audio.play("upgrade");
        hud.toast(`${ROBOT_UPGRADES[event.id].name} level ${event.level}`, "good");
        hooks.save();
        return;
      case "meteorWarning":
        fx.meteorWarning(event.id, event.at.x, event.at.z, world.groundAt(event.at).y);
        audio.play("warning");
        hooks.firstMeteor();
        return;
      case "meteorImpact":
        fx.meteorImpact(event.id);
        audio.play("impact");
        hooks.shake(0.5);
        if (event.hitPlayer) hud.toast(event.itemsLost > 0 ? `Meteor hit! You dropped ${event.itemsLost} items` : "Meteor hit! Watch the red circles", "bad");
        return;
      case "stormWarning":
        audio.play("warning");
        hud.toast(`Dust storm in ${event.seconds} s! Get to the dome or push through slowly`, "bad");
        hooks.firstStorm();
        return;
      case "stormStart":
        audio.play("wind");
        hooks.shake(0.2);
        hud.toast("Dust storm! Air drains twice as fast outside the dome", "bad");
        return;
      case "stormEnd":
        audio.play("objective");
        hud.toast("The storm has passed", "good");
        return;
      case "oxygenLow":
        audio.play("alarm");
        hud.toast("Oxygen low! Head back to the dome", "bad");
        return;
      case "oxygenOut":
        hud.flash();
        hud.toast(event.itemsLost > 0 ? `Out of air! You lost ${event.itemsLost} items` : "Out of air! Back to the dome", "bad");
        return;
      case "backpackFull":
        if (backpackToastCooldown > 0) return;
        backpackToastCooldown = 4;
        hud.toast("Backpack full. Sell it, feed a machine or drop something", "info");
        return;
      case "objective":
        audio.play("objective");
        hooks.save();
        return;
      case "rocketComplete":
        audio.play("objective");
        hud.toast("Rocket loaded! Step on the pad to launch", "good");
        return;
      case "launch":
        audio.play("launch");
        hooks.launch();
        hooks.save();
    }
  }

  return {
    handle,
    tick(dt: number) {
      clock += dt;
      backpackToastCooldown = Math.max(0, backpackToastCooldown - dt);
    },
  };
}
