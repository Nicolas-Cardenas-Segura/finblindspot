import { describe, expect, it } from 'vitest';
import { emptyProfile } from '../src/core/profile';
import { applyAnswer, initialState, nextDomain, selectMode, confirmPending } from '../src/core/interview';

describe('interview state', () => {
  it('starts with a mode choice and then residency', () => {
    expect(initialState().mode).toBeNull();
    expect(nextDomain(selectMode(initialState(), 'quick'))).toBe('residency');
  });
  it('records unknown without replacing it with zero', () => {
    const result = applyAnswer(emptyProfile(), selectMode(initialState(), 'quick'), 'residency', { status: 'unknown' });
    expect(result.profile.residency.status).toBe('unknown');
    expect(nextDomain(result.state)).toBe('income');
  });
  it('requires confirmation before replacing a recorded answer', () => {
    const first = applyAnswer(emptyProfile(), selectMode(initialState(), 'full'), 'age', { status: 'known', value: 35 });
    const correction = applyAnswer(first.profile, first.state, 'age', { status: 'known', value: 36 });
    expect(correction.profile.age).toEqual({ status: 'known', value: 35 });
    expect(correction.state.pending?.domain).toBe('age');
    expect(confirmPending(correction.profile, correction.state, true).profile.age).toEqual({ status: 'known', value: 36 });
  });
  it('invalid data never advances the interview', () => {
    const state = selectMode(initialState(), 'quick');
    expect(() => applyAnswer(emptyProfile(), state, 'income', { status: 'known', value: -10 })).toThrow();
    expect(state.answered).toEqual([]);
  });
});
