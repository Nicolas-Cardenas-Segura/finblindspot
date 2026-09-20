import { describe, expect, it } from 'vitest';
import { assess, defaults, futureValue, ratio } from '../src/engine.js';
import { known, profileSchema, unknown } from '../src/profile.js';
import { profile } from './fixtures.js';

describe('deterministic calculations', () => {
  it('does not divide by zero or substitute unknown for zero', () => {
    expect(ratio(100, 0)).toBeNull();
    expect(ratio(null, 10)).toBeNull();
    expect(ratio(0, 10)).toBe(0);
    const result = assess({ ...profile, pension: unknown });
    expect(result.retirement.projectedPot).toBeNull();
    expect(result.retirement.gap).toBeNull();
    expect(result.unknownFields).toEqual(['pension']);
    expect(assess({ ...profile, untrackedPensions: known(1) }).retirement.projectedPot).toBeNull();
  });

  it.each([[7499, 'red'], [7500, 'amber'], [14999, 'amber'], [15000, 'green']] as const)(
    'scores cash %s at exact emergency boundaries', (cash, status) => {
      expect(assess({ ...profile, cash: known(cash) }).indicators.find((i) => i.id === 'runway')?.status).toBe(status);
    },
  );

  it.each([[799, 'green'], [800, 'amber'], [1600, 'amber'], [1601, 'red']] as const)(
    'scores debt payment %s at exact boundaries', (payment, status) => {
      expect(assess({ ...profile, debtPayment: known(payment) }).indicators.find((i) => i.id === 'debt')?.status).toBe(status);
    },
  );

  it('projects monthly contributions with a zero-rate branch and end-of-month timing', () => {
    expect(futureValue(10000, 100, 10, 0)).toBe(22000);
    expect(futureValue(10000, 0, 10, 0.03)).toBeCloseTo(10000 * 1.03 ** 10);
    expect(futureValue(10000, 100, 0, 0.03)).toBe(10000);
    expect(futureValue(0, 100, 1 / 12, 0.03)).toBeCloseTo(100);
    expect(futureValue(10000, 0, 1, -0.03)).toBeCloseTo(9700);
    const score = assess(profile, { ...defaults, annualRealReturn: 0 });
    expect(score.retirement.projectedPot).toBe(250000);
    expect(score.retirement.requiredPot).toBe(660000);
    expect(score.retirement.gap).toBe(-410000);
    expect(assess({ ...profile, retirementAge: known(30) }).retirement.projectedPot).toBeNull();
  });

  it('validates finite nonnegative money and ordered thresholds', () => {
    expect(profileSchema.safeParse({ ...profile, cash: known(-1) }).success).toBe(false);
    expect(profileSchema.safeParse({ ...profile, cash: known(Infinity) }).success).toBe(false);
    expect(() => assess(profile, { ...defaults, runwayRedBelow: 7 })).toThrow();
  });

  it('ranks only actual flags, stably by severity; no fabricated three findings', () => {
    const result = assess({ ...profile, cash: known(0), feesKnown: known(false), localWill: unknown });
    expect(result.topBlindSpots).toHaveLength(3);
    expect(result.topBlindSpots.every((i) => i.status === 'red')).toBe(true);
    expect(result.topBlindSpots[0]?.id).toBe('runway');
    expect(assess(profile)).toEqual(assess(profile));
  });

  it('counts residence in cross-border complexity and tracks pension tax uncertainty', () => {
    const score = assess({ ...profile, residence: known('FR'), pensionTaxKnown: unknown });
    expect(score.indicators.find((i) => i.id === 'borders')).toMatchObject({ value: 3, status: 'red' });
    expect(score.indicators.find((i) => i.id === 'pensions')?.status).toBe('amber');
    expect(assess({ ...profile, untrackedPensions: unknown }).indicators.find((i) => i.id === 'pensions')?.status).toBe('red');
  });

  it.each([[49, 'green'], [50, 'amber'], [80, 'amber'], [81, 'red']] as const)(
    'scores concentration at %s percent', (largest, status) => {
      const remainder = (100 - largest) / 3;
      const score = assess({ ...profile, cash: known(largest), investments: known(remainder),
        pension: known(remainder), property: known(remainder) });
      expect(score.indicators.find((i) => i.id === 'concentration')?.status).toBe(status);
    },
  );

  it('cannot estimate concentration with untracked pensions or no assets', () => {
    expect(assess({ ...profile, untrackedPensions: known(2) }).indicators.find((i) => i.id === 'concentration')?.value).toBeNull();
    const noAssets = { ...profile, cash: known(0), investments: known(0), pension: known(0), property: known(0) };
    expect(assess(noAssets).indicators.find((i) => i.id === 'concentration')?.value).toBeNull();
  });
});
