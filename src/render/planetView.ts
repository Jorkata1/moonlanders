import { Group, Mesh, Vector3, type MeshBasicMaterial } from 'three';
import { RECYCLER_OFFSET, RECYCLER_RADIUS } from '../config/balance';
import { findMachine } from '../config/planets';
import type { PlanetDefinition, Vec2 } from '../config/planets/types';
import { RESOURCES } from '../config/resources';
import { distanceBetween, offsetBy } from '../core/geometry';
import { unitsOf } from '../core/inventory';
import { acceptsInput, isAutoFeedActive } from '../core/machines';
import { ROCKET_PAD_ID, paymentProgress, type Pad } from '../core/pads';
import type { Simulation } from '../core/simulation';
import { Astronaut } from './astronaut';
import { disposeObject } from './dispose';
import { MachineMesh } from './machineMesh';
import {
  ConveyorMesh,
  DepositMesh,
  PadMesh,
  RecyclerMesh,
  createDome,
  createObjectiveArrow,
  createScaffold,
  createSuitStation,
} from './props';
import { RocketMesh } from './rocket';
import { createTerrain } from './terrain';

const ARROW_MIN_DISTANCE = 3.5;
const ARROW_LEAD = 1.7;

interface MachineView {
  readonly mesh: MachineMesh;
  readonly scaffold: Group;
  readonly conveyor: ConveyorMesh | null;
  wasBuilt: boolean;
}

/** All 3D objects for one planet, synchronised from the simulation each frame. */
export class PlanetView {
  readonly root = new Group();
  readonly astronaut: Astronaut;
  readonly rocket: RocketMesh;
  private readonly deposits = new Map<string, DepositMesh>();
  private readonly machines = new Map<string, MachineView>();
  private readonly pads = new Map<string, PadMesh>();
  private readonly recycler: RecyclerMesh;
  private readonly arrow: Mesh;
  private readonly arrowMaterial: MeshBasicMaterial;
  private readonly playerPosition = new Vector3();

  constructor(private readonly planet: PlanetDefinition) {
    const accent = planet.palette.accent;
    this.root.add(createTerrain(planet), createDome(planet.domeRadius, accent));
    this.root.add(createSuitStation(planet.suitStationPosition, accent));

    this.rocket = new RocketMesh(planet.rocketPosition, accent);
    this.root.add(this.rocket.root);
    this.recycler = new RecyclerMesh(offsetBy(planet.rocketPosition, RECYCLER_OFFSET), RECYCLER_RADIUS);
    this.root.add(this.recycler.root);

    planet.deposits.forEach((deposit, index) => {
      const mesh = new DepositMesh(deposit, planet.decorationSeed + index * 31);
      this.deposits.set(deposit.id, mesh);
      this.root.add(mesh.root);
    });

    for (const machine of planet.machines) this.createMachineView(machine.id);

    this.astronaut = new Astronaut(accent);
    this.astronaut.root.scale.setScalar(1.2);
    this.root.add(this.astronaut.root);

    this.arrow = createObjectiveArrow();
    this.arrowMaterial = this.arrow.material as MeshBasicMaterial;
    this.root.add(this.arrow);
  }

  private createMachineView(machineId: string): void {
    const machine = findMachine(this.planet, machineId);
    if (!machine) return;
    const mesh = new MachineMesh(machine.kind, this.planet.palette.accent);
    mesh.root.position.set(machine.position.x, 0, machine.position.z);
    mesh.root.visible = false;

    const scaffold = createScaffold();
    scaffold.position.copy(mesh.root.position);
    scaffold.visible = false;

    const feeder = machine.autoFeedFrom ? findMachine(this.planet, machine.autoFeedFrom) : undefined;
    const conveyor = feeder ? new ConveyorMesh(feeder.position, machine.position, RESOURCES[feeder.recipe.output].color) : null;
    if (conveyor) {
      conveyor.root.visible = false;
      this.root.add(conveyor.root);
    }

    this.root.add(mesh.root, scaffold);
    this.machines.set(machineId, { mesh, scaffold, conveyor, wasBuilt: false });
  }

  get playerWorldPosition(): Vector3 {
    return this.playerPosition;
  }

  update(simulation: Simulation, time: number, dt: number, objectiveTarget: Vec2 | null): void {
    const { player, backpack } = simulation.state;
    this.playerPosition.set(player.x, 0, player.z);
    this.astronaut.update(dt, player.x, player.z, simulation.facing, simulation.isMoving, simulation.suitStats.speed);
    this.astronaut.setCarried(unitsOf(backpack));

    for (const [id, mesh] of this.deposits) mesh.update(time, simulation.harvestingDepositId === id);
    this.updateMachines(simulation, time, dt);
    this.updatePads(simulation, time);
    this.recycler.update(time, simulation.isRecycling);

    const rocketPaid = simulation.planetState.padPayments[ROCKET_PAD_ID] ?? {};
    this.rocket.update(time, paymentProgress(this.planet.rocketCost, rocketPaid), simulation.isRocketReady);
    this.updateArrow(time, player, objectiveTarget);
  }

  private updateMachines(simulation: Simulation, time: number, dt: number): void {
    for (const machine of this.planet.machines) {
      const view = this.machines.get(machine.id);
      const state = simulation.machineState(machine.id);
      if (!view || !state) continue;

      view.mesh.root.visible = state.built;
      view.scaffold.visible = !state.built && simulation.pads.some((pad) => pad.machineId === machine.id);
      if (state.built && !view.wasBuilt && time > 0.5) view.mesh.playSpawn(time);
      view.wasBuilt = state.built;
      if (!state.built) continue;

      view.mesh.setLevel(state.level);
      view.mesh.update(time, dt, state.running);
      view.mesh.outputStack.setUniform(machine.recipe.output, state.output);

      if (!view.conveyor || !machine.autoFeedFrom) continue;
      const feeder = simulation.machineState(machine.autoFeedFrom);
      const feederDefinition = findMachine(this.planet, machine.autoFeedFrom);
      const isLinked = feeder !== undefined && isAutoFeedActive(machine, state, feeder);
      view.conveyor.root.visible = isLinked;
      const isFlowing =
        isLinked && feederDefinition !== undefined && feeder.output > 0 && acceptsInput(machine, state, feederDefinition.recipe.output);
      view.conveyor.update(dt, isFlowing);
    }
  }

  private updatePads(simulation: Simulation, time: number): void {
    const activeIds = new Set<string>();
    for (const pad of simulation.pads) {
      activeIds.add(pad.id);
      const mesh = this.pads.get(pad.id) ?? this.createPad(pad);
      mesh.setPosition(pad.position);
      const paid = simulation.planetState.padPayments[pad.id] ?? {};
      mesh.update(time, paymentProgress(pad.cost, paid), simulation.activePadId === pad.id);
    }
    for (const [id, mesh] of this.pads) {
      if (activeIds.has(id)) continue;
      this.root.remove(mesh.root);
      disposeObject(mesh.root);
      this.pads.delete(id);
    }
  }

  private createPad(pad: Pad): PadMesh {
    const mesh = new PadMesh(pad.type, pad.radius);
    this.pads.set(pad.id, mesh);
    this.root.add(mesh.root);
    return mesh;
  }

  private updateArrow(time: number, player: Vec2, target: Vec2 | null): void {
    const distance = target ? distanceBetween(player, target) : 0;
    this.arrow.visible = target !== null && distance > ARROW_MIN_DISTANCE;
    if (!target || !this.arrow.visible) return;
    const dx = (target.x - player.x) / distance;
    const dz = (target.z - player.z) / distance;
    const bob = Math.sin(time * 5) * 0.15;
    this.arrow.position.set(player.x + dx * (ARROW_LEAD + bob), 0.06, player.z + dz * (ARROW_LEAD + bob));
    // The arrow geometry points along -Z, hence the half-turn.
    this.arrow.rotation.y = Math.atan2(dx, dz) + Math.PI;
    this.arrowMaterial.opacity = 0.7 + Math.sin(time * 5) * 0.2;
  }

  dispose(): void {
    disposeObject(this.root);
    this.root.removeFromParent();
  }
}
