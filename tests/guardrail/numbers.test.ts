import { describe, it, expect } from 'vitest';
import { allowedNumbers, hasInventedNumber } from '../../src/guardrail/numbers.js';
import { computeDerived } from '../../src/engine/derived.js';
import { computeProjection } from '../../src/engine/projection.js';
import { DEFAULT_ASSUMPTIONS } from '../../src/config/assumptions.js';
import { CASES } from '../fixtures/cases.js';

function build(answers: typeof CASES.A.answers, libraryText = ''): Set<number> {
  const derived = computeDerived(answers);
  const results = computeProjection(answers, DEFAULT_ASSUMPTIONS, derived);
  return allowedNumbers(answers, derived, results, libraryText);
}

describe('allowedNumbers / hasInventedNumber', () => {
  it('allows an emergency runway of 1.8 months', () => {
    const answers = { ...CASES.A.answers, cash_total: 5400 };
    const derived = computeDerived(answers);
    expect(derived.monthly_spending).toBe(3000);
    const allowed = build(answers);
    expect(hasInventedNumber('about 1.8 months', allowed)).toBe(false);
  });

  it("allows the rounded position in today's terms for case D", () => {
    const allowed = build(CASES.D.answers);
    expect(hasInventedNumber("€166,400 in today's terms", allowed)).toBe(false);
  });

  it('flags an invented allocation number', () => {
    const allowed = build(CASES.A.answers);
    expect(hasInventedNumber('put 60% in equities', allowed)).toBe(true);
  });

  it('allows a number that appears in the library text', () => {
    const allowed = build(CASES.A.answers, 'Fees of 20% over a lifetime add up.');
    expect(hasInventedNumber('20%', allowed)).toBe(false);
  });
});
