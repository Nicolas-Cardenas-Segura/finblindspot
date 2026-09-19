import { describe, it, expect } from 'vitest';
import { loadContent, fillPlaceholders } from '../../src/explain/content.js';
import { RULES } from '../../src/rules/rules.js';
import { computeDerived } from '../../src/engine/derived.js';
import { computeProjection } from '../../src/engine/projection.js';
import { DEFAULT_ASSUMPTIONS } from '../../src/config/assumptions.js';
import { CASES } from '../fixtures/cases.js';

const FORBIDDEN = ['transfer', 'consolidate', 'buy', 'switch'];
const FIELDS = ['title', 'headline', 'why', 'learn', 'ask', 'severity', 'topic'];

describe('blind spot content library', () => {
  const content = loadContent();

  it('has one entry per rule, keyed by rule id', () => {
    expect(Object.keys(content)).toHaveLength(20);
    for (const rule of RULES) {
      expect(content[rule.id]).toBeDefined();
    }
  });

  it('matches severity and topic from RULES', () => {
    for (const rule of RULES) {
      expect(content[rule.id].severity).toBe(rule.baseSeverity);
      expect(content[rule.id].topic).toBe(rule.topic);
    }
  });

  it('has two or three learn items per entry', () => {
    for (const rule of RULES) {
      expect(content[rule.id].learn.length).toBeGreaterThanOrEqual(2);
      expect(content[rule.id].learn.length).toBeLessThanOrEqual(3);
    }
  });

  it('never recommends a product or a transaction', () => {
    for (const rule of RULES) {
      const entry = content[rule.id];
      for (const text of [...entry.learn, entry.ask]) {
        for (const word of FORBIDDEN) {
          expect(text.toLowerCase()).not.toContain(word);
        }
      }
    }
  });

  it('has exactly the seven fields per entry', () => {
    for (const rule of RULES) {
      expect(Object.keys(content[rule.id]).sort()).toEqual([...FIELDS].sort());
    }
  });
});

describe('fillPlaceholders', () => {
  it('fills retire age and the first excluded pension start age', () => {
    const answers = CASES.D.answers;
    const derived = computeDerived(answers);
    const results = computeProjection(answers, DEFAULT_ASSUMPTIONS, derived);
    const headline = loadContent().pension_timing_gap.headline;
    expect(fillPlaceholders(headline, answers, results)).toBe(
      'You plan to retire at 65, and one of your pensions does not begin until 67.',
    );
  });
});
