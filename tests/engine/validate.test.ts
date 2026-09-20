import { describe, expect, it } from 'vitest';
import { BASE } from '../fixtures/cases.js';
import { DEFAULT_ASSUMPTIONS } from '../../src/config/assumptions.js';
import { validateAnswers } from '../../src/engine/validate.js';

describe('validateAnswers', () => {
  it('accepts the base answers and assumptions', () => {
    expect(validateAnswers(BASE, DEFAULT_ASSUMPTIONS)).toEqual([]);
  });

  it('rejects a retirement age that is not after the current age', () => {
    expect(validateAnswers({ ...BASE, retire_age: 40 }, DEFAULT_ASSUMPTIONS)).toEqual([
      { field: 'retire_age', reason: 'retire_age_not_after_age' },
    ]);
  });

  it('rejects a non-positive assumption rate', () => {
    expect(validateAnswers(BASE, { ...DEFAULT_ASSUMPTIONS, cash_growth_rate: 0 })).toEqual([
      { field: 'cash_growth_rate', reason: 'rate_not_positive' },
    ]);
  });

  it('rejects a pension start age above 90', () => {
    expect(
      validateAnswers(
        { ...BASE, pensions: [{ ...BASE.pensions[0], pension_start_age: 95 }, BASE.pensions[1]] },
        DEFAULT_ASSUMPTIONS,
      ),
    ).toEqual([{ field: 'pension_start_age', reason: 'pension_start_age_out_of_range' }]);
  });
});
