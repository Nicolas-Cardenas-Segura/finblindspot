import { COUNTRY_CURRENCY } from '../config/countryCurrency.js';
import type { Answers, FieldId, Topic } from '../questionnaire/schema.js';
import type { Derived } from '../engine/derived.js';
import type { Results } from '../engine/projection.js';

export type RuleId =
  | 'thin_emergency_fund'
  | 'negative_surplus'
  | 'family_unprotected'
  | 'no_income_safety_net'
  | 'no_health_cover'
  | 'succession_gap'
  | 'education_unfunded'
  | 'pension_visibility'
  | 'pension_timing_gap'
  | 'scattered_pensions'
  | 'beneficiary_gap'
  | 'fees_unknown'
  | 'expensive_debt'
  | 'debt_into_retirement'
  | 'cash_concentration'
  | 'property_concentration'
  | 'currency_exposure'
  | 'single_point_of_failure'
  | 'retirement_gap'
  | 'lifestyle_reality_check';

export type Severity = 'low' | 'medium' | 'high';

export interface RuleContext {
  answers: Answers;
  derived: Derived;
  results: Results;
  now: Date;
}

export interface Rule {
  number: number;
  id: RuleId;
  topic: Topic;
  baseSeverity: Severity;
  /** Answer fields the rule reads (directly or via derived/results); it is only evaluated when all were asked. */
  inputs: FieldId[];
  fires(ctx: RuleContext): boolean;
}

const SPEND: FieldId[] = ['spend_housing', 'spend_living', 'spend_debt', 'spend_other'];

function positionAt(results: Results, rate: number): number | null {
  const entry = results.sensitivity.find((r) => r.withdrawal_rate === rate);
  return entry === undefined ? null : entry.position;
}

export const RULES: Rule[] = [
  {
    number: 1,
    id: 'thin_emergency_fund',
    inputs: ['cash_total', ...SPEND],
    topic: 'savings',
    baseSeverity: 'high',
    fires: ({ answers, derived }) =>
      answers.cash_total !== null &&
      derived.monthly_spending !== null &&
      answers.cash_total < 3 * derived.monthly_spending,
  },
  {
    number: 2,
    id: 'negative_surplus',
    inputs: ['income_monthly', ...SPEND],
    topic: 'savings',
    baseSeverity: 'high',
    fires: ({ derived }) => derived.monthly_surplus !== null && derived.monthly_surplus < 0,
  },
  {
    number: 3,
    id: 'family_unprotected',
    inputs: ['dependants', 'life_cover'],
    topic: 'protection',
    baseSeverity: 'high',
    fires: ({ answers }) => answers.dependants > 0 && answers.life_cover !== 'yes',
  },
  {
    number: 4,
    id: 'no_income_safety_net',
    inputs: ['illness_cover'],
    topic: 'protection',
    baseSeverity: 'medium',
    fires: ({ answers }) => answers.illness_cover !== 'yes',
  },
  {
    number: 5,
    id: 'no_health_cover',
    inputs: ['health_cover'],
    topic: 'protection',
    baseSeverity: 'high',
    fires: ({ answers }) => answers.health_cover !== 'yes',
  },
  {
    number: 6,
    id: 'succession_gap',
    inputs: ['will', 'will_country', 'will_year', 'residence_country'],
    topic: 'succession',
    baseSeverity: 'medium',
    fires: ({ answers, now }) =>
      answers.will === 'no' ||
      answers.will_country !== answers.residence_country ||
      (typeof answers.will_year === 'number' && now.getFullYear() - answers.will_year > 5),
  },
  {
    number: 7,
    id: 'education_unfunded',
    inputs: ['dependants', 'education_funded'],
    topic: 'education',
    baseSeverity: 'medium',
    fires: ({ answers }) => answers.dependants > 0 && answers.education_funded !== 'yes',
  },
  {
    number: 8,
    id: 'pension_visibility',
    inputs: ['pensions'],
    topic: 'retirement',
    baseSeverity: 'high',
    fires: ({ answers }) =>
      answers.pensions.length === 0 || answers.pensions.some((p) => p.pension_value === null),
  },
  {
    number: 9,
    id: 'pension_timing_gap',
    inputs: ['pensions', 'retire_age'],
    topic: 'retirement',
    baseSeverity: 'high',
    fires: ({ answers }) =>
      answers.pensions.some(
        (p) => typeof p.pension_start_age === 'number' && p.pension_start_age > answers.retire_age,
      ),
  },
  {
    number: 10,
    id: 'scattered_pensions',
    inputs: ['pensions'],
    topic: 'cross_border',
    baseSeverity: 'medium',
    fires: ({ answers }) => new Set(answers.pensions.map((p) => p.pension_country)).size > 1,
  },
  {
    number: 11,
    id: 'beneficiary_gap',
    inputs: ['beneficiaries_named'],
    topic: 'succession',
    baseSeverity: 'medium',
    fires: ({ answers }) => answers.beneficiaries_named !== 'yes',
  },
  {
    number: 12,
    id: 'fees_unknown',
    inputs: ['fees_known'],
    topic: 'investments',
    baseSeverity: 'medium',
    fires: ({ answers }) => answers.fees_known !== 'yes',
  },
  {
    number: 13,
    id: 'expensive_debt',
    inputs: ['debt_max_rate', 'debt_total'],
    topic: 'debt',
    baseSeverity: 'high',
    fires: ({ answers }) =>
      (answers.debt_max_rate === null || answers.debt_max_rate > 8) &&
      answers.debt_total !== null &&
      answers.debt_total > 0,
  },
  {
    number: 14,
    id: 'debt_into_retirement',
    inputs: ['debt_at_retirement'],
    topic: 'debt',
    baseSeverity: 'medium',
    fires: ({ answers }) => answers.debt_at_retirement === null || answers.debt_at_retirement > 0,
  },
  {
    number: 15,
    id: 'cash_concentration',
    inputs: ['cash_total', 'investments_total', 'pensions'],
    topic: 'investments',
    baseSeverity: 'low',
    fires: ({ answers, derived }) =>
      answers.cash_total !== null &&
      derived.financial_assets !== null &&
      derived.financial_assets > 0 &&
      answers.cash_total / derived.financial_assets > 0.3,
  },
  {
    number: 16,
    id: 'property_concentration',
    inputs: ['home_value', 'home_mortgage', 'property_value', 'property_mortgage', 'cash_total', 'investments_total', 'pensions', 'debt_total'],
    topic: 'property',
    baseSeverity: 'low',
    fires: ({ derived }) =>
      derived.property_net !== null &&
      derived.net_worth !== null &&
      derived.net_worth > 0 &&
      derived.property_net / derived.net_worth > 0.6,
  },
  {
    number: 17,
    id: 'currency_exposure',
    inputs: ['cash_currency_mismatch', 'retire_country', 'base_currency'],
    topic: 'cross_border',
    baseSeverity: 'medium',
    fires: ({ answers }) => {
      if (answers.cash_currency_mismatch === 'yes') return true;
      if (answers.retire_country === null) return false;
      const currency = COUNTRY_CURRENCY[answers.retire_country];
      return currency !== undefined && currency !== answers.base_currency;
    },
  },
  {
    number: 18,
    id: 'single_point_of_failure',
    inputs: ['has_partner', 'decision_maker', 'partner_knows'],
    topic: 'succession',
    baseSeverity: 'medium',
    fires: ({ answers }) =>
      answers.has_partner === 'household' &&
      answers.decision_maker === 'me' &&
      answers.partner_knows !== 'yes',
  },
  {
    number: 19,
    id: 'retirement_gap',
    inputs: ['age', 'retire_age', 'retire_income_monthly'],
    topic: 'retirement',
    baseSeverity: 'high',
    fires: ({ results }) => {
      const position = positionAt(results, 0.04);
      return (position !== null && position < 0) || results.is_minimum_estimate;
    },
  },
  {
    number: 20,
    id: 'lifestyle_reality_check',
    inputs: ['retire_income_monthly', ...SPEND],
    topic: 'retirement',
    baseSeverity: 'low',
    fires: ({ answers, derived }) =>
      answers.retire_income_monthly !== null &&
      derived.monthly_spending !== null &&
      answers.retire_income_monthly < 0.6 * derived.monthly_spending,
  },
];
