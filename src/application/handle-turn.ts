import { randomUUID } from 'node:crypto';
import type { Config } from '../config/env';
import { applyAnswer, confirmPending, describeAnswer, initialState, nextDomain, questions, selectMode } from '../core/interview';
import { domainSchema } from '../core/profile';
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
    return `Financial Blindspot is an educational visibility check for adults. I will not recommend investments, financial products or actions with your money. Use estimates, not account numbers, credentials or identifying details. Sanitised assessment data is kept for ${this.config.RETENTION_DAYS} days; /forget requests deletion. Telegram keeps its own history.\n\nChoose /quick for a partial check or /full for the full interview. Unknown and /skip are valid answers.`;
  }
  private prompt(record: AssessmentRecord): string {
    if (!record.state.mode) return this.welcome();
    const domain = nextDomain(record.state);
    return domain ? questions[domain] : 'The interview is complete. Use /report for your scorecard, /full to fill remaining gaps, or /revisit to update values.';
  }
  private async handle(owner: string, turnId: string, raw: string, unsupported: boolean): Promise<ApprovedResponse | null> {
    const input = checkInput(raw);
    if (!input.accepted || unsupported) return (await this.guard.approve('Financial Blindspot provides education, not financial advice. Please send text estimates only, without credentials, account or card numbers, identification details, or documents.')).response;
    if (await this.repository.isExpired(owner)) { await this.memory.forget(owner); await this.repository.forget(owner); }
    const duplicate = await this.repository.getTurn(owner, turnId);
    if (duplicate) return this.guard.inspect(duplicate);
    const existing = await this.repository.load(owner);
    if (owner.startsWith('eval:') && !existing) return null;
    const record = existing ? structuredClone(existing) : this.repository.fresh(owner);
    const text = input.text;
    const command = text.toLowerCase().trim();
    let candidate = '';
    let summary = 'User requested assessment navigation.';
    let reportRequested = false;
    if (command === '/forget') {
      record.state.forgetRequested = true;
      if (existing) await this.repository.requestForget(record);
      candidate = 'Delete your stored assessment, snapshots, report links and sanitised conversation memory? Reply /confirmforget to delete or /cancel to keep them. This does not delete Telegram history.';
    } else if (command === '/confirmforget' && record.state.forgetRequested) {
      await this.memory.forget(owner);
      await this.repository.forget(owner);
      return this.guard.inspect('Your application assessment, reports and sanitised conversation memory have been deleted. Telegram history is separate. Use /start to begin again.');
    } else if (command === '/cancel') {
      record.state = { ...record.state, pending: null, editing: null, forgetRequested: false };
      candidate = this.prompt(record);
    } else if (record.state.forgetRequested) {
      candidate = 'Reply /confirmforget to delete your application data or /cancel to keep it.';
    } else if (record.state.pending) {
      if (['yes', '/yes', 'no', '/no'].includes(command)) {
        Object.assign(record, confirmPending(record.profile, record.state, command === 'yes' || command === '/yes'));
        candidate = this.prompt(record);
      } else candidate = 'Please reply yes to confirm the proposed correction or no to keep the previous value.';
    } else if (['/start', 'hi', 'hello', 'hey'].includes(command)) candidate = existing ? this.prompt(record) : this.welcome();
    else if (command === '/help') candidate = '/quick: short assessment\n/full: all domains\n/resume: next question\n/skip: skip this question\n/report: current scorecard\n/edit income (or another domain): correct a value\n/revisit: update an assessment\n/simulate6months: labelled demo\n/forget: request deletion\n\nThis is education, not financial advice.';
    else if (command === '/quick' || command === '/full') { record.state = selectMode(record.state, command === '/quick' ? 'quick' : 'full'); candidate = this.prompt(record); }
    else if (command === '/resume') candidate = this.prompt(record);
    else if (command === '/report') reportRequested = true;
    else if (command === '/revisit' || command === '/simulate6months') {
      record.state = { ...initialState(), mode: 'quick', introduced: record.state.introduced, answered: record.state.answered.filter(d => !['income', 'expenses', 'cash', 'debt'].includes(d)), simulation: command === '/simulate6months' };
      candidate = `${record.state.simulation ? 'Six months later — simulation only; actual dates are preserved.\n' : 'Let us update your estimates while preserving the original baseline.\n'}${this.prompt(record)}`;
    } else if (command.startsWith('/edit ')) {
      const domain = domainSchema.safeParse(text.slice(6).trim());
      if (domain.success) { record.state.editing = domain.data; candidate = questions[domain.data]; }
      else candidate = `Choose a domain: ${domainSchema.options.join(', ')}.`;
    } else if (command.startsWith('/') && command !== '/skip') candidate = 'I did not recognise that command. Use /help for options, or /resume to continue.';
    else if (!record.state.mode) candidate = this.welcome();
    else {
      const domain = nextDomain(record.state);
      if (!domain) candidate = this.prompt(record);
      else {
        try {
          const extracted = command === '/skip' ? { kind: 'answer' as const, answer: { status: 'skipped' as const } } : /^(unknown|i don.t know|not sure)$/i.test(text) ? { kind: 'answer' as const, answer: { status: 'unknown' as const } } : await this.extractor.extract(owner, domain, text, record.profile);
          if (extracted.kind !== 'answer') candidate = `${extracted.message}\n\n${questions[domain]}`;
          else {
            Object.assign(record, applyAnswer(record.profile, record.state, domain, extracted.answer));
            summary = `Validated ${domain} answer: ${JSON.stringify(extracted.answer)}`;
            if (record.state.pending) candidate = `Proposed correction for ${domain}: ${describeAnswer(extracted.answer)}. Reply yes to confirm or no to keep the previous value.`;
            else if (!nextDomain(record.state)) reportRequested = true;
            else candidate = `Recorded ${domain}: ${describeAnswer(extracted.answer)}\n\n${this.prompt(record)}`;
          }
        } catch { candidate = `I could not reliably interpret that answer. ${questions[domain]} You can also say unknown or /skip.`; }
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
      candidate = renderReport(report);
      snapshot = { id: randomUUID(), report, text: candidate };
      if (capability) candidate += `\n\nPrivate report (anyone with this link can read it until expiry): ${this.config.PUBLIC_BASE_URL.replace(/\/$/, '')}/r/${capability.token}`;
    }
    if (!record.state.introduced) {
      if (!candidate.startsWith('Financial Blindspot')) candidate = `Financial Blindspot provides education, not financial advice. I will not recommend financial products or actions with your money. Use estimates, never identifying details. Data is kept for ${this.config.RETENTION_DAYS} days; /forget requests deletion.\n\n${candidate}`;
      record.state.introduced = true;
    }
    const checked = await this.guard.approve(candidate, async () => `I could not deliver that response within the education boundary. Your previous progress is preserved.\n\n${this.prompt(existing ?? this.repository.fresh(owner))}`);
    if (!checked.response) return null;
    if (!checked.original) return checked.response;
    const savedText = snapshot?.text ?? checked.response.text;
    await this.repository.commitTurn(record, turnId, savedText, snapshot, capability);
    await this.memory.remember(owner, summary, savedText);
    return checked.response;
  }
}
