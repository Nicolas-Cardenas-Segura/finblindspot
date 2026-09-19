import type { Answers, Assumptions, FieldId } from '../questionnaire/schema.js';
import type { Derived } from './derived.js';

export interface RateResult {
  withdrawal_rate: number;
  required_pot: number;
  position: number;
  position_today: number;
}

export interface Results {
  mode: 'projection' | 'no_target' | 'already_retired' | 'no_gap';
  years: number | null;
  required_pot: number | null;
  projected_assets: number | null;
  position: number | null;
  position_today: number | null;
  extra_monthly: number | null;
  sensitivity: RateResult[];
  is_minimum_estimate: boolean;
  missing_fields: FieldId[];
  excluded_pensions: number[];
}

function emptyResults(mode: Results['mode'], years: number | null): Results {
  return {
    mode,
    years,
    required_pot: null,
    projected_assets: null,
    position: null,
    position_today: null,
    extra_monthly: null,
    sensitivity: [],
    is_minimum_estimate: false,
    missing_fields: [],
    excluded_pensions: [],
  };
}

export function computeProjection(a: Answers, s: Assumptions, d: Derived): Results {
  const years = a.retire_age - a.age;

  if (a.retire_age <= a.age) return emptyResults('already_retired', null);

  const missing_fields: FieldId[] = [];
  const excluded_pensions: number[] = [];
  const miss = (id: FieldId): void => {
    if (!missing_fields.includes(id)) missing_fields.push(id);
  };

  a.pensions.forEach((p, i) => {
    if (p.pension_start_age === null || p.pension_start_age > a.retire_age) excluded_pensions.push(i);
  });

  if (a.retire_income_monthly === null) {
    const r = emptyResults('no_target', years);
    r.missing_fields = ['retire_income_monthly'];
    r.is_minimum_estimate = true;
    r.excluded_pensions = excluded_pensions;
    return r;
  }

  const months = years * 12;
  const mr = s.investment_growth_rate / 12;
  const annuity_factor = ((1 + mr) ** months - 1) / mr;
  const inflation_factor = (1 + s.inflation_rate) ** years;

  const target_income_today = a.retire_income_monthly * 12;

  let guaranteed_monthly = 0;
  a.pensions.forEach((p, i) => {
    if (excluded_pensions.includes(i)) return;
    if (p.pension_fixed_income_monthly === null) {
      miss('pension_fixed_income_monthly');
      return;
    }
    if (p.pension_fixed_income_monthly === 'n/a') return;
    guaranteed_monthly += p.pension_fixed_income_monthly;
  });
  const guaranteed_income_today = 12 * guaranteed_monthly;

  const income_needed_today = Math.max(target_income_today - guaranteed_income_today, 0);
  const future_income_needed = income_needed_today * inflation_factor;
  const required_pot = future_income_needed / s.withdrawal_rate;

  let pension_value_total = 0;
  let pension_contributions_monthly = 0;
  a.pensions.forEach((p, i) => {
    if (!excluded_pensions.includes(i)) {
      if (p.pension_value === null) miss('pension_value');
      else if (p.pension_value !== 'n/a') pension_value_total += p.pension_value;
    }
    if (p.pension_contributions_continue === 'yes') pension_contributions_monthly += p.pension_contribution_monthly;
  });

  let projected_assets = pension_value_total * (1 + s.investment_growth_rate) ** years;

  if (a.investments_total === null) miss('investments_total');
  else projected_assets += a.investments_total * (1 + s.investment_growth_rate) ** years;

  if (a.cash_total === null) miss('cash_total');
  else if (d.monthly_spending === null) {
    for (const id of ['spend_housing', 'spend_living', 'spend_debt', 'spend_other'] as const) {
      if (a[id] === null) miss(id);
    }
  } else {
    projected_assets += Math.max(a.cash_total - 3 * d.monthly_spending, 0) * (1 + s.cash_growth_rate) ** years;
  }

  if (a.property_for_retirement === 'yes') {
    if (a.property_value === null) miss('property_value');
    if (a.property_mortgage === null) miss('property_mortgage');
    if (a.property_value !== null && a.property_mortgage !== null) {
      projected_assets += (a.property_value - a.property_mortgage) * (1 + s.property_growth_rate) ** years;
    }
  }

  projected_assets += pension_contributions_monthly * annuity_factor;

  if (a.saving_monthly_other === null) miss('saving_monthly_other');
  else projected_assets += a.saving_monthly_other * annuity_factor;

  if (a.debt_at_retirement === null) miss('debt_at_retirement');
  else projected_assets -= a.debt_at_retirement;

  const position = projected_assets - required_pot;
  const position_today = position / inflation_factor;
  const extra_monthly = position < 0 ? (-position * mr) / ((1 + mr) ** months - 1) : null;

  const sensitivity: RateResult[] = [0.03, s.withdrawal_rate, 0.05].map((rate) => {
    const pot = future_income_needed / rate;
    const pos = projected_assets - pot;
    return { withdrawal_rate: rate, required_pot: pot, position: pos, position_today: pos / inflation_factor };
  });

  return {
    mode: income_needed_today === 0 ? 'no_gap' : 'projection',
    years,
    required_pot,
    projected_assets,
    position,
    position_today,
    extra_monthly,
    sensitivity,
    is_minimum_estimate: missing_fields.length > 0,
    missing_fields,
    excluded_pensions,
  };
}
