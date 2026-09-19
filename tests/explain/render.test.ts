import { describe, it, expect } from 'vitest';
import { DEFAULT_ASSUMPTIONS } from '../../src/config/assumptions.js';
import { runAssessment } from '../../src/assess/assess.js';
import type { Assessment } from '../../src/assess/assess.js';
import type { Delta } from '../../src/assess/compare.js';
import type { Answers } from '../../src/questionnaire/schema.js';
import type { FieldDef } from '../../src/questionnaire/fields.js';
import type { RuleId } from '../../src/rules/rules.js';
import {
  renderActionPlan,
  renderConsent,
  renderProgress,
  renderQuestion,
  renderResults,
  roundHundred,
} from '../../src/explain/render.js';
import { BASE, CASES } from '../fixtures/cases.js';

const NOW = new Date('2026-03-01T00:00:00.000Z');

function assessment(answers: Answers, id = 'a1'): Assessment {
  const { derived, results, blind_spots } = runAssessment(answers, DEFAULT_ASSUMPTIONS, NOW);
  return {
    id,
    user_id: 'u1',
    created_at: NOW.toISOString(),
    status: 'complete',
    base_currency: answers.base_currency,
    answers,
    assumptions: DEFAULT_ASSUMPTIONS,
    derived,
    results,
    blind_spots,
  };
}

const MONEY_FIELD: FieldDef = {
  id: 'cash_total',
  section: 'C',
  prompt: 'How much do you hold in cash?',
  helper: 'Current accounts and savings.',
  rationale: 'Feeds your emergency runway.',
  type: 'money',
  allowUnknown: true,
};

describe('roundHundred', () => {
  it('rounds to the nearest hundred', () => {
    expect(roundHundred(348379)).toBe(348400);
  });
});

describe('renderConsent', () => {
  it('includes the v1 consent copy and the reply instruction', () => {
    const text = renderConsent();
    expect(text).toContain('not financial advice');
    expect(text).toContain('Please do not enter bank logins');
    expect(text).toContain('Reply YES to continue');
  });
});

describe('renderQuestion', () => {
  it('renders prompt, helper and the unknown hint', () => {
    const text = renderQuestion(MONEY_FIELD, 'EUR');
    expect(text).toContain('How much do you hold in cash?');
    expect(text).toContain('Current accounts and savings.');
    expect(text).toContain("(reply 'don't know' if unsure)");
  });

  it('renders the revisit prefill line', () => {
    const text = renderQuestion(MONEY_FIELD, 'EUR', 30000);
    expect(text).toContain("Still right? Last time: €30,000 — reply 'same' or a new value");
  });
});

describe('renderResults', () => {
  it('renders the v1 §8 layout for case D', () => {
    const text = renderResults(assessment(CASES.D.answers));
    expect(text).toContain('At 65');
    expect(text).toContain('166,400');
    expect(text).toContain('585');
    expect(text).toContain('not included in this projection to age 65');
    expect(text).toContain('Assumptions: inflation 3%');
  });

  it('omits the projection block when there is no target', () => {
    const text = renderResults(assessment({ ...BASE, retire_income_monthly: null }));
    expect(text).not.toContain('Estimated capital');
    expect(text).toContain('Minimum estimate based on what you know today.');
  });
});

describe('renderActionPlan', () => {
  it('lists exactly three titles for an assessment with five fired rules', () => {
    const a = assessment({ ...CASES.D.answers, health_cover: 'no', cash_total: 3000 });
    expect(a.blind_spots.length).toBe(5);
    const text = renderActionPlan(a, {} as Record<RuleId, string>);
    const titles = [
      'Your safety net is thin',
      'No health cover recorded',
      'Your pension starts after you plan to stop',
      'You do not know what you are paying in fees',
      'There is a gap between the plan and the target',
    ];
    expect(titles.filter((t) => text.includes(t)).length).toBe(3);
    expect(text).not.toContain('no other blind spot detected');
  });

  it('closes with the reassurance line when fewer than three fired', () => {
    const a = assessment(CASES.D.answers);
    const text = renderActionPlan({ ...a, blind_spots: a.blind_spots.slice(0, 2) }, {} as Record<RuleId, string>);
    expect(text).toContain('no other blind spot detected');
  });
});

describe('renderProgress', () => {
  it('renders the table, the lists and the assumptions sentence', () => {
    const previous = assessment(CASES.D.answers, 'a1');
    const current = assessment(CASES.A.answers, 'a2');
    const delta: Delta = {
      position_change: 180000,
      net_worth_change: 23500,
      monthly_saving_change: 250,
      emergency_months_change: null,
      blind_spots_closed: ['pension_timing_gap'],
      blind_spots_new: [],
      blind_spots_still_open: ['thin_emergency_fund'],
      unknowns_resolved: ['cash_total'],
      assumptions_changed: true,
    };
    const text = renderProgress(previous, current, delta);
    expect(text).toContain('Then');
    expect(text).toContain('Now');
    expect(text).toContain('Retirement position');
    expect(text).toContain('Closed since last time');
    expect(text).toContain('Still open');
    expect(text).toContain('You found out since last time: cash_total.');
    expect(text).toContain('this comparison uses your current assumptions for both dates.');
  });
});
