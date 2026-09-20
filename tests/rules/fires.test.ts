import { describe, it, expect } from 'vitest';
import { DEFAULT_ASSUMPTIONS } from '../../src/config/assumptions.js';
import { computeDerived } from '../../src/engine/derived.js';
import { computeProjection } from '../../src/engine/projection.js';
import { RULES } from '../../src/rules/rules.js';
import type { RuleContext } from '../../src/rules/rules.js';
import type { Answers } from '../../src/questionnaire/schema.js';
import { BASE, CASES } from '../fixtures/cases.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');

function context(answers: Answers): RuleContext {
  const derived = computeDerived(answers);
  const results = computeProjection(answers, DEFAULT_ASSUMPTIONS, derived);
  return { answers, derived, results, now: NOW };
}

function fires(number: number, answers: Answers): boolean {
  const rule = RULES.find((r) => r.number === number);
  if (rule === undefined) throw new Error(`no rule ${number}`);
  return rule.fires(context(answers));
}

const with_ = (patch: Partial<Answers>): Answers => ({ ...BASE, ...patch });

const CASE_A = CASES.A.answers;
const CASE_C = CASES.C.answers;
const CASE_D = CASES.D.answers;

const POSITIVE: Array<[number, Answers]> = [
  [1, with_({ cash_total: 8000 })],
  [2, with_({ income_monthly: 2000 })],
  [3, with_({ dependants: 2, life_cover: 'no' })],
  [4, with_({ illness_cover: 'no' })],
  [5, with_({ health_cover: 'dont_know' })],
  [6, with_({ will: 'no', will_country: 'n/a', will_year: 'n/a' })],
  [7, with_({ dependants: 2, education_funded: 'dont_know' })],
  [8, with_({ pensions: [{ ...BASE.pensions[1]!, pension_value: null }] })],
  [9, CASE_D],
  [10, with_({ pensions: [BASE.pensions[0]!, { ...BASE.pensions[1]!, pension_country: 'GB' }] })],
  [11, with_({ beneficiaries_named: 'no' })],
  [12, with_({ fees_known: 'not_sure' })],
  [13, with_({ debt_total: 5000, debt_max_rate: null })],
  [14, with_({ debt_at_retirement: null })],
  [15, with_({ cash_total: 200000 })],
  [16, with_({ property_value: 500000, property_mortgage: 0 })],
  [17, with_({ retire_country: 'GB' })],
  [18, with_({ has_partner: 'household', decision_maker: 'me', partner_knows: 'no' })],
  [19, CASE_C],
  [20, with_({ retire_income_monthly: 1500 })],
];

const NEGATIVE: Array<[number, Answers]> = [
  [1, with_({ cash_total: 30000 })],
  [2, with_({ income_monthly: 4000 })],
  [3, with_({ dependants: 2, life_cover: 'yes' })],
  [4, with_({ illness_cover: 'yes' })],
  [5, with_({ health_cover: 'yes' })],
  [6, with_({ will: 'yes', will_country: 'DE', will_year: 2024 })],
  [7, with_({ dependants: 2, education_funded: 'yes' })],
  [8, BASE],
  [9, CASE_A],
  [10, BASE],
  [11, with_({ beneficiaries_named: 'yes' })],
  [12, with_({ fees_known: 'yes' })],
  [13, with_({ debt_total: 5000, debt_max_rate: 5 })],
  [14, with_({ debt_at_retirement: 0 })],
  [15, BASE],
  [16, BASE],
  [17, with_({ retire_country: 'DE' })],
  [18, BASE],
  [19, CASE_A],
  [20, with_({ retire_income_monthly: 2000 })],
];

describe('rule firing', () => {
  it.each(POSITIVE)('rule %i fires', (number, answers) => {
    expect(fires(number, answers)).toBe(true);
  });

  it.each(NEGATIVE)('rule %i does not fire', (number, answers) => {
    expect(fires(number, answers)).toBe(false);
  });
});
