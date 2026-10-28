import { Group, type Object3D, type Scene } from "three";
import { PADS, ROBOT, type ItemId } from "../config";
import type { PlanetDef, Point } from "../planets/types";
import { distance, stockpileSpot, workerBuilds, type GameState } from "../sim/state";
import { StackView, type ItemPool } from "./items";
import { createLabel, type Label } from "./labels";
import { createPad, type PadView } from "./pads";

/** A stockpile shows at most this many models; the label gives the real count. */
const MAX_SHOWN = 24;
const STOCK_LABEL_HEIGHT = 1.1;

interface Stockpile {
  readonly stack: StackView;
  readonly label: Label;
  readonly root: Group;
  readonly item: ItemId;
}

export interface WorkerSitesView {
  sync(state: GameState, time: number): void;
  /** Docks of finished robots and drones, for the intro and the build ghosts. */
  dock(id: string): PadView | null;
}

/** Each robot's and drone's dock (where its panel opens), and material robots' stockpiles beside them. */
export function createWorkerSites(scene: Scene, planet: PlanetDef, pool: ItemPool, place: (object: Object3D, point: Point) => void): WorkerSitesView {
  const docks = new Map<string, PadView>();
  const stockpiles = new Map<string, Stockpile>();
  for (const build of workerBuilds(planet)) {
    const dock = createPad("workshop", PADS.radius, 1.6, false, build.kind === "drone" ? "drone" : "robot");
    dock.label.set(build.label.toUpperCase(), "Stand here to upgrade");
    place(dock.root, build);
    dock.root.visible = false;
    scene.add(dock.root);
    docks.set(build.id, dock);
    if (build.kind !== "robot" || build.machineId || !build.item) continue;
    const root = new Group();
    place(root, stockpileSpot(build));
    const label = createLabel(1.3);
    label.sprite.position.y = STOCK_LABEL_HEIGHT;
    root.add(label.sprite);
    scene.add(root);
    stockpiles.set(build.id, { stack: new StackView(root, pool, 4, 0.24), label, root, item: build.item });
  }

  return {
    sync(state, time) {
      for (const [id, dock] of docks) {
        const build = planet.builds.find((b) => b.id === id);
        dock.root.visible = state.built.has(id);
        if (!build || !dock.root.visible) continue;
        const onDock = distance(state.player, build) <= PADS.radius;
        dock.setActive(onDock, time);
        // Once you stand on it the panel names it; the board would only sit behind your helmet.
        dock.label.sprite.visible = !onDock;
      }
      for (const [id, pile] of stockpiles) {
        const count = state.stockpiles[id] ?? 0;
        pile.root.visible = state.built.has(id) && count > 0;
        pile.stack.sync(new Array<ItemId>(Math.min(count, MAX_SHOWN)).fill(pile.item), time, 0);
        pile.label.set(`${count}/${ROBOT.stockpileCapacity}`, "", count >= ROBOT.stockpileCapacity ? "warning" : "neutral");
        pile.label.sprite.position.y = STOCK_LABEL_HEIGHT + pile.stack.topLocalY() * 0.5;
      }
    },
    dock(id) {
      return docks.get(id) ?? null;
    },
  };
}
