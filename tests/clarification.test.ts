import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AssessmentRepository } from '../src/storage/assessment-repository';
import { extractionSchema, AnswerExtractor } from '../src/application/extraction';
import { emptyProfile } from '../src/core/profile';
import { mergeClarification, completedClarification, clarificationQuestion, validCurrencyEvidence } from '../src/core/clarification';
import { initialState, stateSchema } from '../src/core/interview';

describe('validated partial answers', () => {
  it('retains Spain while asking only for a reporting currency', () => {
    const draft = mergeClarification(null, { domain: 'residency', value: { country: 'ES', currency: null } });
    expect(completedClarification(draft)).toBeNull();
    expect(clarificationQuestion(draft)).toContain('Spain');
    expect(clarificationQuestion(draft)).toContain('report');
    expect(clarificationQuestion(draft)).not.toContain('Which country');
    const complete = mergeClarification(draft, { domain: 'residency', value: { country: null, currency: 'EUR' } });
    expect(completedClarification(complete)).toEqual({ status: 'known', value: { country: 'ES', currency: 'EUR' } });
  });
  it('retains a monetary amount and period while waiting for currency', () => {
    const draft = mergeClarification(null, { domain: 'income', value: { min: 4000, max: 4000, currency: null, period: 'monthly' } });
    expect(completedClarification(draft)).toBeNull();
    expect(clarificationQuestion(draft)).toContain('4,000');
    expect(clarificationQuestion(draft)).toContain('currency');
    const complete = mergeClarification(draft, { domain: 'income', value: { min: null, max: null, currency: 'USD', period: null } });
    expect(completedClarification(complete)).toEqual({ status: 'known', value: { min: 4000, max: 4000, currency: 'USD', period: 'monthly' } });
  });
  it('does not reuse a draft for a different domain or collapse a range', () => {
    const income = { domain: 'income' as const, value: { min: 4000, max: 5000, currency: 'EUR', period: 'monthly' as const } };
    expect(completedClarification(income)).toEqual({ status: 'known', value: income.value });
    const cash = mergeClarification(income, { domain: 'cash', value: { min: null, max: null, currency: 'EUR', period: 'balance' } });
    expect(completedClarification(cash)).toBeNull();
  });
  it('does not accept guessed or ambiguous currencies as evidence', () => {
    expect(validCurrencyEvidence('EUR', 'EUR', '4000')).toBe(false);
    expect(validCurrencyEvidence('EUR', '4000', '4000')).toBe(false);
    expect(validCurrencyEvidence('USD', 'dollars', '4000 dollars')).toBe(false);
    expect(validCurrencyEvidence('EUR', 'euros', 'I prefer euros')).toBe(true);
    expect(validCurrencyEvidence('USD', 'US dollars', '4000 US dollars')).toBe(true);
    expect(validCurrencyEvidence('USD', 'USD', 'US dollars')).toBe(true);
    expect(validCurrencyEvidence('EUR', null, '4000 euros')).toBe(true);
    expect(validCurrencyEvidence('EUR', 'eur', '4000 in neuroscience')).toBe(false);
    expect(validCurrencyEvidence('CAD', 'CAD', 'CAD')).toBe(true);
  });
  it('completes currency-only replies from validated context without reinterpreting known facts', async () => {
    const extractor = new AnswerExtractor(() => { throw new Error('No model calls expected'); }, () => false);
    const country = await extractor.extract('synthetic', 'residency', 'I prefer euros', emptyProfile(), { domain: 'residency', value: { country: 'ES', currency: null } });
    expect(country).toEqual({ kind: 'answer', answer: { status: 'known', value: { country: 'ES', currency: 'EUR' } } });
    const income = await extractor.extract('synthetic', 'income', 'US dollars', emptyProfile(), { domain: 'income', value: { min: 4000, max: 4000, currency: null, period: 'monthly' } });
    expect(income).toEqual({ kind: 'answer', answer: { status: 'known', value: { min: 4000, max: 4000, currency: 'USD', period: 'monthly' } } });
  });
  it('does not let the model mark incomplete residency as not applicable', () => {
    expect(extractionSchema('residency').safeParse({ kind: 'answer', answer: { status: 'not_applicable' }, partial: null, currencyEvidence: null, reportingCurrencyChosen: false, message: '' }).success).toBe(false);
    expect(extractionSchema('residency').safeParse({ kind: 'clarify', answer: null, partial: { country: 'ES', currency: null }, currencyEvidence: null, reportingCurrencyChosen: false, message: '' }).success).toBe(true);
  });
  it('persists a validated country draft across a repository restart without scoring it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'blindspot-draft-'));
    const url = `file:${join(directory, 'app.db')}`;
    const owner = `eval:${randomUUID()}`;
    let repository = new AssessmentRepository(url, 7);
    try {
      await repository.init();
      const record = repository.fresh(owner);
      record.state.clarification = { domain: 'residency', value: { country: 'ES', currency: null } };
      await repository.commitTurn(record, 'synthetic-draft', 'Which currency would you prefer for the report?');
      repository.close();
      repository = new AssessmentRepository(url, 7);
      await repository.init();
      const loaded = (await repository.load(owner))!;
      expect(loaded.state.clarification).toEqual(record.state.clarification);
      expect(loaded.profile).toEqual(emptyProfile());
      await repository.forget(owner);
      expect(await repository.load(owner)).toBeNull();
    } finally { repository.close(); await rm(directory, { recursive: true, force: true }); }
  });
  it('loads older states and validates stored drafts without making profile data known', () => {
    const { clarification: _draft, ...oldState } = initialState();
    expect(stateSchema.parse(oldState).clarification).toBeNull();
    expect(stateSchema.safeParse({ ...oldState, clarification: { domain: 'residency', value: { country: 'Spain', currency: null } } }).success).toBe(false);
  });
});
