import { describe, it, expect } from 'vitest';
import { runAssessment } from '../../src/assess/assess.js';
import type { Assessment } from '../../src/assess/assess.js';
import { DEFAULT_ASSUMPTIONS } from '../../src/config/assumptions.js';
import { createRevisitState } from '../../src/interview/revisit.js';
import {
  applyAnswer,
  currentField,
  isComplete,
} from '../../src/interview/stateMachine.js';
import type { InterviewState } from '../../src/interview/stateMachine.js';
import type { Answers, FieldId } from '../../src/questionnaire/schema.js';
import { BASE } from '../fixtures/cases.js';

function assessment(answers: Answers): Assessment {
  const computed = runAssessment(answers, DEFAULT_ASSUMPTIONS);
  return {
    id: 'a1',
    user_id: 'u1',
    created_at: '2026-01-01T00:00:00.000Z',
    status: 'complete',
    base_currency: answers.base_currency,
    answers,
    assumptions: { ...DEFAULT_ASSUMPTIONS },
    ...computed,
  };
}

function answerSameUntil(s: InterviewState, fieldId: FieldId): InterviewState {
  let state = s;
  for (let guard = 0; guard < 200; guard += 1) {
    const f = currentField(state);
    if (!f || f.id === fieldId) return state;
    state = applyAnswer(state, 'same');
  }
  return state;
}

function answerSameToEnd(s: InterviewState): InterviewState {
  let state = s;
  for (let guard = 0; guard < 200 && !isComplete(state); guard += 1) {
    state = applyAnswer(state, 'same');
  }
  return state;
}

describe('revisit interview', () => {
  it('starts with the fields that were unknown last time', () => {
    const previous = assessment({ ...BASE, cash_total: null });
    const s = createRevisitState('u1', previous);
    expect(s.mode).toBe('revisit');
    expect(s.prefill).toEqual(previous.answers);
    expect(s.assumptions).toEqual(previous.assumptions);
    expect(currentField(s)?.id).toBe('cash_total');
  });

  it('stores the previous value when the reply is same', () => {
    const previous = assessment({ ...BASE, cash_total: null });
    let s = createRevisitState('u1', previous);
    s = answerSameUntil(s, 'age');
    expect(currentField(s)?.id).toBe('age');
    s = applyAnswer(s, 'same');
    expect(s.answers.age).toBe(previous.answers.age);
  });

  it('reproduces the previous answers when everything is same', () => {
    const previous = assessment(BASE);
    const s = answerSameToEnd(createRevisitState('u1', previous));
    expect(isComplete(s)).toBe(true);
    expect(s.answers).toEqual(previous.answers);
  });
});
