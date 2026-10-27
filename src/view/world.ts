import { DirectionalLight, Group, HemisphereLight, Vector3, type Object3D, type Scene } from "three";
import { ITEMS, PADS, type ItemId } from "../config";
import type { PlanetDef, Point } from "../planets/types";
import { isPadAvailable } from "../sim/economy";
import { distance, rocketComplete, type GameState } from "../sim/state";
import { bakeStatic } from "./bake";
import { buildDecor } from "./decor";
import { depositModel, syncDeposit, type DepositModel } from "./deposits";
import type { ItemPool } from "./items";
import { createMachineViews } from "./machineViews";
import { createGuide, createPilesView } from "./markers";
import { merchantModel, type MerchantModel } from "./merchant";
import { createPad, type PadView } from "./pads";
import { createStormView, type StormView } from "./storm";
import { domeModel, rocketModel, workshopModel, type RocketModel } from "./structures";
import { buildTerrain, heightAt } from "./terrain";

const SHADOW_EXTENT = 16;
const SUN_OFFSET = new Vector3(-9, 18, 7);
const POP_SECONDS = 0.6;

export interface WorldView {
  sync(state: GameState, dt: number, time: number): void;
  celebrateUnlock(id: string): void;
  rocket: RocketModel;
  merchant: MerchantModel;
  storm: StormView;
  groundAt(point: Point): Vector3;
  /** Where the player stands to open a robot's upgrade panel. */
  robotDock(id: string): Point | null;
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

export function buildWorld(scene: Scene, state: GameState, pool: ItemPool, shadowMapSize: number): WorldView {
  const planet = state.planet;
  const sun = lights(scene, planet, shadowMapSize);
  const keepClear = [
    { ...planet.dome, radius: planet.dome.radius + 1 },
    { ...planet.sellPad, radius: 2 },
    { ...planet.trader, radius: 2.4 },
    { ...planet.workshop, radius: 2.4 },
    { x: planet.rocket.x, z: planet.rocket.z, radius: 3.2 },
    { ...planet.rocket.pad, radius: 1.8 },
    ...planet.deposits.map((d) => ({ ...d, radius: 1.4 })),
    ...planet.machines.flatMap((m) => [{ ...m, radius: 2.6 }, { ...m.inputPad, radius: 1.6 }, { ...m.outputPad, radius: 1.6 }, ...(m.secondInput ? [{ ...m.secondInput.pad, radius: 1.6 }] : [])]),
    ...planet.unlocks.map((u) => ({ ...u, radius: 1.8 })),
    { x: 0, z: planet.ridge.z, radius: 4 },
  ];
  const terrain = buildTerrain(planet, keepClear);
  const decor = buildDecor(planet);
  const staticRoot = new Group();
  staticRoot.add(terrain.root, decor.root);
  bakeStatic(terrain.ridge.root);
  bakeStatic(decor.root);
  scene.add(staticRoot);

  const dome = domeModel(planet.dome.radius);
  place(dome, planet, planet.dome);
  bakeStatic(dome);
  scene.add(dome);

  const merchant = merchantModel();
  place(merchant.root, planet, planet.trader);
  bakeStatic(merchant.root);
  const sell = createPad("sell", PADS.radius, 1.2);
  sell.label.set("SELL HERE", "Zix buys everything", "ready");
  place(sell.root, planet, planet.sellPad);
  scene.add(merchant.root, sell.root);

  const workshop = workshopModel();
  place(workshop, planet, planet.workshop);
  const workshopSpot = { x: planet.workshop.x, z: planet.workshop.z + 0.6 };
  const workshopPad = createPad("workshop", PADS.radius, 2.2);
  workshopPad.label.set("WORKSHOP", "Stand here to upgrade");
  place(workshopPad.root, planet, workshopSpot);
  scene.add(workshop, workshopPad.root);

  const machines = createMachineViews(scene, planet, pool, (object, point) => place(object, planet, point));
  const storm = createStormView(scene, planet);

  const rocket = rocketModel();
  place(rocket.root, planet, planet.rocket);
  const rocketPad = createPad("rocket", PADS.radius, 1.9);
  place(rocketPad.root, planet, planet.rocket.pad);
  scene.add(rocket.root, rocketPad.root);

  const payPads = new Map<string, PadView>();
  const docks = new Map<string, PadView>();
  for (const unlock of planet.unlocks) {
    const pad = createPad("pay", PADS.radius, 2.2, true);
    place(pad.root, planet, unlock);
    scene.add(pad.root);
    payPads.set(unlock.id, pad);
    if (unlock.kind !== "robot") continue;
    const dock = createPad("workshop", PADS.radius, 1.6);
    dock.label.set(unlock.label.toUpperCase(), "Stand here to upgrade");
    place(dock.root, planet, unlock);
    scene.add(dock.root);
    docks.set(unlock.id, dock);
  }

  const deposits = new Map<string, DepositModel>();
  let depositSeed = 1;
  const syncGuide = createGuide(scene, planet);
  const syncPiles = createPilesView(scene, planet, pool);
  const pops: Array<{ object: Object3D; t: number }> = [];
  let ridgeSink = state.unlocked.has(planet.ridge.unlockId) ? 1 : 0;
  let ridgeSinking = false;
  const playerPosition = new Vector3();

  function syncRocket(time: number): void {
    rocketPad.root.visible = state.unlocked.has(planet.ridge.unlockId);
    const parts = Object.entries(planet.rocket.parts) as Array<[ItemId, number]>;
    const detail = parts.map(([item, needed]) => `${ITEMS[item].plural} ${state.rocket[item]}/${needed}`).join("  ·  ");
    if (rocketComplete(state)) rocketPad.label.set("READY TO LAUNCH", "Stand here to lift off", "ready");
    else rocketPad.label.set("LOAD THE ROCKET", detail);
    rocketPad.setActive(distance(state.player, planet.rocket.pad) <= PADS.radius, time);
    const filled = parts.reduce((sum, [item]) => sum + state.rocket[item], 0) / parts.reduce((sum, [, needed]) => sum + needed, 0);
    rocketPad.setProgress(filled);
    rocket.windowMaterial.emissiveIntensity = rocketComplete(state) ? 2 + Math.sin(time * 4) : 0.6 + filled;
  }

  function syncPads(time: number): void {
    for (const unlock of planet.unlocks) {
      const pad = payPads.get(unlock.id);
      if (!pad) continue;
      const available = isPadAvailable(state, unlock);
      pad.root.visible = available;
      const dock = docks.get(unlock.id);
      if (dock) {
        dock.root.visible = state.unlocked.has(unlock.id);
        dock.setActive(distance(state.player, unlock) <= PADS.radius, time);
      }
      if (!available) continue;
      const paid = state.paid.get(unlock.id) ?? 0;
      pad.label.set(unlock.label.toUpperCase(), `${unlock.cost - paid} credits`, "money");
      pad.setProgress(paid / unlock.cost);
      pad.setActive(distance(state.player, unlock) <= PADS.radius, time);
    }
    workshop.visible = state.unlocked.has("workshop");
    workshopPad.root.visible = workshop.visible;
    workshopPad.setActive(distance(state.player, workshopSpot) <= PADS.radius, time);
    const arm = workshop.getObjectByName("arm");
    if (arm) arm.rotation.y = Math.sin(time * 0.8) * 0.8;
    sell.setActive(distance(state.player, planet.sellPad) <= PADS.radius, time);
    // Up close the stall speaks for itself; the label would only hide Zix.
    sell.label.sprite.visible = distance(state.player, planet.sellPad) > 4;
  }

  function syncDeposits(time: number): void {
    const live = new Set<string>();
    for (const deposit of state.deposits) {
      live.add(deposit.id);
      let model = deposits.get(deposit.id);
      if (!model) {
        model = depositModel(deposit.item, depositSeed++, deposit.temporary ? 3 : 5);
        place(model.root, planet, deposit);
        scene.add(model.root);
        deposits.set(deposit.id, model);
      }
      const reachable = deposit.zone === null || state.unlocked.has(deposit.zone);
      const drilled = state.player.miningTarget === deposit.id || state.robots.some((r) => r.phase === "mining" && r.depositId === deposit.id);
      syncDeposit(model, reachable ? deposit.amount : deposit.maxAmount, deposit.maxAmount, drilled ? Math.sin(time * 50) * 0.035 : 0);
    }
    for (const [id, model] of deposits) {
      if (live.has(id)) continue;
      scene.remove(model.root);
      deposits.delete(id);
    }
  }

  return {
    rocket,
    merchant,
    storm,
    groundAt(point) {
      return new Vector3(point.x, heightAt(planet, point.x, point.z), point.z);
    },
    robotDock(id) {
      const unlock = planet.unlocks.find((u) => u.id === id && u.kind === "robot");
      return unlock ? { x: unlock.x, z: unlock.z } : null;
    },
    celebrateUnlock(id) {
      if (id === planet.ridge.unlockId) ridgeSinking = true;
      const model = machines.modelOf(id);
      if (model) pops.push({ object: model, t: 0 });
      if (id === "workshop") pops.push({ object: workshop, t: 0 });
    },
    sync(_state, dt, time) {
      machines.sync(state, time, dt);
      storm.sync(state, dt, time);
      syncRocket(time);
      syncPads(time);
      syncDeposits(time);
      syncGuide(state, time);
      syncPiles(state, time);
      decor.update(time);
      playerPosition.set(state.player.x, 1.6, state.player.z);
      merchant.update(time, dt, distance(state.player, planet.trader) < 7 ? playerPosition : null, distance(state.player, planet.sellPad) <= PADS.radius);

      if (ridgeSinking || ridgeSink >= 1) ridgeSink = Math.min(1, ridgeSink + dt / 1.2);
      for (const boulder of terrain.ridge.gapBoulders) {
        boulder.visible = ridgeSink < 1;
        boulder.scale.setScalar(Math.max(0.01, 1 - ridgeSink) * (boulder.userData.baseScale ?? (boulder.userData.baseScale = boulder.scale.x)));
      }
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
      sun.position.set(state.player.x + SUN_OFFSET.x, SUN_OFFSET.y, state.player.z + SUN_OFFSET.z);
      sun.target.position.set(state.player.x, 0, state.player.z);
    },
  };
}
