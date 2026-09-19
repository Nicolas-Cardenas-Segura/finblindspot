import { expect, it } from 'vitest';
import { emptyProfile } from '../src/core/profile';
import { createReport } from '../src/core/report';
import { compareReports } from '../src/core/comparison';

const make = (cash: number, currency = 'EUR') => createReport({ ...emptyProfile(), residency: { status: 'known', value: { country: 'ES', currency } }, cash: { status: 'known', value: { min: cash, max: cash, currency, period: 'balance' } }, expenses: { status: 'known', value: { min: 1000, max: 1000, currency, period: 'monthly' } } }, '2026-09-19T12:00:00.000Z');
it('compares exact compatible values without mutating baseline', () => {
  const before = make(2000);
  const comparison = compareReports(before, make(5000));
  expect(comparison.find(c => c.id === 'runway')?.delta).toBe(3);
  expect(before.cards[0].range?.min).toBe(2);
});
it('does not compare changed currencies or rules versions', () => {
  expect(compareReports(make(2000), make(5000, 'USD')).every(c => c.delta === null)).toBe(true);
  expect(compareReports(make(2000), { ...make(5000), rulesVersion: 'other' }).every(c => c.delta === null)).toBe(true);
});
