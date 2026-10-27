// Test build: Mars storms come quickly and the player starts north of the canyon, between the engine works and the fuel synthesizer.
import { STORM } from "../src/config";
import { MARS } from "../src/planets/mars";
import "../src/main";

Object.assign(STORM as { firstDelaySeconds: number; warningSeconds: number }, { firstDelaySeconds: 4, warningSeconds: 2 });
(MARS as { spawn: { x: number; z: number } }).spawn = { x: 0, z: -16 };
