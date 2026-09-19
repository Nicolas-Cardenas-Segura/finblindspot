import OpenAI from 'openai';
import type { Env } from '../config/env.js';

export const MODELS = {
  interview: 'deepseek-ai/DeepSeek-V4.1-Flash',
  guardrail: 'nvidia/Nemotron-3_5-Lightning',
} as const;

export function createNebiusClient(env: Pick<Env, 'NEBIUS_API_KEY' | 'NEBIUS_BASE_URL'>): OpenAI {
  return new OpenAI({ apiKey: env.NEBIUS_API_KEY, baseURL: env.NEBIUS_BASE_URL });
}
