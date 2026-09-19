import { describe, it, expect } from 'vitest';
import type OpenAI from 'openai';
import { classifyOutbound } from '../../src/guardrail/classifier.js';
import { MODELS } from '../../src/llm/nebius.js';
import { GUARDRAIL_PROMPT } from '../../src/llm/prompts.js';

interface Call {
  model: string;
  messages: { role: string; content: string }[];
  max_tokens: number;
  temperature: number;
}

function stubClient(reply: string): { client: OpenAI; calls: Call[] } {
  const calls: Call[] = [];
  const client = {
    chat: {
      completions: {
        create: async (params: Call) => {
          calls.push(params);
          return { choices: [{ message: { content: reply } }] };
        },
      },
    },
  } as unknown as OpenAI;
  return { client, calls };
}

describe('classifyOutbound', () => {
  it('returns ALLOW for "ALLOW"', async () => {
    const { client } = stubClient('ALLOW');
    expect(await classifyOutbound('an educational explanation', { client })).toBe('ALLOW');
  });

  it('returns BLOCK for "BLOCK"', async () => {
    const { client } = stubClient('BLOCK');
    expect(await classifyOutbound('transfer your pension', { client })).toBe('BLOCK');
  });

  it('returns BLOCK for lowercase "allow"', async () => {
    const { client } = stubClient('allow');
    expect(await classifyOutbound('an educational explanation', { client })).toBe('BLOCK');
  });

  it('returns BLOCK for an empty reply', async () => {
    const { client } = stubClient('');
    expect(await classifyOutbound('an educational explanation', { client })).toBe('BLOCK');
  });

  it('calls the guardrail model with the guardrail prompt', async () => {
    const { client, calls } = stubClient('ALLOW');
    await classifyOutbound('some draft', { client });
    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe(MODELS.guardrail);
    expect(calls[0].max_tokens).toBe(3);
    expect(calls[0].temperature).toBe(0);
    expect(calls[0].messages[0].content).toBe(GUARDRAIL_PROMPT);
    expect(calls[0].messages[1].content).toBe('some draft');
  });
});
