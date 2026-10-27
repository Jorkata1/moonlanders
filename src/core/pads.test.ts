import { describe, expect, it } from 'vitest';
import { MOON } from '../config/planets/moon';
import {
  PadType,
  ROCKET_PAD_ID,
  buildPadId,
  getActivePads,
  isCostPaid,
  payOneUnit,
  paymentProgress,
  remainingCost,
  upgradePadId,
} from './pads';
import { createPlanetState } from './state';
import { createSuitLevels } from './suit';

describe('getActivePads', () => {
  it('starts with only the first machine, suit pads and the rocket', () => {
    const pads = getActivePads(MOON, createPlanetState(MOON), createSuitLevels());
    const buildPads = pads.filter((pad) => pad.type === PadType.Build);
    expect(buildPads.map((pad) => pad.id)).toEqual([buildPadId('regolithDrill')]);
    expect(pads.filter((pad) => pad.type === PadType.Suit)).toHaveLength(3);
    expect(pads.some((pad) => pad.id === ROCKET_PAD_ID)).toBe(true);
  });

  it('unlocks the next machine and an upgrade pad once built', () => {
    const planetState = createPlanetState(MOON);
    const drill = planetState.machines.regolithDrill;
    if (!drill) throw new Error('missing drill state');
    drill.built = true;
    const ids = getActivePads(MOON, planetState, createSuitLevels()).map((pad) => pad.id);
    expect(ids).toContain(buildPadId('smelter'));
    expect(ids).toContain(upgradePadId('regolithDrill'));
    expect(ids).not.toContain(buildPadId('regolithDrill'));
  });

  it('hides maxed suit stats', () => {
    const suit = { ...createSuitLevels(), capacity: 6 };
    const pads = getActivePads(MOON, createPlanetState(MOON), suit);
    expect(pads.filter((pad) => pad.type === PadType.Suit)).toHaveLength(2);
  });
});

describe('payments', () => {
  it('pays one needed unit at a time and ignores unneeded resources', () => {
    const cost = { metal: 2, fuel: 1 };
    const paid = {};
    const backpack = { metal: 1, ice: 4, fuel: 1 };
    expect(payOneUnit(cost, paid, backpack)).toBe('metal');
    expect(payOneUnit(cost, paid, backpack)).toBe('fuel');
    expect(payOneUnit(cost, paid, backpack)).toBeNull();
    expect(remainingCost(cost, paid)).toEqual({ metal: 1 });
    expect(paymentProgress(cost, paid)).toBeCloseTo(2 / 3);
    expect(isCostPaid(cost, paid)).toBe(false);
    expect(backpack).toEqual({ ice: 4 });
  });
});
