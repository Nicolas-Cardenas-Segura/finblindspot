import { describe, it, expect } from 'vitest';
import {
  SYSTEM_PROMPT,
  INTENT_PROMPT,
  EXPLANATION_PROMPT,
  GUARDRAIL_PROMPT,
} from '../../src/llm/prompts.js';
import { FIELDS } from '../../src/questionnaire/fields.js';
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
