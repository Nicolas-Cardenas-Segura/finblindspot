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
import { MODELS, chatText } from '../llm/nebius.js';
import type { ConversationTurn, TurnEvent } from '../llm/prompts.js';
import { SYSTEM_PROMPT, TURN_PROMPT } from '../llm/prompts.js';
import { createLogger, errorData } from '../log/logger.js';
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
  firstName?: string;
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

const HISTORY_TURNS = 16;

const log = createLogger('handler');

const histories = new Map<string, ConversationTurn[]>();

function remember(userId: string, turn: ConversationTurn): void {
  const h = histories.get(userId) ?? [];
  h.push(turn);
  histories.set(userId, h.slice(-HISTORY_TURNS));
}

export function clearHistory(userId: string): void {
  histories.delete(userId);
}

function stateSummary(s: InterviewState | undefined): Record<string, unknown> | undefined {
  if (s === undefined) return undefined;
  return {
    mode: s.mode,
    fieldIndex: s.fieldIndex,
    field: currentField(s)?.id ?? null,
    pensionFieldIndex: s.pensionFieldIndex,
    pensionDraft: s.pensionDraft,
    retries: s.retries,
    complete: s.complete,
    awaitingNudgeChoice: s.awaitingNudgeChoice,
    answered: Object.keys(s.answers).length,
  };
}

function transition(label: string, before: InterviewState, after: InterviewState, extra?: Record<string, unknown>): void {
  log.debug(label, {
    ...extra,
    from: stateSummary(before),
    to: stateSummary(after),
    answers: after.answers,
    assumptions: after.assumptions,
  });
}

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

function staticTurn(s: InterviewState, event: TurnEvent, reminder?: string): Outgoing {
  const prefix = ((): string | undefined => {
    switch (event.kind) {
      case 'correction_applied':
        return `Updated "${promptFor(event.fieldId)}" to ${event.shown}.`;
      case 'question_answered':
        return event.explanation;
      case 'skip_refused':
        return 'This one is needed to work out your position.';
      case 'off_topic':
        return event.retries >= 2
          ? "Let us stay with the assessment. You can reply 'don't know' to skip this one."
          : 'Let us stay with the assessment.';
      default:
        return undefined;
    }
  })();
  return askCurrent(s, [reminder, prefix].filter(Boolean).join('\n\n') || undefined);
}

async function askConversational(
  s: InterviewState,
  event: TurnEvent,
  msg: Incoming,
  deps: HandlerDeps,
  redacted: boolean,
): Promise<Outgoing> {
  const fallback = staticTurn(s, event, redacted ? SENSITIVE_REMINDER : undefined);
  const field = currentField(s);
  if (field === null || s.mode !== 'assess') return fallback;

  const prompt = TURN_PROMPT({
    field,
    currency: s.answers.base_currency as Currency | undefined,
    event,
    history: histories.get(msg.userId) ?? [],
    firstName: msg.firstName,
    redacted,
    today: formatDate((deps.now ?? (() => new Date()))()),
  });

  try {
    const generated = await guardedGenerate(
      () =>
        chatText(
          deps.llm,
          {
            model: MODELS.interview,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: prompt },
            ],
            temperature: 0.4,
            max_tokens: 200,
          },
          `turn ${field.id}/${event.kind}`,
        ),
      fallback.text,
      { userId: msg.userId },
      deps.guard,
    );
    log.debug('turn phrased', {
      field: field.id,
      event: event.kind,
      attempts: generated.attempts,
      fellBack: generated.fellBack,
    });
    const text = generated.text.trim();
    if (generated.fellBack || text === '') return fallback;
    return { text, options: fallback.options };
  } catch (error) {
    log.warn('turn phrasing failed → static wording', { field: field.id, ...errorData(error) });
    return fallback;
  }
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
    () =>
      chatText(
        deps.llm,
        {
          model: MODELS.interview,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: `The user asked why we ask "${field.prompt}". Rephrase this reason in one or two sentences, adding nothing new: ${field.rationale}`,
            },
          ],
          temperature: 0.3,
        },
        `rationale ${field.id}`,
      ),
    field.rationale,
    { userId: msg.userId },
    deps.guard,
  );
  log.debug('rationale generated', { field: field.id, attempts: generated.attempts, fellBack: generated.fellBack });
  return generated.text.trim() === '' ? field.rationale : generated.text;
}

function advance(
  stored: InterviewState,
  next: InterviewState,
  event: TurnEvent,
  msg: Incoming,
  deps: HandlerDeps,
  redacted: boolean,
): Promise<Outgoing> {
  if (isComplete(next)) return complete(next, msg, deps);
  if (stored.mode === 'revisit') {
    return Promise.resolve(staticTurn(next, event, redacted ? SENSITIVE_REMINDER : undefined));
  }
  return askConversational(next, event, msg, deps, redacted);
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

  log.info('interview complete → assessment computed', {
    userId: msg.userId,
    assessmentId: assessment.id,
    mode: state.mode,
    previousId: previous?.id,
    fired: assessment.blind_spots.map((b) => `${b.rule_id}:${b.severity}`),
  });
  log.debug('assessment detail', {
    answers: assessment.answers,
    assumptions: assessment.assumptions,
    derived: assessment.derived,
    results: assessment.results,
    blind_spots: assessment.blind_spots,
  });

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
  const plan = selectActionPlan(assessment.blind_spots);
  log.debug('action plan selected', { plan: plan.map((f) => `${f.rule_id}:${f.severity}`) });
  for (const fired of plan) {
    whys[fired.rule_id] = await explainBlindSpot(fired, assessment, {
      client: deps.llm,
      guard: deps.guard,
    });
  }

  const parts = [renderResults(assessment), renderActionPlan(assessment, whys)];
  if (previous !== undefined) {
    const delta = compare(previous, assessment);
    log.debug('comparison with previous assessment', { previousId: previous.id, delta });
    parts.push(renderProgress(previous, assessment, delta));
  }
  parts.push(NUDGE_QUESTION);

  return { text: parts.join('\n\n'), options: NUDGE_OPTIONS };
}

function handleNudgeChoice(text: string, msg: Incoming, deps: HandlerDeps): Outgoing {
  const now = (deps.now ?? (() => new Date()))();
  const months = text.trim() === '6' ? 6 : text.trim() === '12' ? 12 : null;
  deps.store.clearState(msg.userId);
  log.debug('nudge choice', { userId: msg.userId, text, months });

  if (months === null) {
    return { text: 'No reminder then. Send /revisit whenever you want to update your picture.' };
  }

  const assessment = deps.store.latestComplete(msg.userId);
  if (assessment === undefined) {
    log.warn('nudge requested but no complete assessment found', { userId: msg.userId });
    return { text: 'No reminder then. Send /revisit whenever you want to update your picture.' };
  }

  const due = dueAt(now, months, deps.nudgeDemoMinutes);
  log.info('nudge scheduled', {
    userId: msg.userId,
    assessmentId: assessment.id,
    months,
    dueAt: due.toISOString(),
    demoMinutes: deps.nudgeDemoMinutes,
  });
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
  log.debug('command', { userId: msg.userId, command });
  if (command === '/start') {
    const state = deps.store.loadState(msg.userId);
    clearHistory(msg.userId);
    if (state !== undefined && !state.complete) {
      log.debug('/start with draft in progress → resume/restart prompt', { state: stateSummary(state) });
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
    log.debug('/revisit state created', { previousId: previous.id, order: state.order, state: stateSummary(state) });
    return askCurrent(
      state,
      'Let us update your picture. Reply "same" to keep an answer, or send a new value.',
    );
  }

  if (command === '/forget') {
    clearHistory(msg.userId);
    const counts = deps.store.deleteUser(msg.userId);
    log.info('/forget executed', { userId: msg.userId, ...counts });
    return {
      text: `Deleted ${counts.assessments} assessments, ${counts.states} drafts, ${counts.nudges} reminders and ${counts.triggers} logged messages. Nothing about you is left.`,
    };
  }

  return { text: HELP };
}

export async function handleMessage(msg: Incoming, deps: HandlerDeps): Promise<Outgoing> {
  const trimmed = msg.text.trim();
  if (!trimmed.startsWith('/')) {
    remember(msg.userId, { role: 'user', text: redactSensitive(trimmed).text });
  }
  const out = await route(msg, trimmed, deps);
  remember(msg.userId, { role: 'assistant', text: out.text });
  return out;
}

async function route(msg: Incoming, trimmed: string, deps: HandlerDeps): Promise<Outgoing> {
  if (trimmed.startsWith('/')) {
    return handleCommand(trimmed.split(/\s+/)[0]!.toLowerCase(), msg, deps);
  }

  const stored = deps.store.loadState(msg.userId);
  log.debug('state loaded', { userId: msg.userId, state: stateSummary(stored) });

  if (stored !== undefined && stored.awaitingNudgeChoice === true) {
    return handleNudgeChoice(trimmed, msg, deps);
  }

  if (stored === undefined) {
    if (/^(yes|y)$/i.test(trimmed)) {
      const fresh = createState(msg.userId);
      const state = applyAnswer(fresh, 'yes');
      deps.store.saveState(state);
      transition('consent given → interview started', fresh, state);
      clearHistory(msg.userId);
      return askConversational(state, { kind: 'consent_given' }, msg, deps, false);
    }
    log.debug('no state and no consent → consent prompt', { userId: msg.userId });
    return {
      text: 'Consent is required before we start. Reply YES to continue, or /start to read it again.',
      options: ['YES'],
    };
  }

  if (/^restart$/i.test(trimmed)) {
    deps.store.clearState(msg.userId);
    clearHistory(msg.userId);
    log.debug('restart → state cleared', { userId: msg.userId });
    return { text: renderConsent(), options: ['YES'] };
  }

  if (/^resume$/i.test(trimmed)) {
    log.debug('resume → re-ask current field', { field: currentField(stored)?.id });
    return askCurrent(stored);
  }

  const field = currentField(stored);
  if (field === null) {
    log.warn('stored state has no current field → clearing', { state: stateSummary(stored) });
    deps.store.clearState(msg.userId);
    return { text: HELP };
  }

  const redaction = redactSensitive(trimmed);
  const redacted = redaction.redacted;
  const reminder = redacted ? SENSITIVE_REMINDER : undefined;
  if (redacted) {
    log.warn('sensitive input redacted before model call', { userId: msg.userId, redactedText: redaction.text });
  }

  if (stored.mode === 'revisit' && /^same$/i.test(redaction.text)) {
    const next = applyAnswer(stored, 'same');
    deps.store.saveState(next);
    transition('revisit "same" → kept previous value', stored, next, { field: field.id });
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
    transition(`${intent.kind} → stored ${field.id}`, stored, next, { field: field.id, value });
    const event: TurnEvent =
      value === null
        ? { kind: 'dont_know_stored', fieldId: field.id }
        : { kind: 'answer_stored', fieldId: field.id, shown: showValue(value) };
    return advance(stored, next, event, msg, deps, redacted);
  }

  if (intent.kind === 'skip_request') {
    log.debug('skip refused: field is required', { field: field.id });
    return advance(stored, stored, { kind: 'skip_refused' }, msg, deps, redacted);
  }

  if (intent.kind === 'correction') {
    try {
      const next = applyCorrection(stored, intent.fieldId, intent.value);
      deps.store.saveState(next);
      transition('correction applied', stored, next, { fieldId: intent.fieldId, value: intent.value });
      return advance(
        stored,
        next,
        { kind: 'correction_applied', fieldId: intent.fieldId, shown: showValue(intent.value) },
        msg,
        deps,
        redacted,
      );
    } catch (error) {
      log.warn('correction rejected → re-ask current field', { fieldId: intent.fieldId, ...errorData(error) });
      return advance(stored, stored, { kind: 'off_topic', retries: stored.retries + 1 }, msg, deps, redacted);
    }
  }

  if (intent.kind === 'question') {
    const why = await rephraseRationale(field, msg, deps);
    return advance(stored, stored, { kind: 'question_answered', explanation: why }, msg, deps, redacted);
  }

  const retries = stored.retries + 1;
  const next = { ...stored, retries };
  deps.store.saveState(next);
  log.debug('off-topic → redirect', { field: field.id, retries });
  return advance(stored, next, { kind: 'off_topic', retries }, msg, deps, redacted);
}
