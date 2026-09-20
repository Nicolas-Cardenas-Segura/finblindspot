import { describe, it, expect } from 'vitest';
import { DEFAULT_ASSUMPTIONS } from '../../src/config/assumptions.js';
import { computeDerived } from '../../src/engine/derived.js';
import { computeProjection } from '../../src/engine/projection.js';
import type { Answers } from '../../src/questionnaire/schema.js';
import { BASE, CASES } from '../fixtures/cases.js';

function run(a: Answers) {
  return computeProjection(a, DEFAULT_ASSUMPTIONS, computeDerived(a));
}

describe('computeProjection', () => {
  for (const key of ['A', 'B', 'C', 'D'] as const) {
    it(`reproduces v1 case ${key}`, () => {
      const { answers, expected } = CASES[key];
      const r = run(answers);

      expect(r.mode).toBe('projection');
      expect(Math.abs((r.required_pot as number) - expected.required_pot)).toBeLessThanOrEqual(1);
      expect(Math.abs((r.projected_assets as number) - expected.projected_assets)).toBeLessThanOrEqual(1);
      expect(Math.abs((r.position as number) - expected.position)).toBeLessThanOrEqual(1);

      if (expected.position_today !== undefined) {
        expect(Math.abs((r.position_today as number) - expected.position_today)).toBeLessThanOrEqual(1);
      }
      if (expected.extra_monthly !== undefined) {
        expect(Math.abs((r.extra_monthly as number) - expected.extra_monthly)).toBeLessThanOrEqual(1);
      } else {
        expect(r.extra_monthly).toBeNull();
      }

      expect(r.excluded_pensions.length).toBe(key === 'D' ? 1 : 0);
    });
  }

  it('reports the withdrawal-rate sensitivity for case A', () => {
    const { expected } = CASES.A;
    const r = run(CASES.A.answers);
    const at3 = r.sensitivity.find((x) => x.withdrawal_rate === 0.03);
    const at5 = r.sensitivity.find((x) => x.withdrawal_rate === 0.05);

    expect(at3).toBeDefined();
    expect(at5).toBeDefined();
    expect(Math.abs((at3 as { position: number }).position - (expected.at3 as number))).toBeLessThanOrEqual(1);
    expect(Math.abs((at5 as { position: number }).position - (expected.at5 as number))).toBeLessThanOrEqual(1);
    expect(r.sensitivity.map((x) => x.withdrawal_rate)).toEqual([0.03, DEFAULT_ASSUMPTIONS.withdrawal_rate, 0.05]);
  });

  it('skips the projection when the retirement target is unknown', () => {
    const r = run({ ...BASE, retire_income_monthly: null });
    expect(r.mode).toBe('no_target');
    expect(r.required_pot).toBeNull();
    expect(r.projected_assets).toBeNull();
    expect(r.position).toBeNull();
  });

  it('marks a minimum estimate when a used field is unknown', () => {
    const r = run({ ...BASE, cash_total: null });
    expect(r.is_minimum_estimate).toBe(true);
    expect(r.missing_fields).toContain('cash_total');
  });

  it('returns already_retired when the retirement age has passed', () => {
    const r = run({ ...BASE, retire_age: 40 });
    expect(r.mode).toBe('already_retired');
    expect(r.position).toBeNull();
  });

  it('returns no_gap when guaranteed income covers the target', () => {
    const answers: Answers = {
      ...BASE,
      retire_income_monthly: 2000,
      pensions: [{ ...BASE.pensions[0], pension_fixed_income_monthly: 3000 }],
    };
    const r = run(answers);
    expect(r.mode).toBe('no_gap');
    expect(r.required_pot).toBe(0);
  });
});
