import { Agent } from '@mastra/core/agent';
import type OpenAI from 'openai';
import { MODELS } from '../llm/nebius.js';
import { SYSTEM_PROMPT } from '../llm/prompts.js';

export function createAgent(client: OpenAI): Agent {
  return new Agent({
    id: 'finblindspot',
    name: 'finblindspot',
    instructions: SYSTEM_PROMPT,
    model: {
      id: MODELS.interview,
      url: client.baseURL,
      apiKey: client.apiKey ?? undefined,
    },
  });
}
