/** Test build: the player starts beside the iron rocks, to exercise mining, the backpack list and dropping. */
import { MOON } from "../src/planets/moon";
import "../src/main";

(MOON as { spawn: { x: number; z: number } }).spawn = { x: 8.7, z: 5.0 };
