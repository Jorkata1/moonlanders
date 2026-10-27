import { Vector3, type PerspectiveCamera } from "three";

const FOLLOW_RATE = 6;
const LAUNCH_OFFSET = new Vector3(7, 2.2, 9);

/** Normal play: trail the player from above and behind. Returns the remaining shake. */
export function followShot(camera: PerspectiveCamera, target: Vector3, player: { x: number; z: number }, offset: Vector3, dt: number, shake: number): number {
  target.lerp(new Vector3(player.x, 0, player.z), Math.min(1, dt * FOLLOW_RATE));
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
