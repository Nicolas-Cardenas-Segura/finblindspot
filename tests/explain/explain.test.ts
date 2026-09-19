import { describe, it, expect } from 'vitest';
import type OpenAI from 'openai';
import { explainBlindSpot } from '../../src/explain/explain.js';
import { loadContent } from '../../src/explain/content.js';
import type { GuardDeps } from '../../src/guardrail/guard.js';
import type { Verdict } from '../../src/guardrail/classifier.js';
import type { Assessment } from '../../src/assess/assess.js';
import { runAssessment } from '../../src/assess/assess.js';
import type { FiredRule } from '../../src/rules/evaluate.js';
import { DEFAULT_ASSUMPTIONS } from '../../src/config/assumptions.js';
import { CASES } from '../fixtures/cases.js';

const DRAFT = 'You have less than three months of spending set aside in cash.';

function buildAssessment(): Assessment {
  const answers = { ...CASES.A.answers, cash_total: 5400 };
  return {
    id: 'assessment-1',
    user_id: 'user-1',
    created_at: '2026-01-01T00:00:00.000Z',
    status: 'complete',
    base_currency: answers.base_currency,
    answers,
    assumptions: DEFAULT_ASSUMPTIONS,
    ...runAssessment(answers, DEFAULT_ASSUMPTIONS, new Date('2026-01-01T00:00:00.000Z')),
  };
}

const RULE: FiredRule = {
  rule_id: 'thin_emergency_fund',
  number: 1,
  severity: 'high',
  fired_at: '2026-01-01T00:00:00.000Z',
};

function stubClient(draft: string): { client: OpenAI; prompts: string[] } {
  const prompts: string[] = [];
  const client = {
    chat: {
      completions: {
        create: async (body: { messages: Array<{ content: string }> }) => {
          prompts.push(body.messages.map((m) => m.content).join('\n'));
          return { choices: [{ message: { content: draft } }] };
        },
      },
    },
  } as unknown as OpenAI;
  return { client, prompts };
}

function stubGuard(verdict: Verdict): { guard: GuardDeps; triggers: string[] } {
  const triggers: string[] = [];
  const guard: GuardDeps = {
    classify: async () => verdict,
    inventedNumber: () => false,
    logTrigger: (t) => {
      triggers.push(t.reason);
    },
  };
  return { guard, triggers };
}

describe('explainBlindSpot', () => {
  it('returns the allowed draft', async () => {
    const { client, prompts } = stubClient(DRAFT);
    const { guard } = stubGuard('ALLOW');

    const text = await explainBlindSpot(RULE, buildAssessment(), { client, guard });

    expect(text).toBe(DRAFT);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('months_of_cover: 1.8');
  });

  it('falls back to the library why when blocked twice', async () => {
    const { client, prompts } = stubClient('Move your cash into a bond fund.');
    const { guard, triggers } = stubGuard('BLOCK');

    const text = await explainBlindSpot(RULE, buildAssessment(), { client, guard });

    expect(text).toBe(loadContent().thin_emergency_fund.why);
    expect(prompts).toHaveLength(2);
    expect(triggers).toEqual(['classifier', 'classifier']);
  });
});
