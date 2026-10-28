import { CylinderGeometry, Group, SphereGeometry, TorusGeometry, Vector3, type MeshStandardMaterial, type Scene } from "three";
import { DRONE, droneCapacityFor, type ItemId } from "../config";
import type { PlanetDef } from "../planets/types";
import { zeroDroneUpgrades, type DroneState, type GameState } from "../sim/state";
import { bakeStatic } from "./bake";
import { StackView, type ItemPool } from "./items";
import { LOOK, box, glow, mesh, surface } from "./materials";
import { heightAt } from "./terrain";

const GOLD = 0xffc83d;
const PARKED_HEIGHT = 0.45;
const CLIMB_RATE = 2.5;
const TURN_RATE = 6;

interface DroneModel {
  root: Group;
  body: Group;
  rotors: Group[];
  lights: MeshStandardMaterial;
  stackAnchor: Group;
}

/** Quad-rotor cargo drone with a gold shell and an open basket underneath. */
function droneModel(): DroneModel {
  const root = new Group();
  const body = new Group();
  root.add(body);
  const shell = surface({ color: GOLD, roughness: 0.35, metalness: 0.4, reflective: true, envMapIntensity: 0.6 });
  body.add(mesh(new SphereGeometry(0.34, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), shell, 0, 0.1, 0));
  body.add(mesh(new CylinderGeometry(0.36, 0.3, 0.14, 20), LOOK.white(), 0, 0.04, 0));
  body.add(box(0.22, 0.08, 0.05, glow(0x4de3ff, 2.6), 0, 0.2, 0.3, 0.02));
  const rotors: Group[] = [];
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.sin(angle) * 0.62;
    const z = Math.cos(angle) * 0.62;
    const arm = box(0.62, 0.05, 0.07, LOOK.dark(), x / 2, 0.06, z / 2, 0.02);
    arm.rotation.y = angle + Math.PI / 2;
    body.add(arm, mesh(new CylinderGeometry(0.07, 0.08, 0.1, 10), LOOK.dark(), x, 0.08, z));
    body.add(mesh(new TorusGeometry(0.24, 0.025, 6, 20), shell, x, 0.12, z).rotateX(Math.PI / 2));
    const rotor = new Group();
    rotor.userData.dynamic = true;
    rotor.position.set(x, 0.15, z);
    rotor.add(box(0.42, 0.015, 0.06, LOOK.steel(), 0, 0, 0, 0.005), box(0.06, 0.015, 0.42, LOOK.steel(), 0, 0, 0, 0.005));
    body.add(rotor);
    rotors.push(rotor);
  }
  // Basket hanging under the body.
  const basket = new Group();
  basket.position.y = -0.18;
  basket.add(box(0.5, 0.04, 0.5, LOOK.dark(), 0, -0.12, 0, 0.015));
  for (const [x, z, w, d] of [[0, -0.24, 0.5, 0.03], [0, 0.24, 0.5, 0.03], [-0.24, 0, 0.03, 0.5], [0.24, 0, 0.03, 0.5]] as const) {
    basket.add(box(w, 0.14, d, LOOK.steel(), x, -0.05, z, 0.01));
  }
  body.add(basket);
  const stackAnchor = new Group();
  stackAnchor.userData.dynamic = true;
  stackAnchor.position.set(0, -0.28, 0);
  body.add(stackAnchor);
  const lights = surface({ color: 0x5df2a0, emissive: 0x5df2a0, emissiveIntensity: 1.5, roughness: 0.3, noShadow: true }).clone();
  for (const [x, z] of [[0.3, 0.1], [-0.3, 0.1]] as const) body.add(mesh(new SphereGeometry(0.04, 8, 6), lights, x, 0.05, z));
  bakeStatic(body);
  return { root, body, rotors, lights, stackAnchor };
}

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

function itemOf(planet: PlanetDef, drone: DroneState): ItemId {
  const machine = planet.machines.find((m) => m.id === drone.machineId);
  if (!machine) throw new Error(`Drone ${drone.id} serves unknown machine ${drone.machineId}`);
  return machine.output;
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
        const flying = drone.phase === "toMachine" || drone.phase === "toTrader" || drone.phase === "returning";
        model.body.rotation.x = flying ? 0.18 : 0;
        for (const rotor of model.rotors) rotor.rotation.y += dt * (parked ? 2 : 32);
        model.lights.emissive.setHex(state.droneEnabled[drone.id] === false ? 0xff6b5a : 0x5df2a0);
        const levels = state.droneUpgrades[drone.id] ?? zeroDroneUpgrades();
        const shown = Math.min(drone.carry, droneCapacityFor(levels.capacity));
        view.stack.sync(new Array<ItemId>(shown).fill(itemOf(planet, drone)), time, 0);
      }
    },
    positionOf(id) {
      const view = views.get(id);
      return view ? view.model.stackAnchor.getWorldPosition(new Vector3()) : null;
    },
  };
}
