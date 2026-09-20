import { describe, it, expect } from 'vitest';
import {
  applyAnswer,
  applyCorrection,
  applyMany,
  createState,
  currentField,
  isComplete,
} from '../../src/interview/stateMachine.js';
import type { InterviewState } from '../../src/interview/stateMachine.js';
import { AnswersSchema } from '../../src/questionnaire/schema.js';
import type { FieldId, PensionRow } from '../../src/questionnaire/schema.js';
import { BASE } from '../fixtures/cases.js';

function answerUntil(s: InterviewState, fieldId: FieldId): InterviewState {
  let state = s;
  let pensionRow = 0;
  let pensionsDone = false;
  for (let guard = 0; guard < 200; guard += 1) {
    const f = currentField(state);
    if (!f) break;
    if (f.id === fieldId) return state;
    if (f.id === 'pensions') {
      pensionRow += 1;
      pensionsDone = pensionRow >= BASE.pensions.length;
      state = applyAnswer(state, pensionsDone ? 'no' : 'yes');
    } else if (f.repeat === 'pensions') {
      const row = BASE.pensions[pensionRow]!;
      state = applyAnswer(state, row[f.id as keyof PensionRow]);
    } else if (f.section === 'G') {
      state = applyAnswer(state, null);
    } else {
      state = applyAnswer(state, BASE[f.id as keyof typeof BASE]);
    }
  }
  return state;
}

describe('interview state machine', () => {
  it('starts on consent', () => {
    const s = createState('u1');
    expect(currentField(s)?.id).toBe('consent');
    expect(s.fieldIndex).toBe(0);
    expect(s.mode).toBe('assess');
    expect(s.answers).toEqual({});
    expect(s.assumptions.inflation_rate).toBe(0.03);
  });

  it('skips decision_maker and partner_knows after has_partner just_me', () => {
    let s = answerUntil(createState('u1'), 'has_partner');
    s = applyAnswer(s, 'just_me');
    s = answerUntil(s, 'base_currency');
    expect(s.answers.decision_maker).toBe('n/a');
    expect(s.answers.partner_knows).toBe('n/a');
    expect(currentField(s)?.id).toBe('base_currency');
  });

  it('skips education_funded after dependants 0', () => {
    let s = answerUntil(createState('u1'), 'dependants');
    s = applyAnswer(s, 0);
    expect(s.answers.dependants).toBe(0);
    expect(s.answers.education_funded).toBe('n/a');
    expect(currentField(s)?.id).not.toBe('education_funded');
  });

  it('completes with valid answers from BASE and collects two pension rows', () => {
    const s = answerUntil(createState('u1'), 'learning_priorities');
    expect(isComplete(s)).toBe(false);
    const done = applyAnswer(s, BASE.learning_priorities);
    expect(isComplete(done)).toBe(true);
    expect(currentField(done)).toBeNull();
    expect(done.answers.pensions?.length).toBe(2);
    expect(done.answers.pensions).toEqual(BASE.pensions);
    expect(AnswersSchema.safeParse(done.answers).success).toBe(true);
  });

  it('asks Another pension? after a row and moves to beneficiaries_named on no', () => {
    let s = answerUntil(createState('u1'), 'pension_country');
    expect(currentField(s)?.id).toBe('pension_country');
    for (const f of [
      'pension_country',
      'pension_type',
      'pension_value',
      'pension_fixed_income_monthly',
      'pension_start_age',
      'pension_contribution_monthly',
      'pension_contributions_continue',
    ] as const) {
      expect(currentField(s)?.id).toBe(f);
      s = applyAnswer(s, BASE.pensions[0]![f]);
    }
    expect(currentField(s)?.prompt).toBe('Another pension?');
    s = applyAnswer(s, 'no');
    expect(currentField(s)?.id).toBe('beneficiaries_named');
    expect(s.answers.pensions?.length).toBe(1);
  });

  it('stores null for unknown on cash_total', () => {
    let s = answerUntil(createState('u1'), 'cash_total');
    s = applyAnswer(s, null);
    expect(s.answers.cash_total).toBeNull();
    expect('cash_total' in s.answers).toBe(true);
  });

  it('applies a correction without moving position', () => {
    let s = answerUntil(createState('u1'), 'cash_total');
    s = applyCorrection(s, 'spend_housing', 1500);
    expect(s.answers.spend_housing).toBe(1500);
    expect(currentField(s)?.id).toBe('cash_total');
  });

  it('throws when correcting an unanswered field', () => {
    const s = answerUntil(createState('u1'), 'cash_total');
    expect(() => applyCorrection(s, 'retire_age', 60)).toThrow();
  });

  it('stores assumption answers in assumptions', () => {
    let s = answerUntil(createState('u1'), 'inflation_rate');
    s = applyAnswer(s, 0.04);
    expect(s.assumptions.inflation_rate).toBe(0.04);
    expect('inflation_rate' in s.answers).toBe(false);
  });

  it('applyMany fills consecutive pending fields and stops at the first gap', () => {
    const s = applyMany(answerUntil(createState('u1'), 'age'), {
      age: 41,
      has_partner: 'household',
      residence_country: 'ES',
      dependants: 2,
    });
    expect(s.answers.age).toBe(41);
    expect(s.answers.has_partner).toBe('household');
    expect(s.answers.residence_country).toBe('ES');
    expect(currentField(s)?.id).toBe('stay_abroad');
    expect('dependants' in s.answers).toBe(false);
    expect(s.pending).toEqual({ dependants: 2 });
  });

  it('applyMany drains pending values once the gap is answered', () => {
    let s = applyMany(answerUntil(createState('u1'), 'age'), { age: 41, dependants: 2 });
    expect(currentField(s)?.id).toBe('has_partner');
    s = applyAnswer(s, 'just_me');
    s = applyMany(s, { residence_country: 'ES', stay_abroad: 'yes' });
    expect(s.answers.dependants).toBe(2);
    expect(s.pending).toBeUndefined();
    expect(currentField(s)?.id).toBe('education_funded');
  });

  it('applyMany ignores values for fields that are already answered', () => {
    const s = applyMany(answerUntil(createState('u1'), 'has_partner'), { age: 99, has_partner: 'no' });
    expect(s.answers.age).toBe(BASE.age);
    expect(s.answers.has_partner).toBe('no');
  });

  it('applyMany fills a pension row and does not leak values into the next row', () => {
    let s = answerUntil(createState('u1'), 'pension_country');
    s = applyMany(s, {
      pension_country: 'GB',
      pension_type: 'defined_contribution',
      pension_value: 50000,
      pension_fixed_income_monthly: null,
      pension_start_age: 67,
      pension_contribution_monthly: 300,
      pension_contributions_continue: 'yes',
    });
    expect(currentField(s)?.id).toBe('pensions');
    expect(s.answers.pensions?.[0]?.pension_value).toBe(50000);
    s = applyMany(s, { pensions: 'yes', pension_value: 1 });
    expect(currentField(s)?.id).toBe('pension_country');
    expect(s.pending).toBeUndefined();
  });
});
