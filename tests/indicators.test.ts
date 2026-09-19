import { describe, expect, it } from 'vitest';
import { emptyProfile, type FinancialProfile, type MoneyAnswer } from '../src/core/profile';
import { calculateIndicators } from '../src/core/indicators';

const money = (min: number, max = min, currency = 'EUR', period = 'monthly'): MoneyAnswer =>
  ({ status: 'known', value: { min, max, currency, period: period as 'monthly' } });
const profile = (): FinancialProfile => ({ ...emptyProfile(), residency: { status: 'known', value: { country: 'ES', currency: 'EUR' } }, cash: money(5400, 5400, 'EUR', 'balance'), expenses: money(2000), income: money(4000), debt: money(800) });
const indicator = (p: FinancialProfile, id: string) => calculateIndicators(p).find(i => i.id === id)!;

describe('financial indicators', () => {
  it('calculates runway without rounding inputs', () => {
    expect(indicator(profile(), 'runway').range).toEqual({ min: 2.7, max: 2.7 });
  });
  it('never emits non-finite calculated values', () => {
    expect(indicator({ ...profile(), expenses: money(1e-310) }, 'runway').range).toBeNull();
  });
  it('normalises annual cash flows in code', () => {
    expect(indicator({ ...profile(), income: money(48000, 48000, 'EUR', 'annual') }, 'debt').range).toEqual({ min: 0.2, max: 0.2 });
  });
  it('preserves conservative interval bounds', () => {
    const p = { ...profile(), cash: money(5000, 6000, 'EUR', 'balance'), expenses: money(1000, 2000) };
    expect(indicator(p, 'runway').range).toEqual({ min: 2.5, max: 6 });
  });
  it.each([0, null])('does not divide by zero or unknown expenditure: %s', value => {
    const p = { ...profile(), expenses: value === null ? { status: 'unknown' as const } : money(value) };
    expect(indicator(p, 'runway').range).toBeNull();
  });
  it('does not divide by zero income even with no debt', () => {
    expect(indicator({ ...profile(), income: money(0), debt: money(0) }, 'debt').range).toBeNull();
  });
  it('rejects mixed currencies, wrong stock periods and missing base currency', () => {
    expect(indicator({ ...profile(), cash: money(1000, 1000, 'USD', 'balance') }, 'runway').range).toBeNull();
    expect(indicator({ ...profile(), cash: money(1000) }, 'runway').range).toBeNull();
    expect(indicator({ ...profile(), residency: { status: 'unknown' } }, 'runway').range).toBeNull();
  });
  it('keeps pension, concentration and complexity unassessed on the quick path', () => {
    for (const id of ['retirement', 'concentration', 'crossBorder']) expect(indicator(profile(), id).range).toBeNull();
  });
  it('counts missing pension fields without claiming adequacy', () => {
    const p: FinancialProfile = { ...profile(), pensions: { status: 'known', value: { complete: true, pots: [{ country: 'GB', balance: { status: 'unknown' }, contribution: { status: 'unknown' }, statusKnown: false }] } }, retirementAge: { status: 'known', value: 65 } };
    expect(indicator(p, 'retirement').range).toEqual({ min: 3, max: 3 });
  });
  it('marks no declared pensions as not applicable, not adequate', () => {
    const p: FinancialProfile = { ...profile(), pensions: { status: 'known', value: { complete: true, pots: [] } } };
    expect(indicator(p, 'retirement').reason).toBe('no_pensions');
  });
  it('counts cross-border jurisdictions, currencies and unverified foreign pensions', () => {
    const p: FinancialProfile = { ...profile(), previousCountries: { status: 'known', value: ['GB', 'GB'] }, property: money(0, 0, 'EUR', 'balance'), pensions: { status: 'known', value: { complete: true, pots: [{ country: 'GB', balance: money(1000, 1000, 'GBP', 'balance'), contribution: money(0, 0, 'GBP'), statusKnown: false }] } }, investments: { status: 'known', value: { complete: true, assets: [] } } };
    expect(indicator(p, 'crossBorder').range).toEqual({ min: 3, max: 3 });
  });
  it('does not invent asset concentration when no assets are reported', () => {
    const p: FinancialProfile = { ...profile(), cash: money(0, 0, 'EUR', 'balance'), property: money(0, 0, 'EUR', 'balance'), pensions: { status: 'known', value: { complete: true, pots: [] } }, investments: { status: 'known', value: { complete: true, assets: [] } } };
    expect(indicator(p, 'concentration').range).toBeNull();
  });
  it('aggregates the same asset class before measuring concentration', () => {
    const p: FinancialProfile = { ...profile(), cash: money(0, 0, 'EUR', 'balance'), property: money(0, 0, 'EUR', 'balance'), pensions: { status: 'known', value: { complete: true, pots: [] } }, investments: { status: 'known', value: { complete: true, assets: [{ category: 'equities', country: 'ES', amount: money(30, 30, 'EUR', 'balance') }, { category: 'equities', country: 'ES', amount: money(30, 30, 'EUR', 'balance') }, { category: 'bonds', country: 'ES', amount: money(40, 40, 'EUR', 'balance') }] } } };
    expect(indicator(p, 'concentration').range).toEqual({ min: 0.6, max: 0.6 });
  });
});
