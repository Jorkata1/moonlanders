import { DRILL } from "../config";
import type { Emit } from "./events";
import { boostFactor } from "./economy";
import type { GameState } from "./state";

/** Once the mining drill stands, it bores through the ridge; the way north opens when it is done. */
export function updateBoring(state: GameState, dt: number, emit: Emit): void {
  if (state.boring === null || state.boring >= 1) return;
  state.boring = Math.min(1, state.boring + (dt * boostFactor(state)) / DRILL.boreSeconds);
  if (state.boring < 1) return;
  state.built.add(state.planet.ridge.openId);
  emit({ type: "wallOpen" });
}
