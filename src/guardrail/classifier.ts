import type OpenAI from 'openai';
import type { Models } from '../llm/nebius.js';
import { chatText } from '../llm/nebius.js';
import { GUARDRAIL_PROMPT } from '../llm/prompts.js';
import { createLogger } from '../log/logger.js';

export type Verdict = 'ALLOW' | 'BLOCK';

const log = createLogger('guard:classifier');

export async function classifyOutbound(text: string, deps: { client: OpenAI; models: Models }): Promise<Verdict> {
  const reply = await chatText(
    deps.client,
    {
      model: deps.models.guardrail,
      messages: [
        { role: 'system', content: GUARDRAIL_PROMPT },
        { role: 'user', content: text },
      ],
      max_tokens: 3,
      temperature: 0,
      reasoning_effort: 'none',
    },
    'outbound classifier',
  );

  const verdict: Verdict = reply.startsWith('ALLOW') ? 'ALLOW' : 'BLOCK';
  log.debug('verdict', { verdict, rawReply: reply, textLength: text.length });
  return verdict;
}
