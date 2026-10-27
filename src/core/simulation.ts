import {
  HARVEST_INTERVAL,
  MACHINE_BODY_RADIUS,
  MACHINE_INTERACT_RADIUS,
  PLAYER_RADIUS,
  RECYCLER_OFFSET,
  RECYCLER_RADIUS,
  ROCKET_BODY_RADIUS,
  STATION_BODY_RADIUS,
  TRANSFER_INTERVAL,
  WORLD_RADIUS,
} from '../config/balance';
import { findMachine, getPlanet, isFinalPlanet } from '../config/planets';
import type { MachineDefinition, PlanetDefinition, Vec2 } from '../config/planets/types';
import type { GameEventSink } from './events';
import { clampToRadius, isWithin, offsetBy, pushOutOfCircle } from './geometry';
import { addTo, entriesOf, takeFrom, totalOf } from './inventory';
import { collectOneOutput, depositOneInput, tickAutoFeed, tickMachine } from './machines';
import { getObjective, type Objective } from './objective';
import { nextOxygenLevel, isOxygenLow } from './oxygen';
import { applyPadCompletion } from './padEffects';
import { ROCKET_PAD_ID, getActivePads, isCostPaid, payOneUnit, type Pad } from './pads';
import { ensurePlanetState, type GameState, type MachineState, type PlanetState } from './state';
import { suitStatsOf, type SuitStats } from './suit';

export const LaunchOutcome = { NextPlanet: 'nextPlanet', Completed: 'completed', NotReady: 'notReady' } as const;
export type LaunchOutcome = (typeof LaunchOutcome)[keyof typeof LaunchOutcome];

/** Pure game rules. Owns no rendering; reports noteworthy moments through `emit`. */
export class Simulation {
  isMoving = false;
  facing = 0;
  harvestingDepositId: string | null = null;
  activePadId: string | null = null;
  isRecycling = false;

  private transferTimer = 0;
  private harvestTimer = 0;
  private hasNotifiedFull = false;
  private hasNotifiedLowOxygen = false;
  private padsCache: Pad[] | null = null;

  constructor(
    readonly state: GameState,
    private readonly emit: GameEventSink,
  ) {
    ensurePlanetState(state, this.planet);
  }

  get planet(): PlanetDefinition {
    return getPlanet(this.state.planetIndex);
  }

  get planetState(): PlanetState {
    return ensurePlanetState(this.state, this.planet);
  }

  get suitStats(): SuitStats {
    return suitStatsOf(this.state.suit);
  }

  get pads(): readonly Pad[] {
    this.padsCache ??= getActivePads(this.planet, this.planetState, this.state.suit);
    return this.padsCache;
  }

  get isRocketReady(): boolean {
    return isCostPaid(this.planet.rocketCost, this.planetState.padPayments[ROCKET_PAD_ID] ?? {});
  }

  get isInsideDome(): boolean {
    return isWithin(this.state.player, { x: 0, z: 0 }, this.planet.domeRadius);
  }

  get recyclerPosition(): Vec2 {
    return offsetBy(this.planet.rocketPosition, RECYCLER_OFFSET);
  }

  get objective(): Objective {
    return getObjective({
      planet: this.planet,
      planetState: this.planetState,
      pads: this.pads,
      backpack: this.state.backpack,
      capacity: this.suitStats.capacity,
      isRocketReady: this.isRocketReady,
      recyclerPosition: this.recyclerPosition,
    });
  }

  machineState(machineId: string): MachineState | undefined {
    return this.planetState.machines[machineId];
  }

  update(dt: number, move: Vec2): void {
    this.movePlayer(dt, move);
    this.updateTransfers(dt);
    this.updateHarvest(dt);
    this.updateMachines(dt);
    this.updateOxygen(dt);
  }

  /** Moves to the next planet (or finishes the campaign) if the rocket is loaded. */
  launch(): LaunchOutcome {
    if (!this.isRocketReady) return LaunchOutcome.NotReady;
    if (isFinalPlanet(this.state.planetIndex)) {
      this.state.completed = true;
      return LaunchOutcome.Completed;
    }
    this.state.planetIndex += 1;
    const planet = this.planet;
    ensurePlanetState(this.state, planet);
    this.state.backpack = {};
    this.state.player = { ...planet.spawn };
    this.state.oxygen = this.suitStats.oxygenMax;
    this.resetTransientState();
    return LaunchOutcome.NextPlanet;
  }

  private resetTransientState(): void {
    this.padsCache = null;
    this.transferTimer = 0;
    this.harvestTimer = 0;
    this.hasNotifiedFull = false;
    this.hasNotifiedLowOxygen = false;
    this.harvestingDepositId = null;
    this.activePadId = null;
    this.isRecycling = false;
  }

  private movePlayer(dt: number, move: Vec2): void {
    const length = Math.hypot(move.x, move.z);
    this.isMoving = length > 0.05;
    if (!this.isMoving) return;

    const player = this.state.player;
    const step = (this.suitStats.speed * Math.min(1, length) * dt) / length;
    player.x += move.x * step;
    player.z += move.z * step;
    this.facing = Math.atan2(move.x, move.z);

    for (const machine of this.planet.machines) {
      if (this.machineState(machine.id)?.built) pushOutOfCircle(player, PLAYER_RADIUS, machine.position, MACHINE_BODY_RADIUS);
    }
    pushOutOfCircle(player, PLAYER_RADIUS, this.planet.rocketPosition, ROCKET_BODY_RADIUS);
    pushOutOfCircle(player, PLAYER_RADIUS, this.planet.suitStationPosition, STATION_BODY_RADIUS);
    clampToRadius(player, WORLD_RADIUS);
  }

  private updateTransfers(dt: number): void {
    this.activePadId = this.pads.find((pad) => isWithin(this.state.player, pad.position, pad.radius))?.id ?? null;
    this.isRecycling = this.activePadId === null && isWithin(this.state.player, this.recyclerPosition, RECYCLER_RADIUS);
    this.transferTimer += dt;
    while (this.transferTimer >= TRANSFER_INTERVAL) {
      this.transferTimer -= TRANSFER_INTERVAL;
      if (!this.transferOnce()) {
        this.transferTimer = 0;
        return;
      }
    }
  }

  private transferOnce(): boolean {
    const pad = this.pads.find((candidate) => candidate.id === this.activePadId);
    if (pad) return this.payPad(pad);
    if (this.isRecycling) return this.recycleOne();

    const backpack = this.state.backpack;
    for (const machine of this.planet.machines) {
      const state = this.machineState(machine.id);
      if (!state?.built || !isWithin(this.state.player, machine.position, MACHINE_INTERACT_RADIUS)) continue;

      const deposited = depositOneInput(machine, state, backpack);
      if (deposited) {
        this.emit({ type: 'deposited', resource: deposited });
        return true;
      }
      const collected = collectOneOutput(machine, state, backpack, this.suitStats.capacity);
      if (collected) {
        this.emit({ type: 'collected', resource: collected });
        return true;
      }
      if (state.output > 0) this.notifyBackpackFull();
    }
    return false;
  }

  private payPad(pad: Pad): boolean {
    const payments = this.planetState.padPayments;
    const paid = (payments[pad.id] ??= {});
    const resource = payOneUnit(pad.cost, paid, this.state.backpack);
    if (!resource) return false;
    this.emit({ type: 'padPaid', resource });
    if (isCostPaid(pad.cost, paid)) this.completePad(pad);
    return true;
  }

  private recycleOne(): boolean {
    const first = entriesOf(this.state.backpack)[0];
    if (!first) return false;
    takeFrom(this.state.backpack, first[0], 1);
    this.emit({ type: 'recycled', resource: first[0] });
    return true;
  }

  private completePad(pad: Pad): void {
    this.padsCache = null;
    const event = applyPadCompletion(pad, this.planet, this.planetState, this.state);
    if (event) this.emit(event);
    else console.error('[moonlanders] Completed pad has no valid target', pad.id);
  }

  private updateHarvest(dt: number): void {
    const deposit = this.activePadId
      ? undefined
      : this.planet.deposits.find((candidate) => isWithin(this.state.player, candidate.position, candidate.radius));
    this.harvestingDepositId = deposit?.id ?? null;
    if (!deposit) {
      this.harvestTimer = 0;
      return;
    }
    if (totalOf(this.state.backpack) >= this.suitStats.capacity) {
      this.harvestingDepositId = null;
      this.notifyBackpackFull();
      return;
    }
    this.hasNotifiedFull = false;
    this.harvestTimer += dt;
    if (this.harvestTimer < HARVEST_INTERVAL) return;
    this.harvestTimer -= HARVEST_INTERVAL;
    addTo(this.state.backpack, deposit.resource, 1);
    this.emit({ type: 'harvested', resource: deposit.resource });
  }

  private notifyBackpackFull(): void {
    if (this.hasNotifiedFull) return;
    this.hasNotifiedFull = true;
    this.emit({ type: 'backpackFull' });
  }

  private updateMachines(dt: number): void {
    const planet = this.planet;
    for (const machine of planet.machines) {
      const state = this.machineState(machine.id);
      if (!state?.built) continue;
      this.feedFromConveyor(planet, machine, state, dt);
      tickMachine(machine, state, dt);
    }
    if (totalOf(this.state.backpack) < this.suitStats.capacity) this.hasNotifiedFull = false;
  }

  private feedFromConveyor(planet: PlanetDefinition, machine: MachineDefinition, state: MachineState, dt: number): void {
    if (!machine.autoFeedFrom) return;
    const feederDefinition = findMachine(planet, machine.autoFeedFrom);
    const feeder = this.machineState(machine.autoFeedFrom);
    if (feederDefinition && feeder) tickAutoFeed(machine, state, feederDefinition, feeder, dt);
  }

  private updateOxygen(dt: number): void {
    const { oxygenMax } = this.suitStats;
    const state = this.state;
    state.oxygen = nextOxygenLevel(state.oxygen, oxygenMax, this.isInsideDome, this.planet.oxygenDrainMultiplier, dt);

    if (!isOxygenLow(state.oxygen, oxygenMax)) {
      this.hasNotifiedLowOxygen = false;
    } else if (!this.hasNotifiedLowOxygen) {
      this.hasNotifiedLowOxygen = true;
      this.emit({ type: 'oxygenLow' });
    }

    if (state.oxygen > 0) return;
    const lostItems = totalOf(state.backpack);
    state.backpack = {};
    state.player = { ...this.planet.spawn };
    state.oxygen = oxygenMax;
    this.resetTransientState();
    this.emit({ type: 'oxygenDepleted', lostItems });
  }
}
