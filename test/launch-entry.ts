/** Test build: spawns the player on the rocket pad with a loaded rocket, to exercise the launch sequence. */
import { MOON } from "../src/planets/moon";
import "../src/main";

(MOON as { spawn: { x: number; z: number } }).spawn = { x: MOON.rocket.pad.x, z: MOON.rocket.pad.z + 0.6 };
