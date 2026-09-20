import type OpenAI from 'openai';
import { MODELS, chatText } from '../llm/nebius.js';
import { INTENT_PROMPT } from '../llm/prompts.js';
import { createLogger, errorData } from '../log/logger.js';
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

const log = createLogger('intent');

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
    log.debug('deterministic shortcut', { field: field.id, reply, intent: deterministic });
    return deterministic;
  }

  const answered = Object.keys(ctx.answered) as FieldId[];
  const intent = await classifyWithModel(field, reply, answered, ctx.currency, deps.client);
  log.debug('model classification', { field: field.id, reply, intent });
  return intent;
}

async function classifyWithModel(
  field: FieldDef,
  reply: string,
  answered: FieldId[],
  currency: Currency | undefined,
  client: OpenAI,
): Promise<Intent> {
  let content = '';
  let parsed: unknown;
  try {
    content = await chatText(
      client,
      {
        model: MODELS.interview,
        messages: [
          { role: 'system', content: INTENT_PROMPT(field, answered, currency) },
          { role: 'user', content: reply },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      },
      'intent',
    );
    parsed = JSON.parse(content);
  } catch (error) {
    log.warn('model call or JSON parse failed → off_topic', { field: field.id, content, ...errorData(error) });
    return { kind: 'off_topic' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    log.warn('model returned non-object JSON → off_topic', { field: field.id, parsed });
    return { kind: 'off_topic' };
  }

  const body = parsed as { intent?: unknown; value?: unknown; field_id?: unknown };

  switch (body.intent) {
    case 'answer': {
      const result = parseFieldValue(field.id, body.value);
      if (!result.success) {
        log.debug('answer value rejected by schema → off_topic', { field: field.id, value: body.value, result });
        return { kind: 'off_topic' };
      }
      return { kind: 'answer', value: result.value };
    }
    case 'correction': {
      const fieldId = body.field_id;
      if (typeof fieldId !== 'string' || !answered.includes(fieldId as FieldId)) {
        log.debug('correction targets unanswered/unknown field → off_topic', { field_id: fieldId, answered });
        return { kind: 'off_topic' };
      }
      const result = parseFieldValue(fieldId as FieldId, body.value);
      if (!result.success) {
        log.debug('correction value rejected by schema → off_topic', { field_id: fieldId, value: body.value, result });
        return { kind: 'off_topic' };
      }
      return { kind: 'correction', fieldId: fieldId as FieldId, value: result.value };
    }
    case 'question':
      return { kind: 'question', text: reply };
    case 'dont_know':
      return { kind: 'dont_know' };
    case 'skip_request':
      return { kind: 'skip_request' };
    case 'off_topic':
      return { kind: 'off_topic' };
    default:
      log.warn('unknown intent label → off_topic', { field: field.id, intent: body.intent });
      return { kind: 'off_topic' };
  }
}
