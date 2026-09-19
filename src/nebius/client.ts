import OpenAI from 'openai';
import type { Config } from '../config/env';
import { NEBIUS_BASE_URL } from '../config/models';

export function createNebiusClient(config: Config): OpenAI | null {
  return config.NEBIUS_API_KEY ? new OpenAI({ apiKey: config.NEBIUS_API_KEY, baseURL: NEBIUS_BASE_URL, timeout: 15000, maxRetries: 0 }) : null;
}
