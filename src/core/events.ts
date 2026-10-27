import type { ResourceId } from '../config/resources';
import type { SuitStat } from './suit';

export type GameEvent =
  | { readonly type: 'harvested'; readonly resource: ResourceId }
  | { readonly type: 'deposited'; readonly resource: ResourceId }
  | { readonly type: 'collected'; readonly resource: ResourceId }
  | { readonly type: 'padPaid'; readonly resource: ResourceId }
  | { readonly type: 'recycled'; readonly resource: ResourceId }
  | { readonly type: 'machineBuilt'; readonly machineId: string; readonly name: string }
  | { readonly type: 'machineUpgraded'; readonly machineId: string; readonly name: string; readonly level: number }
  | { readonly type: 'suitUpgraded'; readonly stat: SuitStat; readonly level: number }
  | { readonly type: 'backpackFull' }
  | { readonly type: 'oxygenLow' }
  | { readonly type: 'oxygenDepleted'; readonly lostItems: number }
  | { readonly type: 'rocketReady' };

export type GameEventSink = (event: GameEvent) => void;
