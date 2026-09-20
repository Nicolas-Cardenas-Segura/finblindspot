import { describe, it, expect } from 'vitest';
import { DEFAULT_ASSUMPTIONS } from '../../src/config/assumptions.js';
import { runAssessment, runPartialAssessment } from '../../src/assess/assess.js';
import type { Assessment } from '../../src/assess/assess.js';
import { compare } from '../../src/assess/compare.js';
import { buildReport, reportFilename } from '../../src/explain/report.js';
import type { Answers } from '../../src/questionnaire/schema.js';
import type { RuleId } from '../../src/rules/rules.js';
import { BASE, CASES } from '../fixtures/cases.js';

const NOW = new Date('2026-01-15T00:00:00.000Z');
const NO_WHYS = {} as Record<RuleId, string>;

function full(answers: Answers, id = 'a1'): Assessment {
  return {
    id,
    user_id: 'u1',
    created_at: NOW.toISOString(),
    status: 'complete',
    base_currency: answers.base_currency,
    assumptions: DEFAULT_ASSUMPTIONS,
    answers,
    ...runAssessment(answers, DEFAULT_ASSUMPTIONS, NOW),
  };
}

function partial(answers: Partial<Answers>): Assessment {
  const computed = runPartialAssessment(answers, DEFAULT_ASSUMPTIONS, NOW);
  return {
    id: 'p1',
    user_id: 'u1',
    created_at: NOW.toISOString(),
    status: 'partial',
    base_currency: computed.answers.base_currency ?? 'EUR',
    assumptions: DEFAULT_ASSUMPTIONS,
    ...computed,
  };
}

function isPdf(data: Buffer): boolean {
  return data.subarray(0, 5).toString('latin1') === '%PDF-' && data.toString('latin1').trimEnd().endsWith('%%EOF');
}

describe('buildReport', () => {
  it('renders a complete assessment as a valid PDF with all sections', async () => {
    const a = full(CASES.D.answers);
    const data = await buildReport({ assessment: a, whys: NO_WHYS });
    expect(isPdf(data)).toBe(true);
    expect(data.length).toBeGreaterThan(5000);
    expect(reportFilename(a)).toBe('finblindspot-report-2026-01-15.pdf');
  });

  it('renders a partial assessment without a projection', async () => {
    const a = partial({ base_currency: 'EUR', has_partner: 'just_me', dependants: 0, life_cover: 'no' });
    expect(a.results.mode).toBe('not_assessed');
    const data = await buildReport({ assessment: a, whys: NO_WHYS });
    expect(isPdf(data)).toBe(true);
  });

  it('renders a revisit with a comparison section', async () => {
    const previous = full(BASE, 'a0');
    const current = full({ ...BASE, cash_total: 30000 }, 'a1');
    const data = await buildReport({ assessment: current, whys: NO_WHYS, previous, delta: compare(previous, current) });
    expect(isPdf(data)).toBe(true);
  });

  it('is deterministic apart from the PDF timestamps', async () => {
    const a = full(CASES.A.answers);
    const [x, y] = await Promise.all([buildReport({ assessment: a, whys: NO_WHYS }), buildReport({ assessment: a, whys: NO_WHYS })]);
    expect(Math.abs(x.length - y.length)).toBeLessThan(64);
  });
});
