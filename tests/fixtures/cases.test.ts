import { describe, it, expect } from 'vitest';
import { AnswersSchema } from '../../src/questionnaire/schema.js';
import { BASE, CASES } from './cases.js';

describe('fixtures', () => {
  it('BASE satisfies AnswersSchema', () => {
    expect(AnswersSchema.safeParse(BASE).success).toBe(true);
  });

  for (const key of ['A', 'B', 'C', 'D'] as const) {
    it(`case ${key} answers satisfy AnswersSchema`, () => {
      const result = AnswersSchema.safeParse(CASES[key].answers);
      expect(result.success).toBe(true);
    });
  }

  it('spend fields sum to 3000', () => {
    const total =
      (BASE.spend_housing ?? 0) + (BASE.spend_living ?? 0) + (BASE.spend_debt ?? 0) + (BASE.spend_other ?? 0);
    expect(total).toBe(3000);
  });
});
