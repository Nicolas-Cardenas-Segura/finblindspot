import { Agent } from '@mastra/core/agent';
import type OpenAI from 'openai';
import type { Memory } from '@mastra/memory';
import type { Models } from '../llm/nebius.js';
import { SYSTEM_PROMPT } from '../llm/prompts.js';

export function createAgent(client: OpenAI, models: Models, memory: Memory): Agent {
  return new Agent({
    id: 'finblindspot',
    name: 'finblindspot',
    instructions: SYSTEM_PROMPT,
    model: {
      id: models.interview as `${string}/${string}`,
      url: client.baseURL,
      apiKey: client.apiKey ?? undefined,
    },
    memory,
  });
}
