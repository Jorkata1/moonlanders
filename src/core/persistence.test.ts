import { describe, expect, it } from 'vitest';
import { parseGameState } from './persistence';
import { createInitialState } from './state';

describe('parseGameState', () => {
  it('round-trips a fresh state through JSON', () => {
    const state = createInitialState();
    expect(parseGameState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('rejects unknown versions and malformed data', () => {
    const state = createInitialState();
    expect(parseGameState({ ...state, version: 99 })).toBeNull();
    expect(parseGameState({ ...state, planetIndex: 42 })).toBeNull();
    expect(parseGameState({ ...state, backpack: { gold: 3 } })).toBeNull();
    expect(parseGameState('nope')).toBeNull();
    expect(parseGameState(null)).toBeNull();
  });

  it('clamps out-of-range suit levels', () => {
    const state = createInitialState();
    const parsed = parseGameState({ ...state, suit: { capacity: 99, speed: 0, oxygen: 2 } });
    expect(parsed?.suit).toEqual({ capacity: 6, speed: 1, oxygen: 2 });
  });
});
