import { describe, expect, it } from 'vitest';

import { getClipsToRemove, pickClip, pickInBox } from './clipPicking';

const ids = ['a', 'b', 'c', 'd', 'e'];

describe('pickClip', () => {
  it('selects only the clip on a plain click', () => {
    expect(pickClip({ ids, picked: ['a', 'b'], currentId: 'b', clickedId: 'd', how: 'one' })).toEqual({ picked: [], currentId: 'd' });
  });

  it('adds the selected clip and the one clicked with Ctrl, then takes them away again', () => {
    let state = pickClip({ ids, picked: [], currentId: 'b', clickedId: 'd', how: 'toggle' });
    expect(state).toEqual({ picked: ['b', 'd'], currentId: 'd' });
    state = pickClip({ ids, picked: state.picked, currentId: state.currentId, clickedId: 'a', how: 'toggle' });
    expect(state).toEqual({ picked: ['a', 'b', 'd'], currentId: 'a' });
    state = pickClip({ ids, picked: state.picked, currentId: state.currentId, clickedId: 'a', how: 'toggle' });
    expect(state).toEqual({ picked: ['b', 'd'], currentId: 'd' });
    state = pickClip({ ids, picked: state.picked, currentId: state.currentId, clickedId: 'b', how: 'toggle' });
    expect(state).toEqual({ picked: ['d'], currentId: 'd' });
    state = pickClip({ ids, picked: state.picked, currentId: state.currentId, clickedId: 'd', how: 'toggle' });
    expect(state).toEqual({ picked: [], currentId: 'd' });
  });

  it('picks the run from the selected clip with Shift, either way, and runs from it again', () => {
    expect(pickClip({ ids, picked: [], currentId: 'b', clickedId: 'd', how: 'range' })).toEqual({ picked: ['b', 'c', 'd'], currentId: 'b' });
    expect(pickClip({ ids, picked: ['b', 'c', 'd'], currentId: 'b', clickedId: 'a', how: 'range' })).toEqual({ picked: ['a', 'b'], currentId: 'b' });
  });
});

describe('pickInBox', () => {
  it('picks what the box touches, added to what was picked if Ctrl was held', () => {
    expect(pickInBox({ ids, before: ['a'], touched: ['d', 'c'], additive: false })).toEqual(['c', 'd']);
    expect(pickInBox({ ids, before: ['a'], touched: ['d', 'c'], additive: true })).toEqual(['a', 'c', 'd']);
  });
});

describe('getClipsToRemove', () => {
  it('removes the picked clips still there, else the selected one', () => {
    expect(getClipsToRemove({ ids, picked: ['b', 'x', 'e'], currentId: 'a' })).toEqual(['b', 'e']);
    expect(getClipsToRemove({ ids, picked: ['x'], currentId: 'a' })).toEqual(['a']);
    expect(getClipsToRemove({ ids, picked: [], currentId: 'gone' })).toEqual([]);
  });
});
