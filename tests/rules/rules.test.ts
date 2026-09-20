import { describe, it, expect } from 'vitest';
import { RULES } from '../../src/rules/rules.js';
import type { RuleId, Severity } from '../../src/rules/rules.js';

const TABLE: Array<[number, RuleId, Severity]> = [
  [1, 'thin_emergency_fund', 'high'],
  [2, 'negative_surplus', 'high'],
  [3, 'family_unprotected', 'high'],
  [4, 'no_income_safety_net', 'medium'],
  [5, 'no_health_cover', 'high'],
  [6, 'succession_gap', 'medium'],
  [7, 'education_unfunded', 'medium'],
  [8, 'pension_visibility', 'high'],
  [9, 'pension_timing_gap', 'high'],
  [10, 'scattered_pensions', 'medium'],
  [11, 'beneficiary_gap', 'medium'],
  [12, 'fees_unknown', 'medium'],
  [13, 'expensive_debt', 'high'],
  [14, 'debt_into_retirement', 'medium'],
  [15, 'cash_concentration', 'low'],
  [16, 'property_concentration', 'low'],
  [17, 'currency_exposure', 'medium'],
  [18, 'single_point_of_failure', 'medium'],
  [19, 'retirement_gap', 'high'],
  [20, 'lifestyle_reality_check', 'low'],
];

describe('RULES', () => {
  it('has twenty rules', () => {
    expect(RULES.length).toBe(20);
  });

  it('is numbered 1..20 ascending', () => {
    expect(RULES.map((r) => r.number)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('has unique ids', () => {
    expect(new Set(RULES.map((r) => r.id)).size).toBe(20);
  });

  it('matches the ids and base severities in the spec table', () => {
    expect(RULES.map((r) => [r.number, r.id, r.baseSeverity])).toEqual(TABLE);
  });

  it('maps each rule to its topic', () => {
    const topics = Object.fromEntries(RULES.map((r) => [r.number, r.topic]));
    expect(topics).toEqual({
      1: 'savings',
      2: 'savings',
      3: 'protection',
      4: 'protection',
      5: 'protection',
      6: 'succession',
      7: 'education',
      8: 'retirement',
      9: 'retirement',
      10: 'cross_border',
      11: 'succession',
      12: 'investments',
      13: 'debt',
      14: 'debt',
      15: 'investments',
      16: 'property',
      17: 'cross_border',
      18: 'succession',
      19: 'retirement',
      20: 'retirement',
    });
  });
});
