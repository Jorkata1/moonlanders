import { Vector3, type Scene } from "three";
import { DRONE, droneCapacityFor, type ItemId } from "../config";
import type { PlanetDef } from "../planets/types";
import type { DroneState, GameState } from "../sim/state";
import { droneModel, type DroneModel } from "./droneModel";
import { StackView, type ItemPool } from "./items";
import { heightAt } from "./terrain";

const PARKED_HEIGHT = 0.45;
const CLIMB_RATE = 2.5;
const TURN_RATE = 6;

interface DroneView {
  model: DroneModel;
  stack: StackView;
  height: number;
  heading: number;
}

export interface DronesView {
  sync(state: GameState, dt: number, time: number): void;
  /** World position of a drone's basket, for flying items. */
  positionOf(id: string): Vector3 | null;
}


function turnToward(current: number, target: number, amount: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * Math.min(1, amount);
}

export function createDronesView(scene: Scene, pool: ItemPool, planet: PlanetDef): DronesView {
  const views = new Map<string, DroneView>();

  function create(drone: DroneState): DroneView {
    const model = droneModel();
    scene.add(model.root);
    return { model, stack: new StackView(model.stackAnchor, pool, 2, 0.2), height: PARKED_HEIGHT, heading: drone.heading };
  }

  return {
    sync(state, dt, time) {
      for (const drone of state.drones) {
        const view = views.get(drone.id) ?? create(drone);
        views.set(drone.id, view);
        const parked = drone.phase === "parked";
        const targetHeight = parked ? PARKED_HEIGHT : DRONE.flightHeight;
        view.height += Math.sign(targetHeight - view.height) * Math.min(Math.abs(targetHeight - view.height), dt * CLIMB_RATE);
        view.heading = turnToward(view.heading, drone.heading, dt * TURN_RATE);
        const { model } = view;
        const bob = parked ? 0 : Math.sin(time * 3 + drone.x) * 0.08;
        model.root.position.set(drone.x, heightAt(planet, drone.x, drone.z) + view.height + bob, drone.z);
        model.root.rotation.y = view.heading;
        const flying = drone.phase === "toSource" || drone.phase === "toTarget" || drone.phase === "restocking" || drone.phase === "returning";
        model.body.rotation.x = flying ? 0.18 : 0;
        for (const rotor of model.rotors) rotor.rotation.y += dt * (parked ? 2 : 32);
        model.lights.emissive.setHex(state.enabled[drone.id] === false ? 0xff6b5a : 0x5df2a0);
        const shown = drone.cargo ? Math.min(drone.carry, droneCapacityFor(state.stages[drone.id] ?? 0)) : 0;
        view.stack.sync(new Array<ItemId>(shown).fill(drone.cargo ?? "plate"), time, 0);
      }
    },
    positionOf(id) {
      const view = views.get(id);
      return view ? view.model.stackAnchor.getWorldPosition(new Vector3()) : null;
    },
  };
}
