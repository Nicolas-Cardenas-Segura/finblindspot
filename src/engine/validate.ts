import type { Assumptions, Answers, FieldId } from '../questionnaire/schema.js';

export type ValidationError = {
  field: FieldId;
  reason: 'retire_age_not_after_age' | 'rate_not_positive' | 'negative_money' | 'pension_start_age_out_of_range';
};

const assumptionFields: (keyof Assumptions)[] = [
  'inflation_rate',
  'investment_growth_rate',
  'cash_growth_rate',
  'property_growth_rate',
  'withdrawal_rate',
];

const moneyFields: (keyof Answers)[] = [
  'income_monthly',
  'spend_housing',
  'spend_living',
  'spend_debt',
  'spend_other',
  'saving_monthly_other',
  'cash_total',
  'investments_total',
  'home_value',
  'home_mortgage',
  'property_value',
  'property_mortgage',
  'debt_total',
  'debt_at_retirement',
  'life_cover_amount',
  'retire_income_monthly',
];

export function validateAnswers(a: Answers, s: Assumptions): ValidationError[] {
  const errors: ValidationError[] = [];

  if (a.retire_age <= a.age) {
    errors.push({ field: 'retire_age', reason: 'retire_age_not_after_age' });
  }

  for (const field of assumptionFields) {
    if (s[field] <= 0) {
      errors.push({ field, reason: 'rate_not_positive' });
    }
  }

  for (const field of moneyFields) {
    const value = a[field];
    if (typeof value === 'number' && value < 0) {
      errors.push({ field, reason: 'negative_money' });
    }
  }

  for (const pension of a.pensions) {
    for (const field of ['pension_value', 'pension_fixed_income_monthly', 'pension_contribution_monthly'] as const) {
      const value = pension[field];
      if (typeof value === 'number' && value < 0) {
        errors.push({ field, reason: 'negative_money' });
      }
    }

    if (
      typeof pension.pension_start_age === 'number' &&
      (pension.pension_start_age < a.age || pension.pension_start_age > 90)
    ) {
      errors.push({ field: 'pension_start_age', reason: 'pension_start_age_out_of_range' });
    }
  }

  return errors;
}
