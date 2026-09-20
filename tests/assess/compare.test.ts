import { describe, it, expect } from 'vitest';
import { DEFAULT_ASSUMPTIONS } from '../../src/config/assumptions.js';
import { runAssessment } from '../../src/assess/assess.js';
import type { Assessment } from '../../src/assess/assess.js';
import { compare } from '../../src/assess/compare.js';
import type { Answers, Assumptions } from '../../src/questionnaire/schema.js';
import { BASE } from '../fixtures/cases.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');

function assessment(
  id: string,
  answers: Answers,
  assumptions: Assumptions = DEFAULT_ASSUMPTIONS,
): Assessment {
  return {
    id,
    user_id: 'u1',
    created_at: NOW.toISOString(),
    status: 'complete',
    base_currency: answers.base_currency,
    answers,
    assumptions,
    ...runAssessment(answers, assumptions, NOW),
  };
}

const PREVIOUS_ANSWERS: Answers = {
  ...BASE,
  cash_total: 4000,
  pensions: [BASE.pensions[0], { ...BASE.pensions[1], pension_value: null }],
};

describe('compare', () => {
  it('reports closed blind spots, resolved unknowns and the emergency fund change', () => {
    const delta = compare(assessment('p', PREVIOUS_ANSWERS), assessment('c', BASE));

    expect(delta.blind_spots_closed).toContain('thin_emergency_fund');
    expect(delta.blind_spots_closed).toContain('pension_visibility');
    expect(delta.unknowns_resolved).toContain('pension_value');
    expect(delta.emergency_months_change).toBeCloseTo(8.667, 2);
    expect(delta.assumptions_changed).toBe(false);
    expect(delta.blind_spots_new).toEqual([]);
    expect(delta.blind_spots_still_open).toContain('fees_unknown');
  });

  it('reports position, net worth and monthly saving changes', () => {
    const current: Answers = { ...BASE, saving_monthly_other: 250 };
    const delta = compare(assessment('p', PREVIOUS_ANSWERS), assessment('c', current));

    expect(delta.monthly_saving_change).toBe(250);
    expect(delta.net_worth_change).toBe(146000);
    expect(delta.position_change).not.toBeNull();
    expect(delta.position_change ?? 0).toBeGreaterThan(0);
  });

  it('recomputes both sides under the current assumptions', () => {
    const previous = assessment('p', BASE, { ...DEFAULT_ASSUMPTIONS, investment_growth_rate: 0.05 });
    const current = assessment('c', BASE, { ...DEFAULT_ASSUMPTIONS, investment_growth_rate: 0.06 });

    const delta = compare(previous, current);
    const recomputed = runAssessment(previous.answers, current.assumptions, NOW);

    expect(delta.assumptions_changed).toBe(true);
    expect(recomputed.results.position).not.toBe(previous.results.position);
    expect(delta.position_change).toBe(0);
  });
});
