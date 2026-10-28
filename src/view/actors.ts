import { Vector3, type Scene } from "three";
import { ITEMS, PLAYER, robotCapacityFor, type ItemId } from "../config";
import { createBeam, type Beam } from "./beam";
import type { PlanetDef } from "../planets/types";
import type { GameState, RobotState } from "../sim/state";
import { astronautModel, robotModel, type AstronautModel, type LaserDrill, type RobotModel } from "./characters";
import type { Effects } from "./fx";
import { StackView, type ItemPool } from "./items";
import { heightAt } from "./terrain";
import { chipColor } from "./deposits";

const STRIDE_SPEED = 11;
const TURN_SMOOTHING = 14;
const ASTRONAUT_SCALE = 1.2;
const SPARK_INTERVAL = 0.06;
const CHIP_INTERVAL = 0.22;
/** The drill arm only rises when the rock is within about 70° of where the astronaut faces. */
const ROCK_AHEAD_COS = 0.35;
/** Accent colour of each robot, matching what it mines. */
const ROBOT_ACCENTS: Record<string, number> = { "robot-iron": 0xff8a2a, "robot-carbon": 0x6f8cff, "robot-clay": 0xd8b07a };

function turnToward(current: number, target: number, amount: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * Math.min(1, amount);
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
  const aim = new Vector3();

  return {
    model,
    stack,
    sync(state, dt, time) {
      const { player, planet } = state;
      const deposit = player.miningTarget ? state.deposits.find((d) => d.id === player.miningTarget) : undefined;
      // Standing still at a rock, the astronaut turns to face it so the drill points at it.
      const facing = deposit && !player.moving ? Math.atan2(deposit.x - player.x, deposit.z - player.z) : player.heading;
      heading = turnToward(heading, facing, dt * TURN_SMOOTHING);
      const ground = heightAt(planet, player.x, player.z);
      model.root.position.set(player.x, ground, player.z);
      model.root.rotation.y = heading;
      const stride = player.moving ? Math.sin(time * STRIDE_SPEED) : 0;
      model.legs[0].rotation.x = stride * 0.7;
      model.legs[1].rotation.x = -stride * 0.7;
      model.arms[0].rotation.x = -stride * 0.6;
      // Aim the drill arm at the rock while mining; walking away from it, the drill fires from the hip.
      const rockAhead = deposit !== undefined && Math.cos(heading - Math.atan2(deposit.x - player.x, deposit.z - player.z)) > ROCK_AHEAD_COS;
      model.arms[1].rotation.x += ((rockAhead ? -1.35 : stride * 0.6) - model.arms[1].rotation.x) * Math.min(1, dt * 14);
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
        model.drill.root.getWorldPosition(aim);
        const hit = rockSurfacePoint(planet, deposit, player);
        const power = Math.min(1, player.warmup / PLAYER.warmupSeconds);
        beam.show(tip, hit, time, dt, power, aim.subVectors(tip, aim));
        sparkTimer -= dt;
        chipTimer -= dt;
        // While warming up, only a few blue sparks; the chips fly once it cuts.
        if (power < 1) {
          if (sparkTimer <= 0) {
            sparkTimer = SPARK_INTERVAL * 3;
            fx.sparks(hit, 0x9ff4ff, 1);
          }
        } else if (sparkTimer <= 0) {
          sparkTimer = SPARK_INTERVAL;
          fx.sparks(hit, 0xffb060, 3);
        }
        if (power >= 1 && chipTimer <= 0) {
          chipTimer = CHIP_INTERVAL;
          fx.chips(hit, ITEMS[deposit.item].color, chipColor(deposit.item), 2);
        }
      } else {
        beam.hide(dt);
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
        const stage = state.stages[robot.id] ?? 0;
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
        // Each stage shows: a bigger bin and brighter thrusters.
        model.bin.scale.set(1 + stage * 0.12, 1 + stage * 0.15, 1 + stage * 0.08);
        model.thrusters.emissiveIntensity = 0.4 + stage * 1.1 + (moved > 0 ? 0.8 : 0);
        view.stack.sync(new Array<ItemId>(Math.min(robot.carry, robotCapacityFor(stage))).fill(robot.item), time, 0.2);

        const mining = robot.phase === "mining" && robot.depositId !== null;
        const deposit = mining ? state.deposits.find((d) => d.id === robot.depositId) : undefined;
        model.arm.rotation.x += ((deposit ? 0.55 : -0.2) - model.arm.rotation.x) * Math.min(1, dt * 6);
        spinDrill(model.drill, deposit !== undefined, time, dt);
        if (deposit) {
          model.root.updateMatrixWorld(true);
          model.drill.tip.getWorldPosition(tip);
          const hit = rockSurfacePoint(planet, deposit, robot);
          view.beam.show(tip, hit, time, dt, 1);
          view.sparkTimer -= dt;
          if (view.sparkTimer <= 0) {
            view.sparkTimer = 0.12;
            fx.sparks(hit, 0xffb060, 2);
          }
        } else {
          view.beam.hide(dt);
        }
      }
    },
    positionOf(id) {
      const view = views.get(id);
      return view ? view.model.stackAnchor.getWorldPosition(new Vector3()) : null;
    },
  };
}
