import type OpenAI from 'openai';
import { MODELS } from '../llm/nebius.js';
import { INTENT_PROMPT } from '../llm/prompts.js';
import type { FieldDef } from './fields.js';
import type { Answers, Currency, FieldId } from './schema.js';
import { parseFieldValue } from './schema.js';

export type IntentKind =
  | 'answer'
  | 'dont_know'
  | 'question'
  | 'correction'
  | 'skip_request'
  | 'off_topic'
  | 'command';

export type Intent =
  | { kind: 'answer'; value: unknown }
  | { kind: 'correction'; fieldId: FieldId; value: unknown }
  | { kind: 'question'; text: string }
  | { kind: 'command'; command: string }
  | { kind: 'dont_know' }
  | { kind: 'skip_request' }
  | { kind: 'off_topic' };

export interface IntentContext {
  answered: Partial<Answers>;
  currency?: Currency;
}

const DONT_KNOW_SYNONYMS = ["don't know", 'dont know', 'not sure', 'no idea', 'unknown', '?'];

const NUMBER_TYPES = ['money', 'integer', 'percent', 'year'];

export function classifyIntentDeterministic(field: FieldDef, reply: string): Intent | null {
  const trimmed = reply.trim();

  if (trimmed.startsWith('/')) {
    return { kind: 'command', command: trimmed };
  }

  const option = field.options?.find((o) => o.toLowerCase() === trimmed.toLowerCase());
  if (option !== undefined) {
    return { kind: 'answer', value: option };
  }

  if (DONT_KNOW_SYNONYMS.includes(trimmed.toLowerCase())) {
    return { kind: 'dont_know' };
  }

  if (NUMBER_TYPES.includes(field.type) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return { kind: 'answer', value: Number(trimmed) };
  }

  return null;
}

export async function classifyIntent(
  field: FieldDef,
  reply: string,
  ctx: IntentContext,
  deps: { client: OpenAI },
): Promise<Intent> {
  const deterministic = classifyIntentDeterministic(field, reply);
  if (deterministic !== null) {
    return deterministic;
  }

  const answered = Object.keys(ctx.answered) as FieldId[];

  let parsed: unknown;
  try {
    const response = await deps.client.chat.completions.create({
      model: MODELS.interview,
      messages: [
        { role: 'system', content: INTENT_PROMPT(field, answered, ctx.currency) },
        { role: 'user', content: reply },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    });
    const content = response.choices[0]?.message?.content;
    parsed = JSON.parse(content ?? '');
  } catch {
    return { kind: 'off_topic' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { kind: 'off_topic' };
  }

  const body = parsed as { intent?: unknown; value?: unknown; field_id?: unknown };

  switch (body.intent) {
    case 'answer': {
      const result = parseFieldValue(field.id, body.value);
      return result.success ? { kind: 'answer', value: result.value } : { kind: 'off_topic' };
    }
    case 'correction': {
      const fieldId = body.field_id;
      if (typeof fieldId !== 'string' || !answered.includes(fieldId as FieldId)) {
        return { kind: 'off_topic' };
      }
      const result = parseFieldValue(fieldId as FieldId, body.value);
      return result.success
        ? { kind: 'correction', fieldId: fieldId as FieldId, value: result.value }
        : { kind: 'off_topic' };
    }
    case 'question':
      return { kind: 'question', text: reply };
    case 'dont_know':
      return { kind: 'dont_know' };
    case 'skip_request':
      return { kind: 'skip_request' };
    default:
      return { kind: 'off_topic' };
  }
}
