import { describe, it, expect, beforeEach } from 'vitest';
import type OpenAI from 'openai';
import type { Outgoing } from '../../src/agent/handlers.js';
import { handleMessage } from '../../src/agent/handlers.js';
import { DEFAULT_ASSUMPTIONS } from '../../src/config/assumptions.js';
import type { GuardDeps } from '../../src/guardrail/guard.js';
import { currentField } from '../../src/interview/stateMachine.js';
import type { InterviewState } from '../../src/interview/stateMachine.js';
import type { FieldDef } from '../../src/questionnaire/fields.js';
import type { Assumptions } from '../../src/questionnaire/schema.js';
import type { Store } from '../../src/store/db.js';
import { openStore } from '../../src/store/db.js';
import { BASE } from '../fixtures/cases.js';

interface StubMessage {
  role: string;
  content: string;
}

interface StubParams {
  messages: StubMessage[];
  response_format?: { type: string };
}

const USER = 'u1';

let store: Store;
let now: Date;
let nextValue: unknown;
let intentOverride: Record<string, unknown> | null;

function stubLlm(): OpenAI {
  const create = async (params: StubParams): Promise<unknown> => {
    if (params.response_format !== undefined) {
      const body = intentOverride ?? { intent: 'answer', value: nextValue };
      return { choices: [{ message: { content: JSON.stringify(body) } }] };
    }
    const prompt = params.messages.map((m) => m.content).join('\n');
    const why = /Why \(rephrase this text only\): (.+)/.exec(prompt);
    const rationale = /adding nothing new: (.+)/.exec(prompt);
    const text = why?.[1] ?? rationale?.[1] ?? '';
    return { choices: [{ message: { content: text } }] };
  };
  return { chat: { completions: { create } } } as unknown as OpenAI;
}

const guard: GuardDeps = {
  classify: async () => 'ALLOW',
  inventedNumber: () => false,
  logTrigger: () => {},
};

function deps(): Parameters<typeof handleMessage>[1] {
  return { store, llm: stubLlm(), guard, now: () => now };
}

function send(text: string): Promise<Outgoing> {
  return handleMessage({ userId: USER, text }, deps());
}

function state(): InterviewState | undefined {
  return store.loadState(USER);
}

function fieldNow(): FieldDef | null {
  const s = state();
  return s === undefined ? null : currentField(s);
}

function valueFor(s: InterviewState, f: FieldDef): unknown {
  if (f.repeat === 'pensions') {
    const row = BASE.pensions[s.answers.pensions?.length ?? 0]!;
    return (row as unknown as Record<string, unknown>)[f.id];
  }
  if (f.id === 'pensions') {
    return (s.answers.pensions?.length ?? 0) < BASE.pensions.length ? 'yes' : 'no';
  }
  if (f.id in DEFAULT_ASSUMPTIONS) {
    return DEFAULT_ASSUMPTIONS[f.id as keyof Assumptions];
  }
  return (BASE as unknown as Record<string, unknown>)[f.id];
}

function textFor(value: unknown): string {
  if (value === null) return "don't know";
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'none';
  return String(value);
}

async function answerUntil(stop?: string): Promise<Outgoing> {
  let out: Outgoing = { text: '' };
  for (let guardCount = 0; guardCount < 300; guardCount += 1) {
    const s = state();
    if (s === undefined || s.awaitingNudgeChoice === true) break;
    const f = currentField(s);
    if (f === null || f.id === stop) break;
    nextValue = valueFor(s, f);
    out = await send(textFor(nextValue));
  }
  return out;
}

async function sameUntilDone(): Promise<Outgoing> {
  let out: Outgoing = { text: '' };
  for (let guardCount = 0; guardCount < 300; guardCount += 1) {
    const s = state();
    if (s === undefined || s.awaitingNudgeChoice === true) break;
    if (currentField(s) === null) break;
    out = await send('same');
  }
  return out;
}

async function startInterview(): Promise<void> {
  await send('/start');
  await send('YES');
}

beforeEach(() => {
  store = openStore(':memory:');
  now = new Date('2026-01-15T00:00:00.000Z');
  nextValue = undefined;
  intentOverride = null;
});

describe('handleMessage', () => {
  it('shows the consent text on /start', async () => {
    const out = await send('/start');
    expect(out.text).toContain('not financial advice');
  });

  it('asks the first question after consent', async () => {
    await send('/start');
    const out = await send('YES');
    expect(fieldNow()?.id).toBe('age');
    expect(out.text).toContain('How old are you?');
  });

  it('runs case A to a complete assessment, a nudge and a revisit', async () => {
    await startInterview();
    const finished = await answerUntil();

    expect(finished.text).toContain('At 65');
    expect(finished.text).toContain('13,600');
    expect(finished.text).toContain('Remind you in 6 or 12 months? (6 / 12 / no)');

    const nudged = await send('6');
    expect(nudged.text).toContain('July');
    expect(nudged.text).toContain('2026');
    expect(store.dueNudges('2026-08-15T00:00:00.000Z')).toHaveLength(1);

    const first = store.listAssessments(USER);
    expect(first).toHaveLength(1);
    expect(first[0]!.status).toBe('complete');
    const before = structuredClone(first[0]!);

    now = new Date('2026-07-20T00:00:00.000Z');
    await send('/revisit');
    const progress = await sameUntilDone();

    expect(progress.text).toContain('Then');
    expect(progress.text).toContain('Now');
    const both = store.listAssessments(USER);
    expect(both).toHaveLength(2);
    expect(both[0]).toEqual(before);
    expect(store.dueNudges('2027-12-31T00:00:00.000Z')).toHaveLength(0);

    const forgotten = await send('/forget');
    expect(forgotten.text).toContain('Deleted');
    expect(store.listAssessments(USER)).toHaveLength(0);
    expect(store.dueNudges('2027-12-31T00:00:00.000Z')).toHaveLength(0);
  });

  it('re-asks the same field when the user asks a question', async () => {
    await startInterview();
    await answerUntil('spend_living');
    const beforeAnswers = structuredClone(state()!.answers);

    intentOverride = { intent: 'question' };
    const out = await send('why do you need this?');

    expect(fieldNow()?.id).toBe('spend_living');
    expect(out.text).toContain('Day to day: food, transport, leisure, holidays');
    expect(state()!.answers).toEqual(beforeAnswers);
  });

  it('applies a correction and re-asks the current field', async () => {
    await startInterview();
    await answerUntil('spend_living');

    intentOverride = { intent: 'correction', field_id: 'spend_housing', value: 1500 };
    const out = await send('actually my rent is 1500');

    expect(state()!.answers.spend_housing).toBe(1500);
    expect(fieldNow()?.id).toBe('spend_living');
    expect(out.text).toContain('Day to day: food, transport, leisure, holidays');
  });

  it('re-asks the same field on an off-topic message', async () => {
    await startInterview();
    await answerUntil('spend_living');

    intentOverride = { intent: 'off_topic' };
    const out = await send('what is the weather like?');

    expect(fieldNow()?.id).toBe('spend_living');
    expect(out.text).toContain('Day to day: food, transport, leisure, holidays');
  });

  it('reminds the user that only approximate figures are needed', async () => {
    await startInterview();
    await answerUntil('spend_living');

    intentOverride = { intent: 'off_topic' };
    const out = await send('my IBAN is DE89370400440532013000');

    expect(out.text).toContain('approximate');
  });
});
