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
let turnReply: string | null;
let turnPrompts: string[];

function stubLlm(): OpenAI {
  const create = async (params: StubParams): Promise<unknown> => {
    if (params.response_format !== undefined) {
      const body = intentOverride ?? { intent: 'answer', value: nextValue };
      return { choices: [{ message: { content: JSON.stringify(body) } }] };
    }
    const prompt = params.messages.map((m) => m.content).join('\n');
    if (prompt.includes("Write the assistant's next Telegram message")) {
      turnPrompts.push(prompt);
      if (turnReply !== null) return { choices: [{ message: { content: turnReply } }] };
    }
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
  turnReply = null;
  turnPrompts = [];
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
    expect(finished.text).toContain('remind you to re-assess in 6 or 12 months');
    expect(finished.document?.filename).toMatch(/^myfingap-report-.*\.pdf$/);
    expect(finished.document?.data.subarray(0, 5).toString()).toBe('%PDF-');
    const storedReport = store.latestReport(USER);
    expect(storedReport?.pdf.equals(finished.document!.data)).toBe(true);
    expect(storedReport?.text).toContain('At 65');
    expect(storedReport?.text).not.toContain('remind you to re-assess');

    const resent = await send('/report');
    expect(resent.document?.filename).toBe(finished.document?.filename);
    expect(resent.document?.data.equals(finished.document!.data)).toBe(true);

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

    const reports = store.listReports(USER);
    expect(reports).toHaveLength(2);

    const welcome = await send('/start');
    expect(welcome.text).toContain('input for the new one');
    expect(welcome.text).toContain('1. January 15, 2026');
    expect(welcome.text).toContain('2. July 20, 2026');

    const firstAgain = await send('download 1');
    expect(firstAgain.text).toContain('January 15, 2026');
    expect(firstAgain.document?.data.equals(reports[0]!.pdf)).toBe(true);

    const outOfRange = await send('download 3');
    expect(outOfRange.text).toContain('I only have 2 report(s) for you');
    expect(outOfRange.document).toBeUndefined();

    const forgotten = await send('/forget');
    expect(forgotten.text).toContain('2 reports');
    expect(store.listAssessments(USER)).toHaveLength(0);
    expect(store.latestReport(USER)).toBeUndefined();
    expect((await send('/report')).document).toBeUndefined();
    expect(store.dueNudges('2027-12-31T00:00:00.000Z')).toHaveLength(0);
  });

  it('accepts a skip on a required field and moves to the next question', async () => {
    await startInterview();
    await answerUntil('age');
    expect(fieldNow()?.id).toBe('age');
    intentOverride = { intent: 'skip_request' };
    const out = await send("I'd rather not say");
    intentOverride = null;
    expect(fieldNow()?.id).not.toBe('age');
    expect(state()?.skipped).toEqual(['age']);
    expect('age' in (state()?.answers ?? {})).toBe(false);
    expect(out.text).toContain('Skipped');
  });

  it('/skip works without the model and /stop ends with a partial report', async () => {
    await startInterview();
    await answerUntil('cash_total');
    await send('/skip');
    expect(state()?.skipped).toEqual(['cash_total']);
    expect(fieldNow()?.id).not.toBe('cash_total');

    const report = await send('/stop');
    expect(report.text).toContain('partial picture');
    expect(report.text.indexOf('partial picture')).toBeLessThan(report.text.indexOf('Blind spots I could not check'));
    expect(report.text).toContain('no retirement projection to show');
    expect(report.text).toContain('remind you to re-assess in 6 or 12 months');
    expect(report.document?.caption).toContain('partial');

    const saved = store.listAssessments(USER);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.status).toBe('partial');
    expect(saved[0]!.unanswered).toContain('cash_total');
    expect(saved[0]!.unanswered).toContain('retire_age');
    expect(saved[0]!.not_assessed).toContain('thin_emergency_fund');
    expect(saved[0]!.blind_spots.map((b) => b.rule_id)).not.toContain('thin_emergency_fund');
    expect(saved[0]!.answers.cash_total).toBeNull();
    expect(state()?.awaitingNudgeChoice).toBe(true);

    const nudged = await send('6');
    expect(nudged.text).toContain('remind you');
    expect(store.dueNudges('2026-08-15T00:00:00.000Z')).toHaveLength(1);
  });

  it('a natural-language stop request produces the same report as /stop', async () => {
    await startInterview();
    await answerUntil('cash_total');
    intentOverride = { intent: 'stop_request' };
    const report = await send('just show me what you have so far');
    intentOverride = null;
    expect(report.text).toContain('partial picture');
    expect(store.listAssessments(USER)[0]!.status).toBe('partial');
  });

  it('/stop with nothing in progress explains the commands', async () => {
    const out = await send('/stop');
    expect(out.text).toContain('no assessment in progress');
    expect(store.listAssessments(USER)).toHaveLength(0);
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

  it('uses the model wording for the next question when it passes the guard', async () => {
    await startInterview();
    await answerUntil('spend_living');

    turnReply = 'Noted. Roughly how much goes on day-to-day living each month?';
    nextValue = 1200;
    const out = await handleMessage({ userId: USER, text: '1200', firstName: 'Luca' }, deps());

    expect(fieldNow()?.id).not.toBe('spend_living');
    expect(state()!.answers.spend_living).toBe(1200);
    expect(out.text).toBe(turnReply);
    expect(out.document).toBeUndefined();

    const prompt = turnPrompts.at(-1)!;
    expect(prompt).toContain("Person's first name: Luca");
    expect(prompt).toContain('was saved as: 1200');
    expect(prompt).toContain('[Luca]: 1200');
  });

  it('stores several fields from one open answer and follows up only on what is missing', async () => {
    await startInterview();
    await answerUntil('age');

    intentOverride = {
      intent: 'answer',
      value: 41,
      values: { has_partner: 'household', residence_country: 'ES', dependants: 2 },
    };
    await send("I'm 41, married, living in Spain with two kids");

    const s = state()!;
    expect(s.answers.age).toBe(41);
    expect(s.answers.has_partner).toBe('household');
    expect(s.answers.residence_country).toBe('ES');
    expect(fieldNow()?.id).toBe('stay_abroad');
    expect(s.pending).toEqual({ dependants: 2 });
    expect(turnPrompts.at(-1)).toContain('these were also saved');

    intentOverride = null;
    nextValue = 'yes';
    await send('yes');
    expect(state()!.answers.dependants).toBe(2);
    expect(fieldNow()?.id).toBe('education_funded');
  });

  it('keeps asking the current field when only other fields were answered', async () => {
    await startInterview();
    await answerUntil('income_monthly');

    intentOverride = { intent: 'answer', values: { spend_housing: 1800 } };
    const out = await send('rent is 1800');

    expect(fieldNow()?.id).toBe('income_monthly');
    expect(state()!.pending).toEqual({ spend_housing: 1800 });
    expect(out.text).toContain('Saved: Housing and utilities each month.');

    intentOverride = null;
    nextValue = 5000;
    await send('5000');
    expect(state()!.answers.spend_housing).toBe(1800);
    expect(fieldNow()?.id).toBe('spend_living');
  });

  it('asks an open section question when a new section starts', async () => {
    await startInterview();
    await answerUntil('base_currency');
    expect(fieldNow()?.id).toBe('base_currency');
    expect(turnPrompts.at(-1)).toContain('Money in and out each month');
    expect(turnPrompts.at(-1)).toContain('A new part of the interview starts');
  });

  it('falls back to the static wording when the guard blocks the model turn', async () => {
    await startInterview();
    await answerUntil('spend_living');

    intentOverride = { intent: 'off_topic' };
    turnReply = 'Move everything into fund X.';
    const blocking: GuardDeps = { ...guard, classify: async () => 'BLOCK' };
    const out = await handleMessage(
      { userId: USER, text: 'what is the weather like?' },
      { store, llm: stubLlm(), guard: blocking, now: () => now },
    );

    expect(fieldNow()?.id).toBe('spend_living');
    expect(out.text).toContain('Let us stay with the assessment.');
    expect(out.text).toContain('Day to day: food, transport, leisure, holidays');
  });
});
