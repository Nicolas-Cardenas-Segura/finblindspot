import { describe, it, expect } from 'vitest';
import { DEFAULT_ASSUMPTIONS } from '../../src/config/assumptions.js';
import { runAssessment } from '../../src/assess/assess.js';
import { BASE, CASES } from '../fixtures/cases.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');

const ids = (answers = BASE): string[] =>
  runAssessment(answers, DEFAULT_ASSUMPTIONS, NOW).blind_spots.map((f) => f.rule_id);

describe('runAssessment', () => {
  it('returns derived, results and blind spots for case A', () => {
    const { derived, results, blind_spots } = runAssessment(CASES.A.answers, DEFAULT_ASSUMPTIONS, NOW);

    expect(derived.monthly_spending).toBe(3000);
    expect(results.position).not.toBeNull();
    expect(Math.abs((results.position ?? 0) - 28501)).toBeLessThanOrEqual(1);
    expect(blind_spots.map((f) => f.rule_id)).not.toContain('retirement_gap');
  });

  it('fires the pension timing gap for case D', () => {
    expect(ids(CASES.D.answers)).toContain('pension_timing_gap');
  });

  it('bumps severity for topics in learning_priorities', () => {
    const base = runAssessment(BASE, DEFAULT_ASSUMPTIONS, NOW).blind_spots.find(
      (f) => f.rule_id === 'fees_unknown',
    );
    const bumped = runAssessment(
      { ...BASE, learning_priorities: ['investments'] },
      DEFAULT_ASSUMPTIONS,
      NOW,
    ).blind_spots.find((f) => f.rule_id === 'fees_unknown');

    expect(base?.severity).toBe('medium');
    expect(bumped?.severity).toBe('high');
  });

  it('is deterministic and stamps fired_at from now', () => {
    const first = runAssessment(BASE, DEFAULT_ASSUMPTIONS, NOW);
    const second = runAssessment(BASE, DEFAULT_ASSUMPTIONS, NOW);

    expect(second).toEqual(first);
    expect(first.blind_spots.every((f) => f.fired_at === NOW.toISOString())).toBe(true);
  });
});
