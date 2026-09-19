import { describe, expect, it } from 'vitest';
import { emptyProfile, moneySchema, profileSchema, answerSchemas } from '../src/core/profile';

const value = { min: 100, max: 200, currency: 'EUR', period: 'monthly' };

describe('profile validation', () => {
  it('starts unknown, not implicitly zero', () => {
    expect(profileSchema.parse(emptyProfile()).income).toEqual({ status: 'unknown' });
  });
  it('preserves a bounded range and currency', () => {
    expect(moneySchema.parse(value)).toEqual(value);
  });
  it.each([
    { ...value, min: -1 }, { ...value, max: 99 }, { ...value, max: Infinity },
    { ...value, currency: 'euro' }, { ...value, period: 'weekly' },
  ])('rejects invalid money: %j', input => {
    expect(moneySchema.safeParse(input).success).toBe(false);
  });
  it('rejects owner and arbitrary fields from model answers', () => {
    expect(answerSchemas.income.safeParse({ status: 'known', value, owner: 'other' }).success).toBe(false);
  });
  it('distinguishes zero, skipped and not applicable', () => {
    const zero = { status: 'known', value: { ...value, min: 0, max: 0 } };
    expect(answerSchemas.income.parse(zero)).toEqual(zero);
    expect(answerSchemas.income.parse({ status: 'skipped' })).toEqual({ status: 'skipped' });
    expect(answerSchemas.income.parse({ status: 'not_applicable' })).toEqual({ status: 'not_applicable' });
  });
});
