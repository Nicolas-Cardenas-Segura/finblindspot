import { describe, expect, it } from 'vitest';
import { FIELDS, PENSION_FIELDS, type Section } from '../../src/questionnaire/fields.js';
import { AnswersSchema, type Answers, type FieldId } from '../../src/questionnaire/schema.js';
import { z } from 'zod';

const answerFieldIds = Object.keys(
  (AnswersSchema as unknown as z.ZodObject<Record<keyof Answers, z.ZodType<unknown>>>).shape,
) as FieldId[];

describe('FIELDS', () => {
  it('lists sections in order A..H', () => {
    const order: Section[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const seen: Section[] = [];
    for (const field of FIELDS) {
      if (seen[seen.length - 1] !== field.section) seen.push(field.section);
    }
    expect(seen).toEqual(order);
  });

  it('covers every Answers field except pensions exactly once', () => {
    const expected = answerFieldIds.filter((id) => id !== 'pensions');
    for (const id of expected) {
      expect(FIELDS.filter((f) => f.id === id)).toHaveLength(1);
    }
  });

  it('offers "I don\'t know" on every money field', () => {
    for (const field of [...FIELDS, ...PENSION_FIELDS]) {
      if (field.type === 'money') expect(field.allowUnknown).toBe(true);
    }
  });

  it('gives every field a rationale', () => {
    for (const field of [...FIELDS, ...PENSION_FIELDS]) {
      expect(field.rationale.length).toBeGreaterThan(0);
    }
  });

  it('asks for the base currency first in section B', () => {
    expect(FIELDS.find((f) => f.section === 'B')?.id).toBe('base_currency');
  });

  it('uses the v1 wording for retire_age', () => {
    expect(FIELDS.find((f) => f.id === 'retire_age')?.prompt).toBe(
      'At what age would you like to retire?',
    );
  });
});

describe('PENSION_FIELDS', () => {
  it('holds the seven repeated section D row fields', () => {
    expect(PENSION_FIELDS.map((f) => f.id)).toEqual([
      'pension_country',
      'pension_type',
      'pension_value',
      'pension_fixed_income_monthly',
      'pension_start_age',
      'pension_contribution_monthly',
      'pension_contributions_continue',
    ]);
    for (const field of PENSION_FIELDS) {
      expect(field.section).toBe('D');
      expect(field.repeat).toBe('pensions');
    }
  });
});
