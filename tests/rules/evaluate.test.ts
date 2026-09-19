import { describe, it, expect } from 'vitest';
import { DEFAULT_ASSUMPTIONS } from '../../src/config/assumptions.js';
import { computeDerived } from '../../src/engine/derived.js';
import { computeProjection } from '../../src/engine/projection.js';
import { applyTopicBump, evaluateRules, selectActionPlan } from '../../src/rules/evaluate.js';
import type { FiredRule } from '../../src/rules/evaluate.js';
import type { Answers } from '../../src/questionnaire/schema.js';
import type { RuleContext } from '../../src/rules/rules.js';
import { CASES } from '../fixtures/cases.js';

function context(answers: Answers, now = new Date('2026-01-01T00:00:00.000Z')): RuleContext {
  const derived = computeDerived(answers);
  const results = computeProjection(answers, DEFAULT_ASSUMPTIONS, derived);
  return { answers, derived, results, now };
}

const FIRED_AT = '2026-01-01T00:00:00.000Z';

const fired = (number: number, rule_id: FiredRule['rule_id'], severity: FiredRule['severity']): FiredRule => ({
  rule_id,
  number,
  severity,
  fired_at: FIRED_AT,
});

describe('evaluateRules', () => {
  it('fires the retirement rules for case D', () => {
    const ids = evaluateRules(context(CASES.D.answers)).map((f) => f.rule_id);
    expect(ids).toContain('pension_timing_gap');
    expect(ids).toContain('retirement_gap');
  });

  it('returns fired rules in number order with the context timestamp', () => {
    const result = evaluateRules(context(CASES.D.answers));
    expect(result.map((f) => f.number)).toEqual([...result.map((f) => f.number)].sort((a, b) => a - b));
    expect(result.every((f) => f.fired_at === FIRED_AT)).toBe(true);
  });

  it('is deterministic', () => {
    expect(evaluateRules(context(CASES.D.answers))).toEqual(evaluateRules(context(CASES.D.answers)));
  });
});

describe('applyTopicBump', () => {
  it('bumps low to medium and leaves high alone for a matching topic', () => {
    const input = [fired(9, 'pension_timing_gap', 'high'), fired(20, 'lifestyle_reality_check', 'low')];
    expect(applyTopicBump(input, ['retirement'])).toEqual([
      fired(9, 'pension_timing_gap', 'high'),
      fired(20, 'lifestyle_reality_check', 'medium'),
    ]);
  });

  it('bumps medium to high', () => {
    expect(applyTopicBump([fired(13, 'expensive_debt', 'medium')], ['debt'])[0]?.severity).toBe('high');
  });

  it('leaves unmatched topics unchanged', () => {
    const input = [fired(20, 'lifestyle_reality_check', 'low')];
    expect(applyTopicBump(input, ['debt'])).toEqual(input);
  });
});

describe('selectActionPlan', () => {
  it('takes the top three by severity then rule number', () => {
    const input = [
      fired(4, 'no_income_safety_net', 'medium'),
      fired(1, 'thin_emergency_fund', 'high'),
      fired(15, 'cash_concentration', 'low'),
      fired(9, 'pension_timing_gap', 'high'),
      fired(12, 'fees_unknown', 'medium'),
    ];
    expect(selectActionPlan(input).map((f) => f.number)).toEqual([1, 9, 4]);
  });

  it('returns fewer than three when fewer fired', () => {
    const input = [fired(15, 'cash_concentration', 'low')];
    expect(selectActionPlan(input)).toEqual(input);
  });
});
