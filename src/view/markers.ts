import { ConeGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry, type Scene } from "three";
import type { PlanetDef, Point } from "../planets/types";
import { distance, type GameState } from "../sim/state";
import { StackView, type ItemPool } from "./items";
import { heightAt } from "./terrain";

const GUIDE_HIDE_DISTANCE = 2.2;
/** How long the guide shows the way after a new mission starts. */
const GUIDE_SHOW_SECONDS = 7;
const GUIDE_FADE_SECONDS = 1;
const GUIDE_OPACITY = 0.85;

/** Green arrow at the player's feet pointing to `target`, plus a ring on the target. */
export function createGuide(scene: Scene, planet: PlanetDef, target: (state: GameState) => Point | null): (state: GameState, time: number) => void {
  const material = new MeshBasicMaterial({ color: 0x5df2a0, transparent: true, opacity: GUIDE_OPACITY, depthWrite: false });
  const arrow = new Group();
  const head = new Mesh(new ConeGeometry(0.28, 0.6, 3), material);
  head.rotation.x = Math.PI / 2;
  head.position.z = 1.9;
  arrow.add(head);
  const beacon = new Mesh(new RingGeometry(1.35, 1.55, 48), material);
  beacon.rotation.x = -Math.PI / 2;
  scene.add(arrow, beacon);

  let shownFor = "";
  let shownAt = 0;

  return (state, time) => {
    const goal = target(state);
    const player = state.player;
    // Each new mission (or new place to go) shows the way once, then the guide fades out.
    const key = goal ? `${state.objectiveIndex}:${goal.x.toFixed(1)},${goal.z.toFixed(1)}` : "";
    if (key !== shownFor) {
      shownFor = key;
      shownAt = time;
    }
    const left = GUIDE_SHOW_SECONDS - (time - shownAt);
    const showing = goal !== null && left > 0;
    arrow.visible = showing && distance(player, goal) > GUIDE_HIDE_DISTANCE && player.stunned <= 0;
    beacon.visible = showing;
    if (!goal || !showing) return;
    material.opacity = GUIDE_OPACITY * Math.min(1, left / GUIDE_FADE_SECONDS);
    beacon.position.set(goal.x, heightAt(planet, goal.x, goal.z) + 0.08, goal.z);
    beacon.scale.setScalar(1 + Math.sin(time * 4) * 0.08);
    arrow.position.set(player.x, heightAt(planet, player.x, player.z) + 0.1, player.z);
    arrow.rotation.y = Math.atan2(goal.x - player.x, goal.z - player.z);
  };
}

/** Little heaps of dropped items lying on the ground. */
export function createPilesView(scene: Scene, planet: PlanetDef, pool: ItemPool): (state: GameState, time: number) => void {
  const views = new Map<number, StackView>();
  return (state, time) => {
    const live = new Set<number>();
    for (const pile of state.piles) {
      live.add(pile.id);
      let view = views.get(pile.id);
      if (!view) {
        const root = new Group();
        root.position.set(pile.x, heightAt(planet, pile.x, pile.z) + 0.02, pile.z);
        root.rotation.y = pile.id * 1.3;
        scene.add(root);
        view = new StackView(root, pool, 3, 0.24);
        views.set(pile.id, view);
      }
      view.sync(pile.items, time, 0);
    }
    for (const [id, view] of views) {
      if (live.has(id)) continue;
      view.sync([], time, 0);
      view.root.removeFromParent();
      views.delete(id);
    }
  };
}
