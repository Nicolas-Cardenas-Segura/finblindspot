import { randomUUID } from 'node:crypto';
import type { Config } from '../config/env';
import { applyAnswer, confirmPending, describeAnswer, initialState, nextDomain, privacyMessages, questions, selectMode, conversationCommand, acknowledgeAnswer, conversationalBridge, introductionMessage, welcomeMessage, conversationMessages } from '../core/interview';
import { domainSchema } from '../core/profile';
import { clarificationQuestion, mergeClarification } from '../core/clarification';
import { createReport, renderReport } from '../core/report';
import { compareReports } from '../core/comparison';
import { RateLimiter } from '../server/access';
import { checkInput } from '../guardrail/input-policy';
import type { OutboundGuard } from '../guardrail/classifier';
import type { ApprovedResponse } from '../guardrail/output-policy';
import { newCapability, type AssessmentRepository, type AssessmentRecord, type Snapshot } from '../storage/assessment-repository';
import type { ConversationMemory } from '../storage/conversation-memory';
import type { AnswerExtractor } from './extraction';
import type { ExplanationWriter } from './explanation-writer';

export class AssessmentService {
  private locks = new Map<string, Promise<unknown>>();
  private limiter = new RateLimiter(20);
  constructor(private repository: AssessmentRepository, private memory: ConversationMemory, private extractor: AnswerExtractor, private guard: OutboundGuard, private config: Config, private explanationWriter: ExplanationWriter) {}
  async turn(owner: string, turnId: string, raw: string, unsupported = false): Promise<ApprovedResponse | null> {
    if (!/^(telegram:[a-f0-9]{64}|eval:[a-f0-9-]{36})$/.test(owner) || !turnId || turnId.length > 180) throw new Error('Invalid turn identity');
    if (!this.limiter.accept(owner)) return null;
    const before = this.locks.get(owner) ?? Promise.resolve();
    const job = before.catch(() => {}).then(() => this.handle(owner, turnId, raw, unsupported));
    this.locks.set(owner, job);
    try { return await job; } finally { if (this.locks.get(owner) === job) this.locks.delete(owner); }
  }
  async purgeExpired(): Promise<void> {
    for (const owner of await this.repository.expiredOwners()) {
      const prior = this.locks.get(owner) ?? Promise.resolve();
      const job = prior.catch(() => {}).then(async () => { await this.memory.forget(owner); await this.repository.forget(owner); });
      this.locks.set(owner, job);
      try { await job; } finally { if (this.locks.get(owner) === job) this.locks.delete(owner); }
    }
  }
  async finalize(owner: string): Promise<void> {
    const prior = this.locks.get(owner) ?? Promise.resolve();
    const job = prior.catch(() => {}).then(async () => { await this.memory.forget(owner); await this.repository.forget(owner); });
    this.locks.set(owner, job);
    try { await job; } finally { if (this.locks.get(owner) === job) this.locks.delete(owner); }
  }
  private welcome(): string {
    return welcomeMessage(this.config.RETENTION_DAYS);
  }
  private prompt(record: AssessmentRecord): string {
    if (!record.state.mode) return record.state.introduced ? conversationMessages.choosePath : this.welcome();
    const domain = nextDomain(record.state);
    return domain ? record.state.clarification?.domain === domain ? clarificationQuestion(record.state.clarification) : questions[domain] : conversationMessages.complete;
  }
  private async handle(owner: string, turnId: string, raw: string, unsupported: boolean): Promise<ApprovedResponse | null> {
    const input = checkInput(raw);
    if (!input.accepted || unsupported) return (await this.guard.approve('MyFinGap is here for financial education, not financial advice. Let’s keep this to rough text estimates, without credentials, account numbers, identification details or documents.')).response;
    if (await this.repository.isExpired(owner)) { await this.memory.forget(owner); await this.repository.forget(owner); }
    const duplicate = await this.repository.getTurn(owner, turnId);
    if (duplicate) return this.guard.inspect(duplicate);
    const existing = await this.repository.load(owner);
    if (owner.startsWith('eval:') && !existing) return null;
    const record = existing ? structuredClone(existing) : this.repository.fresh(owner);
    const text = input.text;
    const command = conversationCommand(text, record.state) ?? text.toLowerCase().trim();
    let candidate = '';
    let summary = 'User requested assessment navigation.';
    let reportRequested = false;
    let reportLead = '';
    if (command === '/forget') {
      record.state.forgetRequested = true;
      if (existing) await this.repository.requestForget(record);
      candidate = privacyMessages.confirmForget;
    } else if (command === '/confirmforget' && record.state.forgetRequested) {
      await this.memory.forget(owner);
      await this.repository.forget(owner);
      return this.guard.inspect(privacyMessages.forgotten);
    } else if (command === '/cancel') {
      record.state = { ...record.state, pending: null, editing: null, forgetRequested: false };
      candidate = this.prompt(record);
    } else if (record.state.forgetRequested) {
      candidate = privacyMessages.forgetPending;
    } else if (record.state.pending) {
      if (['yes', '/yes', 'no', '/no'].includes(command)) {
        Object.assign(record, confirmPending(record.profile, record.state, command === 'yes' || command === '/yes'));
        candidate = this.prompt(record);
      } else candidate = 'Please reply yes to confirm the proposed correction or no to keep the previous value.';
    } else if (['/start', 'hi', 'hello', 'hey'].includes(command)) candidate = record.state.introduced ? `Hi again. We can pick up where we left off.\n\n${this.prompt(record)}` : this.welcome();
    else if (command === '/help') candidate = '/quick: short assessment\n/full: all domains\n/resume: next question\n/skip: skip this question\n/report: current scorecard\n/edit income (or another domain): correct a value\n/revisit: update an assessment\n/simulate6months: labelled demo\n/forget: request deletion\n\nThis is education, not financial advice.';
    else if (command === '/quick' || command === '/full') { record.state = selectMode(record.state, command === '/quick' ? 'quick' : 'full'); candidate = this.prompt(record); }
    else if (command === '/resume') candidate = this.prompt(record);
    else if (command === '/report') reportRequested = true;
    else if (command === '/revisit' || command === '/simulate6months') {
      record.state = { ...initialState(), mode: 'quick', introduced: record.state.introduced, answered: record.state.answered.filter(d => !['income', 'expenses', 'cash', 'debt'].includes(d)), simulation: command === '/simulate6months' };
      candidate = `${record.state.simulation ? 'Six months later — simulation only; actual dates are preserved.\n' : 'Let us update your estimates while preserving the original baseline.\n'}${this.prompt(record)}`;
    } else if (command.startsWith('/edit ')) {
      const domain = domainSchema.safeParse(text.slice(6).trim());
      if (domain.success) { record.state.editing = domain.data; record.state.clarification = null; candidate = questions[domain.data]; }
      else candidate = `Choose a domain: ${domainSchema.options.join(', ')}.`;
    } else if (command.startsWith('/') && command !== '/skip') candidate = 'I did not recognise that command. Use /help for options, or /resume to continue.';
    else if (!record.state.mode) {
      try {
        const opening = await this.extractor.opening(owner, text, record.profile);
        if (opening.country) record.state.clarification = mergeClarification(record.state.clarification, { domain: 'residency', value: { country: opening.country, currency: null } });
        summary = opening.country ? `Validated opening context: country ${opening.country}; reporting currency and path not selected.` : summary;
        const acknowledgement = conversationalBridge(opening.message, 'We can start by organising the picture, one part at a time. You don’t need to know your total wealth to begin.');
        candidate = `${acknowledgement}${opening.country ? '\n\nI’ve kept the country you mentioned, so you won’t need to repeat it.' : ''}\n\n${conversationMessages.choosePath}`;
      } catch { candidate = this.prompt(record); }
    }
    else {
      const domain = nextDomain(record.state);
      if (!domain) candidate = this.prompt(record);
      else {
        try {
          const extracted = command === '/skip' ? { kind: 'answer' as const, answer: { status: 'skipped' as const } } : /^(unknown|i don.t know|not sure)$/i.test(text) ? { kind: 'answer' as const, answer: { status: 'unknown' as const } } : await this.extractor.extract(owner, domain, text, record.profile, record.state.clarification);
          if (extracted.kind !== 'answer') {
            if (extracted.draft) {
              record.state.clarification = extracted.draft;
              summary = `Validated partial ${domain} answer: ${JSON.stringify(extracted.draft.value)}; not a completed profile field.`;
              candidate = clarificationQuestion(extracted.draft);
            } else candidate = `${conversationalBridge(extracted.message, extracted.kind === 'clarify' ? conversationMessages.clarify : conversationMessages.offTopic)}\n\n${this.prompt(record)}`;
          }
          else {
            Object.assign(record, applyAnswer(record.profile, record.state, domain, extracted.answer));
            summary = `Validated ${domain} answer: ${JSON.stringify(extracted.answer)}`;
            if (record.state.pending) candidate = `Just to check, you’d like me to replace the earlier answer with ${describeAnswer(extracted.answer)}. Is that right? Reply yes to confirm or no to keep the previous answer.`;
            else if (!nextDomain(record.state)) { reportRequested = true; reportLead = `${acknowledgeAnswer(domain, extracted.answer)}\n\n${conversationMessages.reportLead}\n\n`; }
            else candidate = `${acknowledgeAnswer(domain, extracted.answer)}\n\n${this.prompt(record)}`;
          }
        } catch { candidate = `I’m not quite sure I understood, and I’d rather not guess.\n\n${this.prompt(record)}\n\nYou can also say unknown or skip.`; }
      }
    }
    let snapshot: Snapshot | undefined;
    const capability = reportRequested && owner.startsWith('telegram:') ? newCapability(this.config.REPORT_TTL_HOURS * 3600000) : undefined;
    if (reportRequested) {
      const report = createReport(record.profile, new Date().toISOString());
      const baseline = await this.repository.baseline(owner);
      if (baseline) { report.baselineAt = baseline.report.createdAt; report.comparison = compareReports(baseline.report, report); }
      report.simulation = record.state.simulation;
      report.explanations = await this.explanationWriter.write(report, owner);
      candidate = `${reportLead}${renderReport(report)}`;
      snapshot = { id: randomUUID(), report, text: candidate };
      if (capability) candidate += `\n\nPrivate report (anyone with this link can read it until expiry): ${this.config.PUBLIC_BASE_URL.replace(/\/$/, '')}/r/${capability.token}`;
    }
    if (!record.state.introduced) {
      if (!candidate.startsWith('Hi, I’m MyFinGap')) candidate = `${introductionMessage(this.config.RETENTION_DAYS)}\n\n${candidate}`;
      record.state.introduced = true;
    }
    const checked = await this.guard.approve(candidate, async () => `I couldn’t verify that reply, so I haven’t changed your previous answers. We can try again gently.\n\n${this.prompt(existing ?? this.repository.fresh(owner))}`);
    if (!checked.response) return null;
    if (!checked.original) return checked.response;
    const savedText = snapshot?.text ?? checked.response.text;
    await this.repository.commitTurn(record, turnId, savedText, snapshot, capability);
    await this.memory.remember(owner, summary, savedText);
    return checked.response;
  }
}
