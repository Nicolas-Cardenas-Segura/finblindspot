import { describe, expect, it } from 'vitest';
import {
  AnswersSchema,
  AssumptionsSchema,
  type Answers,
  type Assumptions,
} from '../../src/questionnaire/schema.js';

const validAnswers: Answers = {
  consent: 'yes',
  age: 38,
  has_partner: 'household',
  residence_country: 'ES',
  stay_abroad: 'unsure',
  dependants: 2,
  education_funded: 'dont_know',
  decision_maker: 'joint',
  partner_knows: 'yes',
  base_currency: 'EUR',
  income_monthly: 5200,
  spend_housing: 1400,
  spend_living: 1800,
  spend_debt: 300,
  spend_other: 400,
  saving_monthly_other: 200,
  cash_total: 30000,
  cash_currency_mismatch: 'no',
  money_countries: ['ES', 'GB'],
  investments_total: 45000,
  fees_known: 'not_sure',
  home_value: 320000,
  home_mortgage: 180000,
  property_value: 0,
  property_mortgage: 0,
  property_for_retirement: 'no',
  debt_total: 5000,
  debt_max_rate: 8.5,
  debt_at_retirement: 0,
  pensions: [
    {
      pension_country: 'ES',
      pension_type: 'state',
      pension_value: null,
      pension_fixed_income_monthly: 'n/a',
      pension_start_age: 67,
      pension_contribution_monthly: 0,
      pension_contributions_continue: 'yes',
    },
  ],
  beneficiaries_named: 'dont_know',
  life_cover: 'yes',
  life_cover_amount: 150000,
  illness_cover: 'no',
  health_cover: 'yes',
  will: 'yes',
  will_country: 'ES',
  will_year: 2020,
  retire_age: 65,
  retire_country: 'ES',
  retire_income_monthly: 2500,
  learning_priorities: ['retirement', 'education'],
};

const validAssumptions: Assumptions = {
  inflation_rate: 0.03,
  investment_growth_rate: 0.05,
  cash_growth_rate: 0.02,
  property_growth_rate: 0.03,
  withdrawal_rate: 0.04,
};

describe('AnswersSchema', () => {
  it('parses a full valid Answers object', () => {
    expect(AnswersSchema.safeParse(validAnswers).success).toBe(true);
  });

  it('rejects age below 18', () => {
    expect(AnswersSchema.safeParse({ ...validAnswers, age: 12 }).success).toBe(false);
  });

  it('accepts cash_total: null (unknown)', () => {
    expect(AnswersSchema.safeParse({ ...validAnswers, cash_total: null }).success).toBe(true);
  });

  it('rejects negative cash_total', () => {
    expect(AnswersSchema.safeParse({ ...validAnswers, cash_total: -1 }).success).toBe(false);
  });

  it("accepts education_funded: 'n/a'", () => {
    expect(AnswersSchema.safeParse({ ...validAnswers, education_funded: 'n/a' }).success).toBe(true);
  });

  it('rejects unsupported base_currency', () => {
    expect(AnswersSchema.safeParse({ ...validAnswers, base_currency: 'CHF' }).success).toBe(false);
  });
});

describe('AssumptionsSchema', () => {
  it('parses valid assumptions', () => {
    expect(AssumptionsSchema.safeParse(validAssumptions).success).toBe(true);
  });

  it('rejects investment_growth_rate: 0', () => {
    expect(
      AssumptionsSchema.safeParse({ ...validAssumptions, investment_growth_rate: 0 }).success,
    ).toBe(false);
  });
});
