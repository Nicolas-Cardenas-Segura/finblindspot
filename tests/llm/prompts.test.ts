import { describe, it, expect } from 'vitest';
import {
  SYSTEM_PROMPT,
  TURN_PROMPT,
  INTENT_PROMPT,
  EXPLANATION_PROMPT,
  GUARDRAIL_PROMPT,
} from '../../src/llm/prompts.js';
import { FIELDS, SECTIONS } from '../../src/questionnaire/fields.js';
import type { BlindSpotContent } from '../../src/explain/content.js';

const incomeField = FIELDS.find((f) => f.id === 'income_monthly')!;

const content: BlindSpotContent = {
  title: 'Thin emergency fund',
  headline: 'Your cash would not cover many months.',
  why: 'A thin cash buffer means a surprise cost has to come from somewhere else.',
  learn: ['How much cash is usually held back', 'Where a buffer is normally kept'],
  ask: 'How many months of spending should I hold in cash?',
  severity: 'high',
  topic: 'savings',
};

describe('SYSTEM_PROMPT', () => {
  it('states the education-only boundary and the may / may not lists verbatim', () => {
    expect(SYSTEM_PROMPT).toContain('not financial advice');
    expect(SYSTEM_PROMPT).toContain(
      'May: ask follow-up questions, clarify an answer, point out missing information, explain a calculation or a concept, explain why something is a blind spot, suggest questions to ask a professional.',
    );
    expect(SYSTEM_PROMPT).toContain(
      'May not: recommend an investment, product or pension transfer, invent a missing value, present an assumption as a guarantee, or state that a projection will happen.',
    );
    expect(SYSTEM_PROMPT).toContain('transfer');
  });
});

describe('INTENT_PROMPT', () => {
  const prompt = INTENT_PROMPT(incomeField, ['spend_housing', 'age'], 'EUR');

  it('lists every intent and the JSON shape', () => {
    for (const intent of [
      'answer',
      'dont_know',
      'question',
      'correction',
      'skip_request',
      'off_topic',
    ]) {
      expect(prompt).toContain(intent);
    }
    expect(prompt).toContain('"value"');
    expect(prompt).toContain('"field_id"');
  });

  it('describes the current field and the answered fields', () => {
    expect(prompt).toContain('income_monthly');
    expect(prompt).toContain(incomeField.prompt);
    expect(prompt).toContain(`type: ${incomeField.type}`);
    expect(prompt).toContain('zeroValid');
    expect(prompt).toContain('EUR');
    expect(prompt).toContain('spend_housing');
    expect(prompt).toContain('age');
  });

  it('includes the three worked examples', () => {
    expect(prompt).toContain('about 4.2k after tax');
    expect(prompt).toContain('"value": 4200');
    expect(prompt).toContain('why do you need this?');
    expect(prompt).toContain('"intent": "question"');
    expect(prompt).toContain('actually my rent is 1500');
    expect(prompt).toContain('"field_id": "spend_housing"');
    expect(prompt).toContain('"value": 1500');
  });

  it('lists the options of an enum field', () => {
    const currencyField = FIELDS.find((f) => f.id === 'base_currency')!;
    const enumPrompt = INTENT_PROMPT(currencyField, []);
    expect(enumPrompt).toContain(currencyField.options!.join(', '));
  });

  it('lists other open fields and the multi-value shape', () => {
    const housing = FIELDS.find((f) => f.id === 'spend_housing')!;
    const open = INTENT_PROMPT(incomeField, [], 'EUR', [housing]);
    expect(open).toContain(`- spend_housing: ${housing.prompt}`);
    expect(open).toContain('"values"');
    expect(open).toContain('"spend_housing": 1800');
    expect(open).toContain('never guess');
  });
});

describe('EXPLANATION_PROMPT', () => {
  const prompt = EXPLANATION_PROMPT(content, { emergency_months: 1.8, net_worth: null });

  it('asks for a rephrased why within the advice boundary', () => {
    expect(prompt).toContain('not financial advice');
    expect(prompt).toContain(content.why);
    expect(prompt).toContain('2 to 3 sentences');
    expect(prompt).toContain('second person');
    expect(prompt).toContain('transfer');
    expect(prompt).toContain('emergency_months: 1.8');
    expect(prompt).toContain('net_worth: unknown');
  });
});

describe('GUARDRAIL_PROMPT', () => {
  it('asks for exactly ALLOW or BLOCK and lists the blocking cases', () => {
    expect(GUARDRAIL_PROMPT).toContain('not financial advice');
    expect(GUARDRAIL_PROMPT).toContain('ALLOW');
    expect(GUARDRAIL_PROMPT).toContain('BLOCK');
    expect(GUARDRAIL_PROMPT).toContain('provider');
    expect(GUARDRAIL_PROMPT).toContain('transfer');
    expect(GUARDRAIL_PROMPT).toContain('allocation percentage');
    expect(GUARDRAIL_PROMPT).toContain('promises');
  });
});

describe('TURN_PROMPT', () => {
  const prompt = TURN_PROMPT({
    field: incomeField,
    currency: 'EUR',
    event: { kind: 'answer_stored', fieldId: 'age', shown: '41' },
    history: [
      { role: 'assistant', text: 'How old are you?' },
      { role: 'user', text: '41' },
    ],
    firstName: 'Luca',
    redacted: true,
    today: 'January 15, 2026',
  });

  it('carries the question, the event, the history and the guard rails', () => {
    expect(prompt).toContain(incomeField.prompt);
    expect(prompt).toContain('was saved as: 41');
    expect(prompt).toContain('[Luca]: 41');
    expect(prompt).toContain('[Sam]: How old are you?');
    expect(prompt).toContain('Amounts are in EUR');
    expect(prompt).toContain('approximate figures');
    expect(prompt).toContain('no advice, no products');
  });

  it('asks an open question at the start of a section and carries grounding context', () => {
    const open = TURN_PROMPT({
      field: incomeField,
      currency: 'EUR',
      event: { kind: 'answer_stored', fieldId: 'base_currency', shown: 'EUR' },
      history: [],
      redacted: false,
      today: 'January 15, 2026',
      sectionStart: SECTIONS.B,
      knowledge: ['Emergency money is what stops a bad month turning into a bad decade.'],
      previousReport: '- Date: 2025-07-01, currency EUR',
    });
    expect(open).toContain(SECTIONS.B.title);
    expect(open).toContain(SECTIONS.B.opener);
    expect(open).not.toContain('keep its exact meaning');
    expect(open).toContain('Emergency money is what stops');
    expect(open).toContain('Their previous report');
    expect(open).toContain('- Date: 2025-07-01, currency EUR');
  });

  it('mentions the other open questions of the section on a follow-up', () => {
    const housing = FIELDS.find((f) => f.id === 'spend_housing')!;
    const follow = TURN_PROMPT({
      field: incomeField,
      event: { kind: 'partial_stored', fieldIds: ['spend_living'] },
      history: [],
      redacted: false,
      today: 'January 15, 2026',
      openInSection: [housing],
    });
    expect(follow).toContain('keep its exact meaning');
    expect(follow).toContain(`Still open in this part`);
    expect(follow).toContain(housing.prompt);
    expect(follow).toContain('but not the current question');
  });

  it('marks required fields as not skippable', () => {
    const required = TURN_PROMPT({
      field: { ...incomeField, allowUnknown: false },
      event: { kind: 'skip_refused' },
      history: [],
      redacted: false,
      today: 'January 15, 2026',
    });
    expect(required).toContain('do not offer to skip');
    expect(required).not.toContain('"don\'t know" is a valid answer');
  });
});
