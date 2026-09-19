import type OpenAI from 'openai';
import { MODELS } from '../llm/nebius.js';
import { GUARDRAIL_PROMPT } from '../llm/prompts.js';

export type Verdict = 'ALLOW' | 'BLOCK';

export async function classifyOutbound(text: string, deps: { client: OpenAI }): Promise<Verdict> {
  const response = await deps.client.chat.completions.create({
    model: MODELS.guardrail,
    messages: [
      { role: 'system', content: GUARDRAIL_PROMPT },
      { role: 'user', content: text },
    ],
    max_tokens: 3,
    temperature: 0,
  });

  const reply = response.choices[0]?.message?.content?.trim() ?? '';
  return reply.startsWith('ALLOW') ? 'ALLOW' : 'BLOCK';
}
