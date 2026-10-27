import { AdditiveBlending, CylinderGeometry, Mesh, MeshBasicMaterial, PointLight, Sprite, SpriteMaterial, Vector3, type Scene } from "three";
import { ITEMS, robotCapacityFor, type ItemId } from "../config";
import type { PlanetDef } from "../planets/types";
import type { GameState, RobotState } from "../sim/state";
import { astronautModel, robotModel, type AstronautModel, type LaserDrill, type RobotModel } from "./characters";
import type { Effects } from "./fx";
import { StackView, type ItemPool } from "./items";
import { heightAt } from "./terrain";
import { canvasTexture } from "./textures";

const STRIDE_SPEED = 11;
const TURN_SMOOTHING = 14;
const ASTRONAUT_SCALE = 1.2;
const SPARK_INTERVAL = 0.06;
const CHIP_INTERVAL = 0.22;
const ROBOT_ACCENTS: Record<string, number> = { "robot-smelter": 0xff8a2a, "robot-purifier": 0x2fb7c9 };

function turnToward(current: number, target: number, amount: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * Math.min(1, amount);
}

function glowSpriteMap() {
  return canvasTexture("beam-glow", 64, 64, (ctx) => {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.25, "rgba(255, 200, 120, 0.8)");
    gradient.addColorStop(1, "rgba(255, 120, 40, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  });
}

/** A short cutting beam from a drill tip to the rock, with a hot spot and a flickering light. */
export interface Beam {
  show(from: Vector3, to: Vector3, time: number, strength: number): void;
  hide(): void;
}

export function createBeam(scene: Scene, withLight: boolean): Beam {
  const core = new Mesh(new CylinderGeometry(0.018, 0.018, 1, 6), new MeshBasicMaterial({ color: 0xfff1d0 }));
  const halo = new Mesh(new CylinderGeometry(0.07, 0.05, 1, 10, 1, true), new MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false }));
  const hotspot = new Sprite(new SpriteMaterial({ map: glowSpriteMap(), transparent: true, blending: AdditiveBlending, depthWrite: false }));
  const light = withLight ? new PointLight(0xff8a3a, 0, 3, 2) : null;
  for (const object of [core, halo, hotspot]) {
    object.visible = false;
    scene.add(object);
  }
  if (light) scene.add(light);
  const mid = new Vector3();
  return {
    show(from, to, time, strength) {
      const length = from.distanceTo(to);
      mid.copy(from).lerp(to, 0.5);
      for (const piece of [core, halo]) {
        piece.visible = true;
        piece.position.copy(mid);
        piece.scale.set(1 + Math.sin(time * 60) * 0.25 * strength, length, 1 + Math.sin(time * 60) * 0.25 * strength);
        piece.lookAt(to);
        piece.rotateX(Math.PI / 2);
      }
      hotspot.visible = true;
      hotspot.position.copy(to);
      hotspot.scale.setScalar((0.45 + Math.sin(time * 45) * 0.12) * strength);
      if (light) {
        light.position.copy(to).add(new Vector3(0, 0.25, 0));
        light.intensity = (2.5 + Math.sin(time * 37) * 0.8) * strength;
      }
    },
    hide() {
      core.visible = false;
      halo.visible = false;
      hotspot.visible = false;
      if (light) light.intensity = 0;
    },
  };
}

/** Point on the rock's surface facing the miner, a little above the ground. */
function rockSurfacePoint(planet: PlanetDef, rock: { x: number; z: number }, from: { x: number; z: number }): Vector3 {
  const dx = from.x - rock.x;
  const dz = from.z - rock.z;
  const d = Math.hypot(dx, dz) || 1;
  const x = rock.x + (dx / d) * 0.38;
  const z = rock.z + (dz / d) * 0.38;
  return new Vector3(x, heightAt(planet, rock.x, rock.z) + 0.35, z);
}

function spinDrill(drill: LaserDrill, active: boolean, time: number, dt: number): void {
  drill.prongs.rotation.y += dt * (active ? 25 : 1);
  drill.coils.emissive.setHex(active ? 0xff8a2a : 0x4de3ff);
  drill.coils.emissiveIntensity = active ? 2.5 + Math.sin(time * 30) * 0.8 : 1;
}

export interface PlayerView {
  readonly model: AstronautModel;
  readonly stack: StackView;
  sync(state: GameState, dt: number, time: number): void;
  stackTop(): Vector3;
}

export function createPlayerView(scene: Scene, pool: ItemPool, fx: Effects): PlayerView {
  const model = astronautModel();
  model.root.scale.setScalar(ASTRONAUT_SCALE);
  scene.add(model.root);
  const stack = new StackView(model.stackAnchor, pool, 2, 0.27);
  const beam = createBeam(scene, true);
  let heading = Math.PI;
  let fall = 0;
  let sparkTimer = 0;
  let chipTimer = 0;
  let dustTimer = 0;
  const tip = new Vector3();

  return {
    model,
    stack,
    sync(state, dt, time) {
      const { player, planet } = state;
      heading = turnToward(heading, player.heading, dt * TURN_SMOOTHING);
      const ground = heightAt(planet, player.x, player.z);
      model.root.position.set(player.x, ground, player.z);
      model.root.rotation.y = heading;
      const stride = player.moving ? Math.sin(time * STRIDE_SPEED) : 0;
      model.legs[0].rotation.x = stride * 0.7;
      model.legs[1].rotation.x = -stride * 0.7;
      model.arms[0].rotation.x = -stride * 0.6;
      const deposit = player.miningTarget ? state.deposits.find((d) => d.id === player.miningTarget) : undefined;
      // Aim the drill arm at the rock while mining.
      model.arms[1].rotation.x += ((deposit ? -1.35 : stride * 0.6) - model.arms[1].rotation.x) * Math.min(1, dt * 14);
      model.body.position.y = player.moving ? Math.abs(stride) * 0.05 : Math.sin(time * 2) * 0.012;
      fall += ((player.stunned > 0 ? 1 : 0) - fall) * Math.min(1, dt * 10);
      model.body.rotation.x = -fall * 1.25;
      model.body.position.z = fall * 0.5;
      stack.root.visible = fall < 0.5;
      stack.sync(player.carry, time, player.moving ? 1 : 0.2);
      model.headlamp.intensity = 6 * (1 - fall);

      spinDrill(model.drill, deposit !== undefined, time, dt);
      if (deposit) {
        model.root.updateMatrixWorld(true);
        model.drill.tip.getWorldPosition(tip);
        const hit = rockSurfacePoint(planet, deposit, player);
        beam.show(tip, hit, time, 1);
        sparkTimer -= dt;
        chipTimer -= dt;
        if (sparkTimer <= 0) {
          sparkTimer = SPARK_INTERVAL;
          fx.sparks(hit, 0xffb060, 3);
        }
        if (chipTimer <= 0) {
          chipTimer = CHIP_INTERVAL;
          fx.chips(hit, ITEMS[deposit.item].color, deposit.item === "ice" ? 0xbfefff : 0x4a4550, 2);
        }
      } else {
        beam.hide();
      }

      dustTimer -= dt;
      if (player.moving && dustTimer <= 0) {
        dustTimer = 0.18;
        fx.dust(new Vector3(player.x, ground + 0.05, player.z), 1, 0x9a9cae);
      }
    },
    stackTop() {
      return model.stackAnchor.localToWorld(new Vector3(0, stack.topLocalY() + 0.1, 0));
    },
  };
}

interface RobotView {
  model: RobotModel;
  stack: StackView;
  beam: Beam;
  heading: number;
  lastX: number;
  lastZ: number;
  sparkTimer: number;
}

export interface RobotsView {
  sync(state: GameState, dt: number, time: number): void;
  positionOf(id: string): Vector3 | null;
}

export function createRobotsView(scene: Scene, pool: ItemPool, planet: PlanetDef, fx: Effects): RobotsView {
  const views = new Map<string, RobotView>();
  const tip = new Vector3();

  function inputItem(robot: RobotState): ItemId {
    const machine = planet.machines.find((m) => m.id === robot.machineId);
    if (!machine) throw new Error(`Robot ${robot.id} serves unknown machine ${robot.machineId}`);
    return machine.input;
  }

  function create(robot: RobotState): RobotView {
    const model = robotModel(ROBOT_ACCENTS[robot.id] ?? 0x4de3ff);
    scene.add(model.root);
    return { model, stack: new StackView(model.stackAnchor, pool, 3, 0.2), beam: createBeam(scene, false), heading: robot.heading, lastX: robot.x, lastZ: robot.z, sparkTimer: 0 };
  }

  return {
    sync(state, dt, time) {
      for (const robot of state.robots) {
        const view = views.get(robot.id) ?? create(robot);
        views.set(robot.id, view);
        const levels = state.robotUpgrades[robot.id] ?? { speed: 0, capacity: 0, mining: 0 };
        const moved = Math.hypot(robot.x - view.lastX, robot.z - view.lastZ);
        view.lastX = robot.x;
        view.lastZ = robot.z;
        view.heading = turnToward(view.heading, robot.heading, dt * 8);
        const { model } = view;
        model.root.position.set(robot.x, heightAt(planet, robot.x, robot.z), robot.z);
        model.root.rotation.y = view.heading;
        for (const wheel of model.wheels) wheel.rotation.x += moved / 0.15;
        model.chassis.position.y = moved > 0 ? Math.sin(time * 30) * 0.01 : 0;
        model.head.rotation.y = Math.sin(time * 0.8 + robot.x) * 0.6;
        model.bin.scale.set(1 + levels.capacity * 0.12, 1 + levels.capacity * 0.15, 1 + levels.capacity * 0.08);
        model.thrusters.emissiveIntensity = 0.4 + levels.speed * 1.1 + (moved > 0 ? 0.8 : 0);
        const capacity = robotCapacityFor(levels.capacity);
        view.stack.sync(new Array<ItemId>(Math.min(robot.carry, capacity)).fill(inputItem(robot)), time, 0.2);

        const mining = robot.phase === "mining" && robot.depositId !== null;
        const deposit = mining ? state.deposits.find((d) => d.id === robot.depositId) : undefined;
        model.arm.rotation.x += ((deposit ? 0.55 : -0.2) - model.arm.rotation.x) * Math.min(1, dt * 6);
        spinDrill(model.drill, deposit !== undefined, time, dt);
        if (deposit) {
          model.root.updateMatrixWorld(true);
          model.drill.tip.getWorldPosition(tip);
          const hit = rockSurfacePoint(planet, deposit, robot);
          view.beam.show(tip, hit, time, 0.7 + levels.mining * 0.15);
          view.sparkTimer -= dt;
          if (view.sparkTimer <= 0) {
            view.sparkTimer = 0.12;
            fx.sparks(hit, 0xffb060, 2);
          }
        } else {
          view.beam.hide();
        }
      }
    },
    positionOf(id) {
      const view = views.get(id);
      return view ? view.model.stackAnchor.getWorldPosition(new Vector3()) : null;
    },
  };
}
