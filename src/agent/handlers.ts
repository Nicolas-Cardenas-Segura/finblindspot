import type OpenAI from 'openai';
import type { Assessment } from '../assess/assess.js';
import { runAssessment } from '../assess/assess.js';
import { compare } from '../assess/compare.js';
import { explainBlindSpot } from '../explain/explain.js';
import {
  renderActionPlan,
  renderConsent,
  renderProgress,
  renderQuestion,
  renderResults,
} from '../explain/render.js';
import type { GuardDeps } from '../guardrail/guard.js';
import { guardedGenerate } from '../guardrail/guard.js';
import type { InterviewState } from '../interview/stateMachine.js';
import {
  applyAnswer,
  applyCorrection,
  createState,
  currentField,
  isComplete,
} from '../interview/stateMachine.js';
import { createRevisitState } from '../interview/revisit.js';
import { MODELS } from '../llm/nebius.js';
import { SYSTEM_PROMPT } from '../llm/prompts.js';
import { dueAt } from '../nudge/scheduler.js';
import { redactSensitive } from '../privacy/sensitiveFilter.js';
import type { FieldDef } from '../questionnaire/fields.js';
import { FIELDS, PENSION_FIELDS } from '../questionnaire/fields.js';
import { classifyIntent } from '../questionnaire/intent.js';
import type { Answers, Currency, FieldId } from '../questionnaire/schema.js';
import { selectActionPlan } from '../rules/evaluate.js';
import type { RuleId } from '../rules/rules.js';
import type { Store } from '../store/db.js';

export interface Incoming {
  userId: string;
  text: string;
}

export interface Outgoing {
  text: string;
  options?: string[];
}

export interface HandlerDeps {
  store: Store;
  llm: OpenAI;
  guard: GuardDeps;
  now?: () => Date;
  nudgeDemoMinutes?: number;
}

const SENSITIVE_REMINDER =
  'Please do not send account, card, passport or tax numbers. Only approximate figures are needed.';

const HELP =
  'I can run /start for a new assessment, /revisit to update the last one, and /forget to delete everything I hold about you.';

const NUDGE_QUESTION = 'Remind you in 6 or 12 months? (6 / 12 / no)';

const NUDGE_OPTIONS = ['6', '12', 'no'];

function optionsFor(f: FieldDef): string[] | undefined {
  if (f.options !== undefined && f.options.length > 0) {
    return f.allowUnknown ? [...f.options, "don't know"] : [...f.options];
  }
  return f.allowUnknown ? ["don't know"] : undefined;
}

function askCurrent(s: InterviewState, prefix?: string): Outgoing {
  const f = currentField(s);
  if (f === null) return { text: prefix ?? HELP };
  const prefill =
    s.mode === 'revisit' && s.prefill !== undefined
      ? (s.prefill as unknown as Record<string, unknown>)[f.id]
      : undefined;
  const question = renderQuestion(f, s.answers.base_currency as Currency | undefined, prefill);
  return { text: prefix === undefined ? question : `${prefix}\n\n${question}`, options: optionsFor(f) };
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function promptFor(id: FieldId): string {
  return [...FIELDS, ...PENSION_FIELDS].find((f) => f.id === id)?.prompt ?? id;
}

function showValue(value: unknown): string {
  if (value === null) return "don't know";
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

async function rephraseRationale(
  field: FieldDef,
  msg: Incoming,
  deps: HandlerDeps,
): Promise<string> {
  const generated = await guardedGenerate(
    async () => {
      const response = await deps.llm.chat.completions.create({
        model: MODELS.interview,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `The user asked why we ask "${field.prompt}". Rephrase this reason in one or two sentences, adding nothing new: ${field.rationale}`,
          },
        ],
        temperature: 0.3,
      });
      return response.choices[0]?.message?.content?.trim() ?? '';
    },
    field.rationale,
    { userId: msg.userId },
    deps.guard,
  );
  return generated.text.trim() === '' ? field.rationale : generated.text;
}

async function complete(
  state: InterviewState,
  msg: Incoming,
  deps: HandlerDeps,
): Promise<Outgoing> {
  const now = (deps.now ?? (() => new Date()))();
  const answers = state.answers as Answers;
  const assessment: Assessment = {
    id: crypto.randomUUID(),
    user_id: msg.userId,
    created_at: now.toISOString(),
    status: 'complete',
    base_currency: answers.base_currency,
    answers,
    assumptions: state.assumptions,
    ...runAssessment(answers, state.assumptions, now),
  };

  const previous = state.mode === 'revisit' ? deps.store.latestComplete(msg.userId) : undefined;

  deps.store.insertAssessment(assessment);
  deps.store.cancelPendingNudges(msg.userId, now.toISOString());
  deps.store.clearState(msg.userId);
  deps.store.saveState({
    userId: msg.userId,
    answers: {},
    assumptions: state.assumptions,
    fieldIndex: 0,
    retries: 0,
    mode: state.mode,
    complete: true,
    awaitingNudgeChoice: true,
  });

  const whys: Record<RuleId, string> = {} as Record<RuleId, string>;
  for (const fired of selectActionPlan(assessment.blind_spots)) {
    whys[fired.rule_id] = await explainBlindSpot(fired, assessment, {
      client: deps.llm,
      guard: deps.guard,
    });
  }

  const parts = [renderResults(assessment), renderActionPlan(assessment, whys)];
  if (previous !== undefined) {
    parts.push(renderProgress(previous, assessment, compare(previous, assessment)));
  }
  parts.push(NUDGE_QUESTION);

  return { text: parts.join('\n\n'), options: NUDGE_OPTIONS };
}

function handleNudgeChoice(text: string, msg: Incoming, deps: HandlerDeps): Outgoing {
  const now = (deps.now ?? (() => new Date()))();
  const months = text.trim() === '6' ? 6 : text.trim() === '12' ? 12 : null;
  deps.store.clearState(msg.userId);

  if (months === null) {
    return { text: 'No reminder then. Send /revisit whenever you want to update your picture.' };
  }

  const assessment = deps.store.latestComplete(msg.userId);
  if (assessment === undefined) {
    return { text: 'No reminder then. Send /revisit whenever you want to update your picture.' };
  }

  const due = dueAt(now, months, deps.nudgeDemoMinutes);
  deps.store.insertNudge({
    id: crypto.randomUUID(),
    userId: msg.userId,
    assessmentId: assessment.id,
    dueAt: due.toISOString(),
    sentAt: null,
    cancelled: false,
  });
  return { text: `I will remind you on ${formatDate(due)}. Send /revisit any time before that.` };
}

function handleCommand(command: string, msg: Incoming, deps: HandlerDeps): Outgoing {
  if (command === '/start') {
    const state = deps.store.loadState(msg.userId);
    if (state !== undefined && !state.complete) {
      return {
        text: 'You have an assessment in progress. Reply "resume" to carry on where you left off, or "restart" to start again.',
        options: ['resume', 'restart'],
      };
    }
    deps.store.clearState(msg.userId);
    return { text: renderConsent(), options: ['YES'] };
  }

  if (command === '/revisit') {
    const previous = deps.store.latestComplete(msg.userId);
    if (previous === undefined) {
      return {
        text: 'There is nothing to compare yet. Send /start to run your first assessment.',
      };
    }
    const state = createRevisitState(msg.userId, previous);
    deps.store.saveState(state);
    return askCurrent(
      state,
      'Let us update your picture. Reply "same" to keep an answer, or send a new value.',
    );
  }

  if (command === '/forget') {
    const counts = deps.store.deleteUser(msg.userId);
    return {
      text: `Deleted ${counts.assessments} assessments, ${counts.states} drafts, ${counts.nudges} reminders and ${counts.triggers} logged messages. Nothing about you is left.`,
    };
  }

  return { text: HELP };
}

export async function handleMessage(msg: Incoming, deps: HandlerDeps): Promise<Outgoing> {
  const trimmed = msg.text.trim();

  if (trimmed.startsWith('/')) {
    return handleCommand(trimmed.split(/\s+/)[0]!.toLowerCase(), msg, deps);
  }

  const stored = deps.store.loadState(msg.userId);

  if (stored !== undefined && stored.awaitingNudgeChoice === true) {
    return handleNudgeChoice(trimmed, msg, deps);
  }

  if (stored === undefined) {
    if (/^(yes|y)$/i.test(trimmed)) {
      const state = applyAnswer(createState(msg.userId), 'yes');
      deps.store.saveState(state);
      return askCurrent(state);
    }
    return {
      text: 'Consent is required before we start. Reply YES to continue, or /start to read it again.',
      options: ['YES'],
    };
  }

  if (/^restart$/i.test(trimmed)) {
    deps.store.clearState(msg.userId);
    return { text: renderConsent(), options: ['YES'] };
  }

  if (/^resume$/i.test(trimmed)) {
    return askCurrent(stored);
  }

  const field = currentField(stored);
  if (field === null) {
    deps.store.clearState(msg.userId);
    return { text: HELP };
  }

  const redaction = redactSensitive(trimmed);
  const reminder = redaction.redacted ? SENSITIVE_REMINDER : undefined;

  if (stored.mode === 'revisit' && /^same$/i.test(redaction.text)) {
    const next = applyAnswer(stored, 'same');
    deps.store.saveState(next);
    return isComplete(next) ? complete(next, msg, deps) : askCurrent(next, reminder);
  }

  const intent = await classifyIntent(
    field,
    redaction.text,
    { answered: stored.answers, currency: stored.answers.base_currency as Currency | undefined },
    { client: deps.llm },
  );

  if (
    intent.kind === 'answer' ||
    intent.kind === 'dont_know' ||
    (intent.kind === 'skip_request' && field.allowUnknown)
  ) {
    const value = intent.kind === 'answer' ? intent.value : null;
    const next = applyAnswer(stored, value);
    deps.store.saveState(next);
    return isComplete(next) ? complete(next, msg, deps) : askCurrent(next, reminder);
  }

  if (intent.kind === 'skip_request') {
    return askCurrent(stored, [reminder, 'This one is needed to work out your position.'].filter(Boolean).join('\n\n'));
  }

  if (intent.kind === 'correction') {
    try {
      const next = applyCorrection(stored, intent.fieldId, intent.value);
      deps.store.saveState(next);
      return askCurrent(
        next,
        [reminder, `Updated "${promptFor(intent.fieldId)}" to ${showValue(intent.value)}.`]
          .filter(Boolean)
          .join('\n\n'),
      );
    } catch {
      return askCurrent(stored, reminder);
    }
  }

  if (intent.kind === 'question') {
    const why = await rephraseRationale(field, msg, deps);
    return askCurrent(stored, [reminder, why].filter(Boolean).join('\n\n'));
  }

  const retries = stored.retries + 1;
  const next = { ...stored, retries };
  deps.store.saveState(next);
  const redirect =
    retries >= 2
      ? "Let us stay with the assessment. You can reply 'don't know' to skip this one."
      : 'Let us stay with the assessment.';
  return askCurrent(next, [reminder, redirect].filter(Boolean).join('\n\n'));
}
