import { Vector3, type Group, type Object3D, type Scene } from "three";
import { ITEMS, PADS, type ItemId } from "../config";
import type { MachineDef, MachineModelId, PlanetDef, Point } from "../planets/types";
import { machineStats } from "../sim/economy";
import { distance, type GameState, type MachineState } from "../sim/state";
import { bakeStatic } from "./bake";
import { StackView, type ItemPool } from "./items";
import type { MachineModel, MachineStatus } from "./machineParts";
import { refineryModel, smelterModel } from "./machines";
import { createPad, type PadView } from "./pads";

const MAX_TRAY_ITEMS = 8;
const NEAR_LABEL_DISTANCE = 6.5;
const INTAKE_SECONDS = 0.9;
const OUTFLOW_SECONDS = 0.6;
/** Never animate more than this many items along one route at once; the rest just appear. */
const MAX_FLOWS_PER_ROUTE = 4;
/** Input/output labels sit low and in front of their pad so they never hide the belt or chute. */
const PAD_LABEL_HEIGHT = 0.55;
const PAD_LABEL_FORWARD = 1.15;

const MODELS: Record<MachineModelId, () => MachineModel> = {
  smelter: smelterModel,
  refinery: refineryModel,
};

interface MachineView {
  readonly model: MachineModel;
  readonly input: PadView;
  readonly inputStack: StackView;
  /** World-space belt route, starting just above the input pad. */
  readonly inputRoute: Vector3[];
  inFlight: number;
  readonly output: PadView;
  readonly outputStack: StackView;
  readonly outputRoute: Vector3[];
  outFlight: number;
  lastProcessed: number;
}

/** An item model riding along a route of points. */
interface Flow {
  readonly model: Group;
  readonly route: readonly Vector3[];
  t: number;
  delay: number;
  readonly seconds: number;
  readonly done: () => void;
}

export interface MachineViews {
  sync(state: GameState, time: number, dt: number): void;
  /** Animate an item riding the belt into a machine; `delay` lets a hand-off flight land first. */
  feed(machineId: string, delay: number): void;
  /** The model to assemble when a machine is built, if `id` is a machine. */
  modelOf(id: string): Object3D | null;
  /** Called with a world position and colour whenever an item drops into a hopper. */
  onIntake(handler: (at: Vector3, color: number) => void): void;
}

type Place = (object: Object3D, point: Point) => void;

function worldRoute(model: MachineModel, local: readonly Vector3[], start?: Vector3): Vector3[] {
  model.root.updateMatrixWorld(true);
  const route = local.map((point) => model.root.localToWorld(point.clone()));
  return start ? [start, ...route] : route;
}

function pointAlong(route: readonly Vector3[], t: number, out: Vector3): Vector3 {
  const segments = route.length - 1;
  const scaled = Math.min(0.9999, Math.max(0, t)) * segments;
  const index = Math.floor(scaled);
  const a = route[index] as Vector3;
  const b = route[index + 1] as Vector3;
  return out.lerpVectors(a, b, scaled - index);
}

function padAt(scene: Scene, place: Place, style: "input" | "output", at: Point): PadView {
  const pad = createPad(style, 0.95, PAD_LABEL_HEIGHT);
  pad.label.sprite.position.z = PAD_LABEL_FORWARD;
  place(pad.root, at);
  scene.add(pad.root);
  return pad;
}

function createView(scene: Scene, place: Place, pool: ItemPool, def: MachineDef): MachineView {
  const model = MODELS[def.model]();
  place(model.root, def);
  bakeStatic(model.root);
  scene.add(model.root);
  const input = padAt(scene, place, "input", def.inputPad);
  const output = padAt(scene, place, "output", def.outputPad);
  const start = input.root.position.clone().add(new Vector3(0, 0.35, 0));
  return {
    model,
    input,
    inputStack: new StackView(model.inputTray, pool, 3, 0.26),
    inputRoute: worldRoute(model, model.inputPath, start),
    inFlight: 0,
    output,
    outputStack: new StackView(model.outputTray, pool, 3, 0.3),
    outputRoute: worldRoute(model, model.outputPath),
    outFlight: 0,
    lastProcessed: -1,
  };
}

function statusOf(state: GameState, def: MachineDef, machine: MachineState): MachineStatus {
  if (machine.progress !== null) return "working";
  return machine.output >= machineStats(state, def).outputCapacity ? "blocked" : "idle";
}

export function createMachineViews(scene: Scene, planet: PlanetDef, pool: ItemPool, place: Place): MachineViews {
  const views = new Map<string, MachineView>(planet.machines.map((def) => [def.id, createView(scene, place, pool, def)]));
  const flows: Flow[] = [];
  const scratch = new Vector3();
  let intakeHandler: (at: Vector3, color: number) => void = () => undefined;

  function launch(item: ItemId, route: readonly Vector3[], seconds: number, delay: number, done: () => void): void {
    const model = pool.take(item);
    model.visible = delay <= 0;
    model.position.copy(route[0] as Vector3);
    scene.add(model);
    flows.push({ model, route, t: 0, delay, seconds, done });
  }

  function updateFlows(dt: number): void {
    for (let i = flows.length - 1; i >= 0; i -= 1) {
      const flow = flows[i] as Flow;
      if (flow.delay > 0) {
        flow.delay -= dt;
        flow.model.visible = flow.delay <= 0;
        continue;
      }
      flow.t += dt / flow.seconds;
      pointAlong(flow.route, flow.t, flow.model.position);
      flow.model.rotation.y += dt * 3;
      if (flow.t < 1) continue;
      pool.give(flow.model);
      flows.splice(i, 1);
      flow.done();
    }
  }

  function syncOne(state: GameState, def: MachineDef, view: MachineView, machine: MachineState, time: number, dt: number): void {
    const built = state.built.has(def.id);
    for (const object of [view.model.root, view.output.root, view.input.root]) object.visible = built;
    if (!built) {
      view.lastProcessed = machine.processed;
      return;
    }
    view.model.update(time, dt, machine.progress !== null, machine.progress ?? 0);
    view.model.rig.update(statusOf(state, def, machine), time, dt);

    // Each finished item slides out of the hatch and down the chute before it joins the pile.
    if (view.lastProcessed >= 0) {
      const made = Math.min(MAX_FLOWS_PER_ROUTE, machine.processed - view.lastProcessed);
      for (let i = 0; i < made && view.outFlight < MAX_FLOWS_PER_ROUTE; i += 1) {
        view.outFlight += 1;
        launch(def.output, view.outputRoute, OUTFLOW_SECONDS, i * 0.2, () => (view.outFlight -= 1));
      }
    }
    view.lastProcessed = machine.processed;

    const stats = machineStats(state, def);
    const near = distance(state.player, def) < NEAR_LABEL_DISTANCE;
    const shownInput = Math.max(0, Math.min(machine.input - view.inFlight, MAX_TRAY_ITEMS));
    view.inputStack.sync(new Array<ItemId>(shownInput).fill(def.input), time, 0);
    view.input.label.set(`${ITEMS[def.input].name.toUpperCase()} IN`, `${machine.input}/${stats.inputCapacity}`, machine.input >= stats.inputCapacity ? "warning" : "neutral");
    view.input.setActive(distance(state.player, def.inputPad) <= PADS.radius, time);
    view.input.label.sprite.visible = near;
    const shownOutput = Math.max(0, Math.min(machine.output - view.outFlight, MAX_TRAY_ITEMS));
    view.outputStack.sync(new Array<ItemId>(shownOutput).fill(def.output), time, 0);
    view.output.label.set(ITEMS[def.output].plural.toUpperCase(), `${machine.output}/${stats.outputCapacity} ready`, machine.output > 0 ? "ready" : "neutral");
    view.output.setActive(distance(state.player, def.outputPad) <= PADS.radius, time);
    view.output.label.sprite.visible = near || machine.output >= stats.outputCapacity;
  }

  return {
    sync(state, time, dt) {
      updateFlows(dt);
      for (const def of planet.machines) {
        const view = views.get(def.id);
        const machine = state.machines.get(def.id);
        if (view && machine) syncOne(state, def, view, machine, time, dt);
      }
    },
    feed(machineId, delay) {
      const view = views.get(machineId);
      const def = planet.machines.find((m) => m.id === machineId);
      if (!view || !def || view.inFlight >= MAX_FLOWS_PER_ROUTE) return;
      view.inFlight += 1;
      const hopper = view.inputRoute[view.inputRoute.length - 1] as Vector3;
      launch(def.input, view.inputRoute, INTAKE_SECONDS, delay, () => {
        view.inFlight -= 1;
        intakeHandler(scratch.copy(hopper), ITEMS[def.input].color);
      });
    },
    modelOf(id) {
      return views.get(id)?.model.root ?? null;
    },
    onIntake(handler) {
      intakeHandler = handler;
    },
  };
}
