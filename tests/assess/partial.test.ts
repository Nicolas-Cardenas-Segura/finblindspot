import { describe, it, expect } from 'vitest';
import { DEFAULT_ASSUMPTIONS } from '../../src/config/assumptions.js';
import { ASKED_ORDER, runAssessment, runPartialAssessment, unansweredFields } from '../../src/assess/assess.js';
import { FIELDS } from '../../src/questionnaire/fields.js';
import type { Answers } from '../../src/questionnaire/schema.js';
import { RULES } from '../../src/rules/rules.js';
import { BASE } from '../fixtures/cases.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');

function upTo(fieldId: keyof Answers): Partial<Answers> {
  const partial: Record<string, unknown> = {};
  for (const f of FIELDS) {
    if (f.id === fieldId) break;
    if (f.id in BASE) partial[f.id] = (BASE as unknown as Record<string, unknown>)[f.id];
  }
  return partial as Partial<Answers>;
}

describe('runPartialAssessment', () => {
  it('equals runAssessment when every field is answered', () => {
    const full = runAssessment(BASE, DEFAULT_ASSUMPTIONS, NOW);
    const partial = runPartialAssessment(BASE, DEFAULT_ASSUMPTIONS, NOW);
    expect(partial.blind_spots).toEqual(full.blind_spots);
    expect(partial.results).toEqual(full.results);
    expect(partial.unanswered).toEqual([]);
    expect(partial.not_assessed).toEqual([]);
  });

  it('every rule declares inputs that exist in the questionnaire', () => {
    const ids = new Set<string>(ASKED_ORDER);
    for (const rule of RULES) {
      expect(rule.inputs.length).toBeGreaterThan(0);
      for (const id of rule.inputs) expect(ids.has(id), `${rule.id} reads ${id}`).toBe(true);
    }
  });

  it('stopping after section B keeps the emergency fund unassessed and lists what was not covered', () => {
    const partial = upTo('cash_total');
    const r = runPartialAssessment(partial, DEFAULT_ASSUMPTIONS, NOW);

    expect(r.results.mode).toBe('not_assessed');
    expect(r.unanswered).toContain('cash_total');
    expect(r.unanswered).toContain('retire_age');
    expect(r.unanswered).not.toContain('age');
    expect(r.unanswered).not.toContain('consent');
    expect(r.not_assessed).toContain('thin_emergency_fund');
    expect(r.not_assessed).toContain('retirement_gap');
    expect(r.not_assessed).not.toContain('negative_surplus');
    expect(r.not_assessed).toContain('family_unprotected');
    expect(r.unanswered).toContain('pensions');
    expect(r.blind_spots.map((b) => b.rule_id)).not.toContain('thin_emergency_fund');
    expect(r.answers.cash_total).toBeNull();
    expect(r.answers.pensions).toEqual([]);
  });

  it('does not treat an unanswered retirement debt as a fired blind spot', () => {
    const partial = { ...BASE } as Partial<Answers>;
    delete partial.debt_at_retirement;
    const r = runPartialAssessment(partial, DEFAULT_ASSUMPTIONS, NOW);
    expect(r.not_assessed).toEqual(['debt_into_retirement']);
    expect(r.blind_spots.map((b) => b.rule_id)).not.toContain('debt_into_retirement');
    expect(r.unanswered).toEqual(['debt_at_retirement']);
  });

  it('treats a skipped pensions placeholder as unanswered', () => {
    const partial = { ...BASE, pensions: [] } as Partial<Answers>;
    const r = runPartialAssessment(partial, DEFAULT_ASSUMPTIONS, NOW, ['pensions']);
    expect(r.unanswered).toEqual(['pensions']);
    expect(r.not_assessed).toContain('pension_visibility');
    expect(r.not_assessed).toContain('scattered_pensions');
    expect(r.results.is_minimum_estimate).toBe(true);
    expect(r.results.missing_fields).toContain('pensions');
  });

  it('is deterministic for the same partial answers', () => {
    const partial = upTo('retire_country');
    const a = runPartialAssessment(partial, DEFAULT_ASSUMPTIONS, NOW);
    const b = runPartialAssessment(partial, DEFAULT_ASSUMPTIONS, NOW);
    expect(a).toEqual(b);
    expect(unansweredFields(partial)).toEqual(a.unanswered);
  });
});
