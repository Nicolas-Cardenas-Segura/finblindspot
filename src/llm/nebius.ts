import OpenAI from 'openai';
import type { Env } from '../config/env.js';
import { createLogger, errorData } from '../log/logger.js';

export interface Models {
  interview: string;
  guardrail: string;
}

export function modelsFromEnv(
  env: Pick<Env, 'NEBIUS_INTERVIEW_MODEL' | 'NEBIUS_GUARDRAIL_MODEL'>,
): Models {
  return {
    interview: env.NEBIUS_INTERVIEW_MODEL,
    guardrail: env.NEBIUS_GUARDRAIL_MODEL,
  };
}

const log = createLogger('llm');

export function createNebiusClient(env: Pick<Env, 'NEBIUS_API_KEY' | 'NEBIUS_BASE_URL'>): OpenAI {
  log.debug('nebius client created', { baseURL: env.NEBIUS_BASE_URL });
  return new OpenAI({ apiKey: env.NEBIUS_API_KEY, baseURL: env.NEBIUS_BASE_URL });
}

type ChatParams = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;

/** One non-streaming chat completion; logs request, latency, usage and the returned text. */
export async function chatText(
  client: OpenAI,
  params: ChatParams,
  purpose: string,
): Promise<string> {
  const started = Date.now();
  log.debug(`${purpose}: request`, {
    model: params.model,
    temperature: params.temperature,
    response_format: params.response_format,
    messages: params.messages,
  });
  try {
    const response = await client.chat.completions.create(params);
    const content = response.choices[0]?.message?.content?.trim() ?? '';
    log.debug(`${purpose}: response`, {
      ms: Date.now() - started,
      finish_reason: response.choices[0]?.finish_reason,
      usage: response.usage,
      content,
    });
    return content;
  } catch (error) {
    log.error(`${purpose}: request failed`, { ms: Date.now() - started, model: params.model, ...errorData(error) });
    throw error;
  }
}
