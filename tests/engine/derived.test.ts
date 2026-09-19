import { describe, it, expect } from 'vitest';
import { computeDerived } from '../../src/engine/derived.js';
import { BASE } from '../fixtures/cases.js';

describe('computeDerived', () => {
  it('computes spending, surplus and assets from the base case', () => {
    const d = computeDerived(BASE);
    expect(d.monthly_spending).toBe(3000);
    expect(d.monthly_surplus).toBe(1000);
    expect(d.financial_assets).toBe(200000);
    expect(d.property_net).toBe(0);
  });

  it('returns null spending and surplus when a spending component is unknown', () => {
    const d = computeDerived({ ...BASE, spend_other: null });
    expect(d.monthly_spending).toBeNull();
    expect(d.monthly_surplus).toBeNull();
  });

  it('treats zero debt as a real value', () => {
    const d = computeDerived({ ...BASE, debt_total: 0, property_value: 200000, property_mortgage: 120000 });
    expect(d.property_net).toBe(80000);
    expect(d.net_worth).toBe((d.financial_assets as number) + (d.property_net as number));
  });

  it('returns null net worth when debt is unknown', () => {
    const d = computeDerived({ ...BASE, debt_total: null });
    expect(d.net_worth).toBeNull();
  });
});
