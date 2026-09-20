import { describe, expect, it } from 'vitest';
import { buildCorpus, retrieve, summarizeAssessment } from '../../src/knowledge/retrieve.js';
import { runAssessment } from '../../src/assess/assess.js';
import { DEFAULT_ASSUMPTIONS } from '../../src/config/assumptions.js';
import { BASE } from '../fixtures/cases.js';

describe('knowledge retrieval', () => {
  it('builds a corpus from field rationales and the blind spot library', () => {
    const sources = buildCorpus().map((s) => s.source);
    expect(sources).toContain('field:cash_total');
    expect(sources).toContain('blind_spot:thin_emergency_fund');
    expect(sources).toContain('blind_spot:thin_emergency_fund:ask');
    expect(sources).toContain('field:pension_country');
  });

  it('retrieves snippets that share several words with the query, deterministically', () => {
    const a = retrieve('what is an emergency fund and how many months of spending should it cover?');
    const b = retrieve('what is an emergency fund and how many months of spending should it cover?');
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThanOrEqual(3);
    expect(a.some((s) => s.source.startsWith('blind_spot:thin_emergency_fund'))).toBe(true);
    for (const s of a) expect(s.text.length).toBeLessThanOrEqual(320);
  });

  it('returns nothing for a query with no overlap and honours exclusions', () => {
    expect(retrieve('zzzz qqqq')).toEqual([]);
    const withField = retrieve('cash in accounts savings and deposits');
    const excluded = retrieve('cash in accounts savings and deposits', 3, ['field:cash_total']);
    expect(withField.some((s) => s.source === 'field:cash_total')).toBe(true);
    expect(excluded.some((s) => s.source === 'field:cash_total')).toBe(false);
  });

  it('summarises a previous assessment with only deterministic figures', () => {
    const computed = runAssessment(BASE, { ...DEFAULT_ASSUMPTIONS }, new Date('2025-07-01T00:00:00.000Z'));
    const summary = summarizeAssessment({
      id: 'a1',
      user_id: 'u1',
      created_at: '2025-07-01T00:00:00.000Z',
      status: 'complete',
      base_currency: BASE.base_currency,
      answers: BASE,
      assumptions: { ...DEFAULT_ASSUMPTIONS },
      ...computed,
    });
    expect(summary).toContain('- Date: 2025-07-01, currency EUR');
    expect(summary).toContain(`at age ${BASE.retire_age}`);
    expect(summary).toContain('Blind spots then:');
  });
});
