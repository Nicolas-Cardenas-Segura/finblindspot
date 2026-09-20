import { describe, expect, it } from 'vitest';
import { COUNTRY_CURRENCY } from '../../src/config/countryCurrency.js';

describe('COUNTRY_CURRENCY', () => {
  it('maps required countries to their currencies', () => {
    expect(COUNTRY_CURRENCY.DE).toBe('EUR');
    expect(COUNTRY_CURRENCY.GB).toBe('GBP');
    expect(COUNTRY_CURRENCY.US).toBe('USD');
    expect(COUNTRY_CURRENCY.CH).toBe('CHF');
  });

  it('contains only three-letter uppercase currency codes', () => {
    expect(Object.values(COUNTRY_CURRENCY).every((currency) => /^[A-Z]{3}$/.test(currency))).toBe(true);
  });
});
