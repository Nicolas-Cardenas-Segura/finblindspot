import { currencies, known, profileSchema, questions, unknown, type Answer, type Field, type Profile } from './profile.js';
import { assess } from './engine.js';
import { compare, renderReport } from './report.js';
import { Store, type Session } from './store.js';

export interface ConversationAI {
  extract(field: Field, text: string, currency: string): Promise<Answer | null>;
  allow(text: string): Promise<boolean>;
}

export const disclosure = 'MyFinGap finds what may be missing from your financial picture. This is educational information, not financial, legal or tax advice. Use rounded estimates only. Never send account numbers, passwords, card details or IDs. Answers and dated assessments are saved locally; /delete removes them. AI mode sends this turn to Nebius for extraction and outgoing messages for safety checks.';
export const help = '/start — begin · /resume — continue · /revisit — update · /report — latest results · /history — dates · /cancel — discard draft · /delete — remove local data. Reply “unknown” whenever you do not know. /start replaces only the draft, not saved assessments.';
const currencyPrompt = `Choose one reporting currency: ${currencies.join(', ')}. Convert estimates yourself; we never guess exchange rates.`;

export function sensitive(text: string): boolean {
  return text.length > 800 ||
    /\b(password|passwd|passport|tax[\s_-]?id|account[\s_-]?(number|no)|card[\s_-]?(number|no)|api[\s_-]?key|secret|iban|private key)\b/i.test(text) ||
    /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){10,30}\b/i.test(text) ||
    /(?:\d[ -]?){12,19}/.test(text);
}

export function parseAnswer(field: Field, text: string, currency: string): Answer | null {
  const value = text.trim();
  if (/^(unknown|not sure|i (do not|don't|don’t) know)$/i.test(value)) return unknown;
  const question = questions.find((q) => q.id === field);
  if (!question) return null;
  let candidate: Answer | undefined;
  if (question.kind === 'boolean' && /^(yes|no)$/i.test(value)) candidate = known(/^yes$/i.test(value));
  if (question.kind === 'country') candidate = known(value.toUpperCase());
  if (question.kind === 'countries') candidate = known(value.toUpperCase().split(',').map((v) => v.trim()));
  if (question.kind === 'number') {
    const match = value.match(/^((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)\s*([A-Z]{3})?$/i);
    if (match?.[1] && (!match[2] || match[2].toUpperCase() === currency)) {
      candidate = known(Number(match[1].replaceAll(',', '')));
    }
  }
  const parsed = profileSchema.shape[field].safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function conflictingCurrency(text: string, currency: string): boolean {
  const mentions: [string, RegExp][] = [
    ['EUR', /\b(EUR|euros?)\b|€/i], ['GBP', /\b(GBP|pounds?|sterling)\b|£/i],
    ['USD', /\b(USD|US dollars?)\b/i], ['CHF', /\b(CHF|francs?)\b/i],
    ['CAD', /\b(CAD|Canadian dollars?)\b/i], ['AUD', /\b(AUD|Australian dollars?)\b/i],
  ];
  return mentions.some(([code, pattern]) => code !== currency && pattern.test(text)) ||
    /\b(JPY|CNY|INR|yen|yuan|rupees?)\b/i.test(text) ||
    /[$]/.test(text);
}

function formatAnswer(answer: Answer): string {
  return answer.status === 'unknown' ? 'unknown' : Array.isArray(answer.value) ? answer.value.join(', ') : String(answer.value);
}

function nextField(session: Session): Field | undefined {
  return questions.find((q) => session.answers[q.id] === undefined)?.id;
}

function prompt(session: Session): string {
  if (!session.answers.currency) return currencyPrompt;
  const field = nextField(session);
  const index = questions.findIndex((q) => q.id === field);
  const question = questions[index];
  if (!field || !question) return 'All questions answered.';
  const previous = session.previous?.[field];
  return [
    `${index + 1}/${questions.length} · ${question.text}`,
    'All money amounts in ' + session.answers.currency + '. “Unknown” is a useful answer.',
    ...(previous ? [`Last assessment: ${formatAnswer(previous)}. Reply “same” to keep it.`] : []),
  ].join('\n');
}

export class AssessmentService {
  constructor(private readonly store: Store, private readonly ai?: ConversationAI) {}

  async reply(userId: string, input: string): Promise<string> {
    const text = input.trim();
    let response: string;
    if (sensitive(text)) {
      response = 'Please do not send identifiers or credentials. This input was not saved or sent to AI. Use rounded estimates only.';
    } else {
      response = await this.handle(userId, text);
    }
    if (this.ai) {
      let allowed = false;
      try { allowed = await this.ai.allow(response); } catch { /* Fail closed. */ }
      if (!allowed) throw new Error('Outbound safety check unavailable or rejected output.');
    }
    return response;
  }

  private async handle(userId: string, text: string): Promise<string> {
    const command = text.toLowerCase();
    const snapshots = this.store.snapshots(userId);
    const latest = snapshots.at(-1);
    let session = this.store.session(userId);
    if (command === '/help') return help;
    if (command === '/delete') {
      this.store.saveSession(userId, { ...(session ?? { answers: {} }), deleting: true });
      return 'Delete all your locally stored drafts and assessments? Send /confirm_delete to confirm, or any other reply to cancel. This does not delete Telegram chat history or provider records.';
    }
    if (session?.deleting) {
      if (command === '/confirm_delete') {
        this.store.deleteUser(userId);
        return 'Your local drafts and assessments have been deleted. Send /start to begin again.';
      }
      delete session.deleting;
      this.store.saveSession(userId, session);
      return 'Deletion cancelled. /resume continues your draft.';
    }
    if (command === '/cancel') {
      this.store.clearSession(userId);
      return 'Draft discarded. Saved assessments are unchanged. Send /start or /revisit when ready.';
    }
    if (command === '/history') {
      return snapshots.length ? snapshots.map((s, index) =>
        `${index === 0 ? 'Original baseline' : 'Review'} · ${s.createdAt} · ${s.scorecard.unknownFields.length} unknown answers`).join('\n') :
        'No saved assessments yet. Send /start.';
    }
    if (command === '/report') {
      if (!latest) return 'No saved assessment yet. Send /start.';
      return renderReport(latest) + (snapshots[0] && snapshots.length > 1 ? '\n\n' + compare(snapshots[0], latest) : '');
    }
    if (command === '/start' || /^(hi|hello|hey)$/i.test(command) && !session) {
      session = { answers: {} };
      this.store.saveSession(userId, session);
      return disclosure + '\n\n' + currencyPrompt;
    }
    if (command === '/revisit') {
      if (!latest) return 'Create your first baseline with /start before revisiting.';
      session = { answers: { currency: latest.profile.currency }, previous: latest.profile };
      this.store.saveSession(userId, session);
      return 'Let’s update your picture. The original baseline stays unchanged.\n' + prompt(session);
    }
    if (!session) return help;
    if (command === '/resume') return session.pending
      ? `Please confirm ${session.pending.field}: ${formatAnswer(profileSchema.shape[nextField(session) ?? 'age'].parse(session.pending.answer))}. Reply yes/no.`
      : prompt(session);
    if (command.startsWith('/')) return help;
    if (!session.answers.currency) {
      const parsed = profileSchema.shape.currency.safeParse(text.toUpperCase());
      if (!parsed.success) return currencyPrompt;
      session.answers.currency = parsed.data;
      this.store.saveSession(userId, session);
      return prompt(session);
    }
    const field = nextField(session);
    if (!field) return 'Send /report for your results.';
    if (session.pending) {
      if (command === 'no') {
        delete session.pending;
        this.store.saveSession(userId, session);
        return 'No change saved. Please try again.\n' + prompt(session);
      }
      if (command !== 'yes') return 'Please confirm the interpretation with yes, or reject it with no.';
      const answer = profileSchema.shape[field].parse(session.pending.answer);
      delete session.pending;
      this.store.saveSession(userId, session);
      return this.record(userId, session, field, answer);
    }
    if (questions.find((q) => q.id === field)?.kind === 'number' && conflictingCurrency(text, session.answers.currency)) {
      return `Please provide your own estimate in ${session.answers.currency}, or reply unknown. I cannot convert currencies or interpret an ambiguous currency symbol.\n` + prompt(session);
    }
    let answer = command === 'same' ? session.previous?.[field] ?? null :
      parseAnswer(field, text, session.answers.currency);
    if (!answer && this.ai) {
      try { answer = await this.ai.extract(field, text, session.answers.currency); } catch { answer = null; }
      const validated = profileSchema.shape[field].safeParse(answer);
      if (validated.success) {
        session.pending = { field, answer: validated.data };
        this.store.saveSession(userId, session);
        return `I understood ${field} as ${formatAnswer(validated.data)} (${session.answers.currency} for money). Is that correct? Reply yes/no.`;
      }
    }
    if (!answer) return 'I could not record that confidently. Use one number (e.g. 2500), yes/no, country codes, or “unknown”. Do not mix currencies or ranges; choose your own estimate.\n' + prompt(session);
    return this.record(userId, session, field, answer);
  }

  private record(userId: string, session: Session, field: Field, answer: Answer): string {
    const answers = { ...session.answers, [field]: answer };
    const parsed = profileSchema.partial().safeParse(answers);
    if (!parsed.success) return 'That answer is outside the supported range. Please try again.\n' + prompt(session);
    const age = parsed.data.age, retirementAge = parsed.data.retirementAge;
    if (age?.status === 'known' && retirementAge?.status === 'known' && retirementAge.value < age.value) {
      return 'For this simple future-retirement scenario, choose your current age or later, or reply unknown.\n' + prompt(session);
    }
    session.answers = parsed.data;
    if (nextField(session)) {
      this.store.saveSession(userId, session);
      return (answer.status === 'unknown' ? 'Recorded as unknown, not zero.\n' : '') + prompt(session);
    }
    const profile: Profile = profileSchema.parse(session.answers);
    const baseline = this.store.snapshots(userId)[0];
    const snapshot = this.store.complete(userId, profile, assess(profile));
    return renderReport(snapshot) + (baseline ? '\n\n' + compare(baseline, snapshot) : '');
  }
}
