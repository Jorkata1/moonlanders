import { DirectionalLight, Group, HemisphereLight, Vector3, type Object3D, type Scene } from "three";
import { PADS } from "../config";
import type { DropProp } from "../intro";
import type { PlanetDef, Point } from "../planets/types";
import { orderProgress, orderSite } from "../sim/orders";
import { buildDef, distance, isAvailable, rocketReady, stockpileSpot, type GameState } from "../sim/state";
import { createAssembler } from "./assemble";
import { bakeStatic } from "./bake";
import { buildDecor } from "./decor";
import { depositModel, syncDeposit, type DepositModel } from "./deposits";
import { drillRigModel } from "./drillRig";
import type { ItemPool } from "./items";
import { createMachineViews } from "./machineViews";
import { createGuide, createPilesView } from "./markers";
import { createOrderSite } from "./orderSite";
import { createPad } from "./pads";
import { rocketModel, type RocketModel } from "./rocket";
import { createStormView, type StormView } from "./storm";
import { domeModel, workshopModel } from "./structures";
import { suitStationModel, type SuitStationModel } from "./suitStation";
import { buildTerrain, heightAt } from "./terrain";
import { createWorkerSites } from "./workerSites";

const SHADOW_EXTENT = 16;
const SUN_OFFSET = new Vector3(-9, 18, 7);
const POP_SECONDS = 0.6;
/** Objectives that are about finishing an order point the guide at the hologram instead. */
const ORDER_CHECKS: ReadonlySet<string> = new Set(["built", "builtAny", "suitUpgraded"]);

export interface WorldView {
  sync(state: GameState, dt: number, time: number): void;
  rocket: RocketModel;
  suitStation: SuitStationModel;
  storm: StormView;
  groundAt(point: Point): Vector3;
  /** Animate an item riding a machine's belt in; see MachineViews.feed. */
  feedMachine(machineId: string, delay: number): void;
  onMachineIntake(handler: (at: Vector3, color: number) => void): void;
  /** Everything the intro drops in or unfolds, in their final positions. */
  introProps(): DropProp[];
  /** Assemble a finished build from the ground up. */
  assemble(buildId: string): void;
  /** The drill bit's world position while it bores, for dust and sparks. */
  drillTip(state: GameState): Vector3 | null;
}

function place(object: Object3D, planet: PlanetDef, point: Point, lift = 0): void {
  object.position.set(point.x, heightAt(planet, point.x, point.z) + lift, point.z);
}

function lights(scene: Scene, planet: PlanetDef, shadowMapSize: number): DirectionalLight {
  scene.add(new HemisphereLight(planet.palette.hemiSky, planet.palette.hemiGround, 0.7));
  const sun = new DirectionalLight(planet.palette.sun, 2.4);
  sun.castShadow = shadowMapSize > 0;
  sun.shadow.mapSize.set(shadowMapSize || 1, shadowMapSize || 1);
  Object.assign(sun.shadow.camera, { left: -SHADOW_EXTENT, right: SHADOW_EXTENT, top: SHADOW_EXTENT, bottom: -SHADOW_EXTENT, near: 1, far: 60 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  return sun;
}

function keepClear(planet: PlanetDef): Array<Point & { radius: number }> {
  return [
    { ...planet.dome, radius: planet.dome.radius + 1 },
    { ...planet.suitStation, radius: 2.4 },
    { ...planet.workbench, radius: 2.4 },
    { x: planet.rocket.x, z: planet.rocket.z, radius: 3.2 },
    { ...planet.rocket.pad, radius: 1.8 },
    ...planet.deposits.map((d) => ({ ...d, radius: 1.4 })),
    ...planet.machines.flatMap((m) => [{ ...m, radius: 2.6 }, { ...m.inputPad, radius: 1.6 }, { ...m.outputPad, radius: 1.6 }]),
    ...planet.builds.flatMap((b) => [{ ...b, radius: 1.8 }, { ...b.site, radius: 1.6 }, ...(b.kind === "robot" && !b.machineId ? [{ ...stockpileSpot(b), radius: 1.2 }] : [])]),
    { x: 0, z: planet.ridge.z, radius: 4 },
  ];
}

export function buildWorld(scene: Scene, state: GameState, pool: ItemPool, shadowMapSize: number): WorldView {
  const planet = state.planet;
  const at = (object: Object3D, point: Point) => place(object, planet, point);
  const sun = lights(scene, planet, shadowMapSize);
  const terrain = buildTerrain(planet, keepClear(planet));
  const decor = buildDecor(planet);
  const staticRoot = new Group();
  staticRoot.add(terrain.root, decor.root);
  bakeStatic(terrain.ridge.root);
  scene.add(staticRoot);

  const dome = domeModel(planet.dome.radius);
  at(dome, planet.dome);
  bakeStatic(dome);
  scene.add(dome);

  const suitStation = suitStationModel();
  at(suitStation.root, planet.suitStation);
  const suitPad = createPad("workshop", PADS.radius, 2.0, false, "suit");
  suitPad.label.set("SUIT STATION", "Stand here to upgrade");
  at(suitPad.root, planet.suitStation.pad);
  scene.add(suitStation.root, suitPad.root);

  const workbench = workshopModel();
  at(workbench, planet.workbench);
  const workbenchPad = createPad("workshop", PADS.radius, 2.2, false, "build");
  workbenchPad.label.set("WORKBENCH", "Order builds here");
  at(workbenchPad.root, planet.workbench.pad);
  scene.add(workbench, workbenchPad.root);

  const drillBuild = planet.builds.find((b) => b.kind === "drill");
  const drill = drillRigModel();
  if (drillBuild) {
    at(drill.root, drillBuild);
    // Face the middle of the ridge gap it bores through (the model's front is -z).
    drill.root.rotation.y = Math.atan2(drillBuild.x, drillBuild.z - planet.ridge.z);
    scene.add(drill.root);
  }

  const machines = createMachineViews(scene, planet, pool, at);
  const storm = createStormView(scene, planet);
  const workers = createWorkerSites(scene, planet, pool, at);

  const rocket = rocketModel();
  at(rocket.root, planet.rocket);
  const launchPad = createPad("rocket", PADS.radius, 1.9);
  launchPad.label.set("READY TO LAUNCH", "Stand here to lift off", "ready");
  at(launchPad.root, planet.rocket.pad);
  scene.add(rocket.root, launchPad.root);

  /** Models a build hologram can show a ghost of, and that assemble when finished. */
  function modelOf(buildId: string): Object3D | null {
    const build = buildDef(planet, buildId);
    if (!build) return null;
    if (build.kind === "workbench") return workbench;
    if (build.kind === "drill") return drill.root;
    if ((build.kind === "machine" || build.kind === "machineUpgrade") && build.machineId) return machines.modelOf(build.machineId);
    if (build.kind === "robot" || build.kind === "drone") return workers.dock(build.id)?.root ?? null;
    return null;
  }

  const orders = createOrderSite(scene, planet, at, modelOf);
  const assembler = createAssembler();
  const deposits = new Map<string, DepositModel>();
  let depositSeed = 1;
  const pops: Array<{ object: Object3D; t: number }> = [];
  const syncGuide = createGuide(scene, planet, (s) => {
    const objective = planet.objectives[s.objectiveIndex];
    if (!objective) return null;
    return s.order && ORDER_CHECKS.has(objective.check.kind) ? orderSite(s, s.order) : objective.target;
  });
  const syncPiles = createPilesView(scene, planet, pool);
  const tip = new Vector3();

  function syncStations(time: number, dt: number): void {
    const onSuit = distance(state.player, planet.suitStation.pad) <= PADS.radius;
    suitStation.update(time, dt, onSuit);
    suitPad.setActive(onSuit, time);
    suitPad.label.sprite.visible = !onSuit;
    const benchBuilt = state.built.has("workbench");
    workbench.visible = benchBuilt;
    workbenchPad.root.visible = benchBuilt;
    const onBench = distance(state.player, planet.workbench.pad) <= PADS.radius;
    workbenchPad.setActive(onBench, time);
    workbenchPad.label.sprite.visible = !onBench;
    const arm = workbench.getObjectByName("arm");
    if (arm) arm.rotation.y = Math.sin(time * 0.8) * 0.8;
    drill.root.visible = drillBuild !== undefined && state.built.has(drillBuild.id);
    drill.update(state.boring, time, dt);
  }

  function syncRocket(time: number, dt: number): void {
    const ready = rocketReady(state);
    launchPad.root.visible = ready;
    launchPad.setActive(distance(state.player, planet.rocket.pad) <= PADS.radius, time);
    const driveOrder = state.order?.kind === "build" && buildDef(planet, state.order.targetId)?.kind === "jumpDrive";
    const rows = driveOrder ? orderProgress(state) : [];
    const needed = rows.reduce((sum, row) => sum + row.needed, 0);
    const delivered = rows.reduce((sum, row) => sum + Math.min(row.delivered, row.needed), 0);
    rocket.windowMaterial.emissiveIntensity = ready ? 2 + Math.sin(time * 4) : 0.4;
    rocket.setBuild(needed > 0 ? delivered / needed : 0, ready, time, dt);
  }

  function syncDeposits(time: number): void {
    const live = new Set<string>();
    for (const deposit of state.deposits) {
      live.add(deposit.id);
      let model = deposits.get(deposit.id);
      if (!model) {
        model = depositModel(deposit.item, depositSeed++, 5);
        at(model.root, deposit);
        model.root.rotation.y = depositSeed * 1.7;
        scene.add(model.root);
        deposits.set(deposit.id, model);
        // Nodes that fell from the sky pop up out of their impact crater.
        if (time > 0) pops.push({ object: model.root, t: 0 });
      }
      const reachable = isAvailable(state, deposit.zone);
      const drilled = state.player.miningTarget === deposit.id || state.robots.some((r) => r.phase === "mining" && r.depositId === deposit.id);
      syncDeposit(model, reachable ? deposit.amount : deposit.maxAmount, deposit.maxAmount, drilled ? Math.sin(time * 50) * 0.035 : 0);
    }
    for (const [id, model] of deposits) {
      if (live.has(id)) continue;
      scene.remove(model.root);
      deposits.delete(id);
    }
  }

  function syncPops(dt: number): void {
    for (let i = pops.length - 1; i >= 0; i -= 1) {
      const pop = pops[i] as { object: Object3D; t: number };
      pop.t += dt / POP_SECONDS;
      const t = Math.min(1, pop.t);
      pop.object.scale.setScalar(Math.max(0.01, t * (1 + Math.sin(t * Math.PI) * 0.18)));
      if (pop.t >= 1) {
        pop.object.scale.setScalar(1);
        pops.splice(i, 1);
      }
    }
  }

  return {
    rocket,
    suitStation,
    storm,
    groundAt(point) {
      return new Vector3(point.x, heightAt(planet, point.x, point.z), point.z);
    },
    introProps() {
      return [
        { object: dome, kind: "dome" },
        { object: suitStation.root, kind: "station" },
        ...decor.pieces.map((piece): DropProp => ({ object: piece.root, kind: piece.kind === "cable" ? "cable" : "decor" })),
        { object: suitPad.root, kind: "pad" },
      ];
    },
    feedMachine(machineId, delay) {
      machines.feed(machineId, delay);
    },
    onMachineIntake(handler) {
      machines.onIntake(handler);
    },
    assemble(buildId) {
      const model = modelOf(buildId);
      if (model) assembler.start(model);
      if (buildDef(planet, buildId)?.kind === "workbench") assembler.start(workbenchPad.root);
    },
    drillTip(s) {
      if (s.boring === null || s.boring >= 1 || !drill.root.visible) return null;
      return drill.tip.getWorldPosition(tip);
    },
    sync(_state, dt, time) {
      machines.sync(state, time, dt);
      storm.sync(state, dt, time);
      syncStations(time, dt);
      syncRocket(time, dt);
      workers.sync(state, time);
      orders.sync(state, time);
      syncDeposits(time);
      syncGuide(state, time);
      syncPiles(state, time);
      decor.update(time);
      assembler.update(dt);
      syncPops(dt);
      // The gap boulders crumble away as the drill bores through them.
      const bored = state.boring ?? 0;
      for (const boulder of terrain.ridge.gapBoulders) {
        const base = (boulder.userData.baseScale as number | undefined) ?? (boulder.userData.baseScale = boulder.scale.x);
        boulder.visible = bored < 1;
        boulder.scale.setScalar(Math.max(0.01, 1 - bored) * base);
      }
      sun.position.set(state.player.x + SUN_OFFSET.x, SUN_OFFSET.y, state.player.z + SUN_OFFSET.z);
      sun.target.position.set(state.player.x, 0, state.player.z);
    },
  };
}
