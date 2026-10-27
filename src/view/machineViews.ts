import type { Group, Object3D, Scene } from "three";
import { ITEMS, MACHINE, PADS, type ItemId } from "../config";
import type { MachineDef, MachineModelId, PlanetDef, Point } from "../planets/types";
import { distance, type GameState, type MachineState } from "../sim/state";
import { bakeStatic } from "./bake";
import { StackView, type ItemPool } from "./items";
import { purifierModel, smelterModel, type MachineModel } from "./machines";
import { engineWorksModel, fuelSynthModel, wireMillModel } from "./marsMachines";
import { createPad, type PadView } from "./pads";

const MAX_TRAY_ITEMS = 8;
const NEAR_LABEL_DISTANCE = 6.5;

const MODELS: Record<MachineModelId, () => MachineModel> = {
  smelter: smelterModel,
  purifier: purifierModel,
  wireMill: wireMillModel,
  fuelSynth: fuelSynthModel,
  engineWorks: engineWorksModel,
};

interface InputView {
  readonly item: ItemId;
  readonly at: Point;
  readonly pad: PadView;
  readonly stack: StackView;
  readonly stock: (machine: MachineState) => number;
}

interface MachineView {
  readonly model: MachineModel;
  readonly inputs: readonly InputView[];
  readonly output: PadView;
  readonly outputStack: StackView;
}

export interface MachineViews {
  sync(state: GameState, time: number, dt: number): void;
  /** The model to pop in when a machine is built, if `id` is a machine. */
  modelOf(id: string): Object3D | null;
}

type Place = (object: Object3D, point: Point) => void;

function inputView(scene: Scene, place: Place, pool: ItemPool, tray: Group, item: ItemId, at: Point, stock: InputView["stock"]): InputView {
  const pad = createPad("input", 0.95, 1.5);
  place(pad.root, at);
  scene.add(pad.root);
  return { item, at, pad, stack: new StackView(tray, pool, 3, 0.26), stock };
}

function createView(scene: Scene, place: Place, pool: ItemPool, def: MachineDef): MachineView {
  const model = MODELS[def.model]();
  place(model.root, def);
  bakeStatic(model.root);
  scene.add(model.root);
  const inputs = [inputView(scene, place, pool, model.inputTray, def.input, def.inputPad, (m) => m.input)];
  if (def.secondInput) {
    const tray = model.secondTray ?? model.inputTray;
    inputs.push(inputView(scene, place, pool, tray, def.secondInput.item, def.secondInput.pad, (m) => m.secondInput));
  }
  const output = createPad("output", 0.95, 1.5);
  place(output.root, def.outputPad);
  scene.add(output.root);
  return { model, inputs, output, outputStack: new StackView(model.outputTray, pool, 3, 0.3) };
}

export function createMachineViews(scene: Scene, planet: PlanetDef, pool: ItemPool, place: Place): MachineViews {
  const views = new Map<string, MachineView>(planet.machines.map((def) => [def.id, createView(scene, place, pool, def)]));

  function syncOne(state: GameState, def: MachineDef, view: MachineView, machine: MachineState, time: number, dt: number): void {
    const built = state.unlocked.has(def.id);
    for (const object of [view.model.root, view.output.root, ...view.inputs.map((input) => input.pad.root)]) object.visible = built;
    if (!built) return;
    view.model.update(time, dt, machine.progress !== null, machine.progress ?? 0);
    const near = distance(state.player, def) < NEAR_LABEL_DISTANCE;
    for (const input of view.inputs) {
      const stock = input.stock(machine);
      input.stack.sync(new Array<ItemId>(Math.min(stock, MAX_TRAY_ITEMS)).fill(input.item), time, 0);
      input.pad.label.set(`${ITEMS[input.item].name.toUpperCase()} IN`, `${stock}/${MACHINE.inputCapacity}`, stock >= MACHINE.inputCapacity ? "warning" : "neutral");
      input.pad.setActive(distance(state.player, input.at) <= PADS.radius, time);
      input.pad.label.sprite.visible = near;
    }
    view.outputStack.sync(new Array<ItemId>(Math.min(machine.output, MAX_TRAY_ITEMS)).fill(def.output), time, 0);
    view.output.label.set(ITEMS[def.output].plural.toUpperCase(), `${machine.output} ready`, machine.output > 0 ? "ready" : "neutral");
    view.output.setActive(distance(state.player, def.outputPad) <= PADS.radius, time);
    view.output.label.sprite.visible = near || machine.output >= MACHINE.outputCapacity;
  }

  return {
    sync(state, time, dt) {
      for (const def of planet.machines) {
        const view = views.get(def.id);
        const machine = state.machines.get(def.id);
        if (view && machine) syncOne(state, def, view, machine, time, dt);
      }
    },
    modelOf(id) {
      return views.get(id)?.model.root ?? null;
    },
  };
}
