import { Vector3 } from "three";
import type { AudioKit, Cue } from "./audio";
import { ITEMS, SUIT_UPGRADES, type SuitUpgradeId } from "./config";
import { vibrate } from "./haptics";
import type { Hud } from "./hud";
import type { Point } from "./planets/types";
import type { SimEvent } from "./sim/events";
import { buildDef, type GameState, type OrderKind } from "./sim/state";
import type { PlayerView, RobotsView } from "./view/actors";
import { chipColor } from "./view/deposits";
import type { DronesView } from "./view/drones";
import { FLY_SECONDS, type Effects } from "./view/fx";
import type { WorldView } from "./view/world";

const SOUND_GAP_SECONDS = 0.05;
/** Material landing closer than this rattles the camera and thuds. */
const NEAR_IMPACT_DISTANCE = 7;
/** Height above an input pad where handed-over items land before riding the belt. */
const PAD_DROP_HEIGHT = 0.35;
/** Height of a hologram's board, where delivered materials fly to. */
const SITE_DROP_HEIGHT = 1.2;

export interface FeedbackHooks {
  save(): void;
  shake(amount: number): void;
  launch(): void;
  firstOreFall(): void;
  firstStorm(): void;
}

/** What a finished order is called in the "done" message. */
function finishedText(state: GameState, kind: OrderKind, targetId: string): string {
  if (kind === "suit") {
    const id = targetId as SuitUpgradeId;
    return `${SUIT_UPGRADES[id].name} level ${state.suit[id]}`;
  }
  const label = buildDef(state.planet, targetId)?.label ?? targetId;
  return kind === "stage" ? `${label} stage ${state.stages[targetId] ?? 0}` : `${label} built!`;
}

/** Turns simulation events into sound, particles, flying items and HUD messages. */
export function createFeedback(state: GameState, world: WorldView, player: PlayerView, robots: RobotsView, drones: DronesView, fx: Effects, hud: Hud, audio: AudioKit, hooks: FeedbackHooks) {
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

  /** Where a worker (robot or drone) holds its cargo, or null for the player. */
  function holderOf(by: string | null): Vector3 | null {
    if (by === null) return player.stackTop();
    return robots.positionOf(by) ?? drones.positionOf(by);
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
      case "drillLocked":
        fx.sparks(lift(event.at, 0.6), 0x9ff4ff, 8);
        sound("lock");
        vibrate(12);
        return;
      case "fed": {
        const from = holderOf(event.by);
        if (from) fx.flyItem(event.item, from, () => lift(event.to, PAD_DROP_HEIGHT));
        world.feedMachine(event.machineId, from ? FLY_SECONDS : 0);
        if (event.by === null) sound("drop");
        return;
      }
      case "pickedUp":
        fx.flyItem(event.item, lift(event.from, 0.6), () => player.stackTop());
        sound("pickup");
        return;
      case "dropped":
        fx.flyItem(event.item, player.stackTop(), () => lift(event.at, 0.1));
        sound("drop");
        return;
      case "orderStarted":
        audio.play("pay");
        hooks.save();
        return;
      case "orderDelivered": {
        const from = holderOf(event.by) ?? lift(event.from, 1);
        fx.flyItem(event.item, from, () => lift(event.to, SITE_DROP_HEIGHT));
        sound("pay");
        return;
      }
      case "orderComplete":
        if (event.kind === "build") world.assemble(event.targetId);
        fx.dust(lift(event.at, 0.2), 26);
        fx.sparks(lift(event.at, 1), 0x9ff4ff, 14);
        audio.play(event.kind === "build" ? "build" : "upgrade");
        vibrate(35);
        hud.toast(buildDef(state.planet, event.targetId)?.kind === "jumpDrive" ? "Jump drive ready! Step on the launch pad" : finishedText(state, event.kind, event.targetId), "good");
        hooks.save();
        return;
      case "stockpiled": {
        const from = robots.positionOf(event.robotId);
        if (from) fx.flyItem(event.item, from, () => lift(event.to, 0.3));
        return;
      }
      case "droneLoaded": {
        const droneId = event.droneId;
        fx.flyItem(event.item, lift(event.from, 0.6), () => drones.positionOf(droneId) ?? lift(event.from, 2));
        return;
      }
      case "oreIncoming":
        fx.oreFall(event.id, event.item, event.at.x, event.at.z, world.groundAt(event.at).y, event.seconds);
        hooks.firstOreFall();
        return;
      case "oreLanded": {
        fx.oreLand(event.id);
        if (Math.hypot(state.player.x - event.at.x, state.player.z - event.at.z) < NEAR_IMPACT_DISTANCE) {
          sound("thud");
          hooks.shake(0.15);
        }
        return;
      }
      case "wallOpen":
        audio.play("build");
        vibrate([40, 40, 80]);
        hooks.shake(0.35);
        hud.toast("The drill is through! The way north is open", "good");
        hooks.save();
        return;
      case "stormWarning":
        audio.play("warning");
        hud.toast(`Dust storm in ${event.seconds} s! Get to the dome or push through slowly`, "bad");
        hooks.firstStorm();
        return;
      case "stormStart":
        audio.play("wind");
        vibrate([40, 60, 40]);
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
        vibrate(90);
        hud.toast(event.itemsLost > 0 ? `Out of air! You lost ${event.itemsLost} items` : "Out of air! Back to the dome", "bad");
        return;
      case "backpackFull":
        if (backpackToastCooldown > 0) return;
        backpackToastCooldown = 4;
        hud.toast("Backpack full. Bring it to a hologram, feed a machine or drop something", "info");
        vibrate(20);
        return;
      case "objective":
        audio.play("objective");
        hooks.save();
        return;
      case "launch":
        audio.play("launch");
        vibrate([60, 40, 140]);
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
