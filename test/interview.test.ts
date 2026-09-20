import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssessmentService, conflictingCurrency, parseAnswer, sensitive, type ConversationAI } from '../src/interview.js';
import { known, questions, unknown } from '../src/profile.js';
import { Store } from '../src/store.js';
import { assess, defaults } from '../src/engine.js';
import { compare } from '../src/report.js';
import { answers, profile } from './fixtures.js';

const stores: Store[] = [];
function setup(ai?: ConversationAI) {
  const store = new Store();
  stores.push(store);
  return { store, service: new AssessmentService(store, ai) };
}
afterEach(() => { for (const store of stores.splice(0)) store.close(); });

async function finish(service: AssessmentService, user = 'alice', values = answers) {
  await service.reply(user, '/start');
  let result = '';
  for (const value of values) result = await service.reply(user, value);
  return result;
}

describe('assessment lifecycle', () => {
  it('saves a baseline, repeats the assessment, and preserves the original', async () => {
    const { service, store } = setup();
    const first = await finish(service);
    expect(first).toContain('Your assessment is saved');
    const baseline = store.snapshots('alice')[0];
    expect(store.session('alice')).toBeUndefined();
    expect(await service.reply('alice', '/revisit')).toContain('Last assessment: ES');
    for (const question of questions) {
      await service.reply('alice', question.id === 'cash' ? '1000' : 'same');
    }
    expect(store.snapshots('alice')).toHaveLength(2);
    expect(store.snapshots('alice')[0]).toEqual(baseline);
    const report = await service.reply('alice', '/report');
    expect(report).toContain('THEN → NOW');
    expect(report).toContain('New flags: Emergency buffer');
    expect(await service.reply('alice', '/history')).toContain('Original baseline');
    expect(store.snapshots('bob')).toEqual([]);
  });

  it('persists unknown answers as findings and never coerces them to zero', async () => {
    const { service, store } = setup();
    const values = [...answers];
    values[1 + questions.findIndex((question) => question.id === 'pension')] = 'I don’t know';
    const result = await finish(service, 'alice', values);
    expect(result).toContain('Unknown answers: 1');
    expect(store.snapshots('alice')[0]?.profile.pension).toEqual(unknown);
    expect(store.snapshots('alice')[0]?.scorecard.retirement.projectedPot).toBeNull();
  });

  it('clarifies ambiguity and invalid age without advancing or creating a snapshot', async () => {
    const { service, store } = setup();
    for (const value of ['/start', 'EUR', 'ES', 'ES,GB', '35']) await service.reply('alice', value);
    expect(await service.reply('alice', '20')).toContain('current age or later');
    expect(store.session('alice')?.answers.retirementAge).toBeUndefined();
    expect(await service.reply('alice', 'sixty to seventy')).toContain('could not record');
    expect(await service.reply('alice', '/resume')).toContain('4/18');
    expect(store.snapshots('alice')).toHaveLength(0);
  });

  it('checks AI interpretations with the user, and retries after rejection', async () => {
    const ai = { extract: vi.fn().mockResolvedValue(known('ES')), allow: vi.fn().mockResolvedValue(true) };
    const { service, store } = setup(ai);
    await service.reply('alice', '/start');
    await service.reply('alice', 'EUR');
    expect(await service.reply('alice', 'Spain')).toContain('Reply yes/no');
    expect(store.session('alice')?.answers.residence).toBeUndefined();
    expect(await service.reply('alice', '/resume')).toContain('confirm');
    await service.reply('alice', 'no');
    expect(store.session('alice')?.pending).toBeUndefined();
    await service.reply('alice', 'Spain');
    await service.reply('alice', 'yes');
    expect(store.session('alice')?.answers.residence).toEqual(known('ES'));
    expect(ai.allow).toHaveBeenCalledTimes(7);
  });

  it('rejects sensitive text before storage or inference and fails closed on classifier errors', async () => {
    const ai = { extract: vi.fn(), allow: vi.fn().mockResolvedValue(true) };
    const { service, store } = setup(ai);
    await service.reply('alice', '/start');
    const previous = store.session('alice');
    expect(await service.reply('alice', 'my password is example')).toContain('not saved or sent to AI');
    expect(store.session('alice')).toEqual(previous);
    expect(ai.extract).not.toHaveBeenCalled();
    ai.allow.mockRejectedValueOnce(new Error('offline'));
    await expect(service.reply('alice', '/help')).rejects.toThrow('safety check');
    ai.allow.mockResolvedValueOnce(false);
    await expect(service.reply('alice', '/help')).rejects.toThrow('safety check');
  });

  it('allows correcting an AI-confirmed retirement age that precedes the current age', async () => {
    const ai = { extract: vi.fn().mockResolvedValue(known(20)), allow: vi.fn().mockResolvedValue(true) };
    const { service, store } = setup(ai);
    for (const text of ['/start', 'EUR', 'ES', 'ES', '35']) await service.reply('alice', text);
    expect(await service.reply('alice', 'around 20')).toContain('Reply yes/no');
    expect(await service.reply('alice', 'yes')).toContain('current age or later');
    expect(store.session('alice')?.pending).toBeUndefined();
    await service.reply('alice', '65');
    expect(store.session('alice')?.answers.retirementAge).toEqual(known(65));
  });

  it('does not ask AI to convert foreign-currency numeric answers', async () => {
    const ai = { extract: vi.fn(), allow: vi.fn().mockResolvedValue(true) };
    const { service } = setup(ai);
    for (const value of ['/start', ...answers.slice(0, 5)]) await service.reply('alice', value);
    expect(await service.reply('alice', 'about 5000 pounds')).toContain('cannot convert');
    expect(ai.extract).not.toHaveBeenCalled();
  });

  it('requires deletion confirmation and isolates records by user', async () => {
    const { service, store } = setup();
    await finish(service);
    await finish(service, 'bob');
    await service.reply('alice', '/delete');
    await service.reply('alice', 'no');
    expect(store.snapshots('alice')).toHaveLength(1);
    await service.reply('alice', '/delete');
    await service.reply('alice', '/confirm_delete');
    expect(store.snapshots('alice')).toHaveLength(0);
    expect(store.session('alice')).toBeUndefined();
    expect(store.snapshots('bob')).toHaveLength(1);
  });

  it('preserves snapshots when cancelling a draft or restarting', async () => {
    const { service, store } = setup();
    await finish(service);
    await service.reply('alice', '/revisit');
    await service.reply('alice', '/cancel');
    expect(store.session('alice')).toBeUndefined();
    expect(store.snapshots('alice')).toHaveLength(1);
    expect(await service.reply('new-user', '/revisit')).toContain('first baseline');
  });
});

describe('parsing and persistence boundaries', () => {
  it('accepts explicit estimates, rejects negatives, ambiguous separators and foreign currencies', () => {
    expect(parseAnswer('cash', '1,250.50 EUR', 'EUR')).toEqual(known(1250.5));
    for (const text of ['-100', '1.250,50', '1,25', '500 USD', '100-200', 'Infinity', '']) {
      expect(parseAnswer('cash', text, 'EUR')).toBeNull();
    }
    expect(parseAnswer('cash', '0', 'EUR')).toEqual(known(0));
    expect(parseAnswer('age', '35.5', 'EUR')).toBeNull();
    expect(parseAnswer('countries', 'ES,ES', 'EUR')).toBeNull();
    expect(conflictingCurrency('$250', 'USD')).toBe(true);
    expect(conflictingCurrency('250 EUR', 'EUR')).toBe(false);
    expect(sensitive('4111 1111 1111 1111')).toBe(true);
    expect(sensitive('DE89 3704 0044 0532 0130 00')).toBe(true);
    expect(sensitive('25000')).toBe(false);
  });

  it('reloads drafts and immutable snapshots from disk after restart', async () => {
    const directory = mkdtempSync(join(homedir(), '.myfingap-test-'));
    const path = join(directory, 'assessment.db');
    let store = new Store(path);
    try {
      await finish(new AssessmentService(store));
      await new AssessmentService(store).reply('bob', '/start');
      store.close();
      store = new Store(path);
      expect(store.snapshots('alice')).toHaveLength(1);
      expect(store.session('bob')?.answers).toEqual({});
      expect(statSync(path).mode & 0o777).toBe(0o600);
      store.deleteUser('alice');
      expect(store.snapshots('alice')).toEqual([]);
      expect(store.session('bob')).toBeDefined();
    } finally { store.close(); rmSync(directory, { recursive: true }); }
  });

  it('reports resolved unknowns and refuses comparisons across currencies or assumptions', () => {
    const { store } = setup();
    const before = { ...profile, localWill: unknown };
    const baseline = store.complete('alice', before, assess(before), new Date('2025-01-01T00:00:00Z'));
    const current = store.complete('alice', profile, assess(profile), new Date('2025-07-01T00:00:00Z'));
    expect(compare(baseline, current)).toContain('Resolved flags: Will where you live');
    expect(compare(baseline, current)).toContain('now answered: localWill');
    const usd = { ...profile, currency: 'USD' as const };
    expect(compare(baseline, store.complete('alice', usd, assess(usd)))).toContain('comparison unavailable');
    expect(compare(baseline, store.complete('alice', profile,
      assess(profile, { ...defaults, annualRealReturn: 0 })))).toContain('comparison unavailable');
  });
});
