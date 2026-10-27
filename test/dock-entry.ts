/** Test build: the player starts on the ore robot's dock, to exercise the robot upgrade panel. */
import { MOON } from "../src/planets/moon";
import "../src/main";

(MOON as { spawn: { x: number; z: number } }).spawn = { x: 9.6, z: -5.6 };
