import type { Answers } from '../questionnaire/schema.js';

export interface Derived {
  monthly_spending: number | null;
  monthly_surplus: number | null;
  net_worth: number | null;
  financial_assets: number | null;
  property_net: number | null;
}

function sum(values: Array<number | null>): number | null {
  let total = 0;
  for (const v of values) {
    if (v === null) return null;
    total += v;
  }
  return total;
}

export function computeDerived(a: Answers): Derived {
  const monthly_spending = sum([a.spend_housing, a.spend_living, a.spend_debt, a.spend_other]);
  const monthly_surplus =
    a.income_monthly === null || monthly_spending === null ? null : a.income_monthly - monthly_spending;

  const pension_values = a.pensions.reduce(
    (acc, p) => (typeof p.pension_value === 'number' ? acc + p.pension_value : acc),
    0,
  );
  const financial_assets = sum([a.cash_total, a.investments_total, pension_values]);

  const home_net = sum([a.home_value, a.home_mortgage === null ? null : -a.home_mortgage]);
  const other_net = sum([a.property_value, a.property_mortgage === null ? null : -a.property_mortgage]);
  const property_net = sum([home_net, other_net]);

  const net_worth = sum([financial_assets, property_net, a.debt_total === null ? null : -a.debt_total]);

  return { monthly_spending, monthly_surplus, net_worth, financial_assets, property_net };
}
