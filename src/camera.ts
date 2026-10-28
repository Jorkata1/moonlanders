import { Vector3, type PerspectiveCamera } from "three";
import { PADS } from "./config";
import { distance, type GameState } from "./sim/state";

const FOLLOW_RATE = 6;
/** How far the camera aims past the player while a bottom-sheet panel is open on a small screen. */
const PANEL_LIFT = 2.4;
/** How far the camera aims north of the player on the launch pad, so the rocket being loaded stays in view. */
const ROCKET_FOCUS = 2.2;
const LAUNCH_OFFSET = new Vector3(7, 2.2, 9);

/** The `lift` for followShot: above an open bottom sheet, or towards the rocket from its pad. */
export function aimLift(state: GameState, sheetOpen: boolean, zoom: number): number {
  if (sheetOpen) return PANEL_LIFT * zoom;
  return distance(state.player, state.planet.rocket.pad) <= PADS.radius + 1 ? -ROCKET_FOCUS * zoom : 0;
}

/**
 * Normal play: trail the player from above and behind. Returns the remaining shake.
 * `lift` aims that far south of the player, which raises them on screen (above a bottom sheet).
 */
export function followShot(camera: PerspectiveCamera, target: Vector3, player: { x: number; z: number }, offset: Vector3, lift: number, dt: number, shake: number): number {
  target.lerp(new Vector3(player.x, 0, player.z + lift), Math.min(1, dt * FOLLOW_RATE));
  camera.position.copy(target).add(offset);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
  }
  camera.lookAt(target.x, target.y + 0.6, target.z);
  return Math.max(0, shake - dt * 1.5);
}

/** Launch: swing down to a low side shot of the pad and watch the rocket climb. */
export function launchShot(camera: PerspectiveCamera, target: Vector3, padBase: Vector3, ship: Vector3, dt: number, shake: number): number {
  const blend = Math.min(1, dt * 2.5);
  camera.position.lerp(padBase.clone().add(LAUNCH_OFFSET), blend);
  target.lerp(new Vector3(ship.x, ship.y + 2, ship.z), blend);
  if (shake > 0) camera.position.x += (Math.random() - 0.5) * shake;
  camera.lookAt(target);
  return Math.max(0, shake - dt * 1.5);
}
