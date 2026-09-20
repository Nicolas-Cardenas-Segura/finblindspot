import type { Answers, PensionRow } from '../../src/questionnaire/schema.js';

const STATE_PENSION: PensionRow = {
  pension_country: 'DE',
  pension_type: 'state',
  pension_value: 'n/a',
  pension_fixed_income_monthly: 600,
  pension_start_age: 65,
  pension_contribution_monthly: 0,
  pension_contributions_continue: 'no',
};

const WORKPLACE_PENSION: PensionRow = {
  pension_country: 'DE',
  pension_type: 'workplace_dc',
  pension_value: 120000,
  pension_fixed_income_monthly: 'n/a',
  pension_start_age: 65,
  pension_contribution_monthly: 500,
  pension_contributions_continue: 'yes',
};

export const BASE: Answers = {
  consent: 'yes',
  age: 40,
  has_partner: 'just_me',
  residence_country: 'DE',
  stay_abroad: 'n/a',
  dependants: 0,
  education_funded: 'n/a',
  decision_maker: 'n/a',
  partner_knows: 'n/a',
  base_currency: 'EUR',
  income_monthly: 4000,
  spend_housing: 1200,
  spend_living: 1200,
  spend_debt: 0,
  spend_other: 600,
  saving_monthly_other: 0,
  cash_total: 30000,
  cash_currency_mismatch: 'no',
  money_countries: ['DE'],
  investments_total: 50000,
  fees_known: 'no',
  home_value: 0,
  home_mortgage: 0,
  property_value: 0,
  property_mortgage: 0,
  property_for_retirement: 'no',
  debt_total: 0,
  debt_max_rate: 0,
  debt_at_retirement: 0,
  pensions: [STATE_PENSION, WORKPLACE_PENSION],
  beneficiaries_named: 'yes',
  life_cover: 'yes',
  life_cover_amount: 200000,
  illness_cover: 'yes',
  health_cover: 'yes',
  will: 'yes',
  will_country: 'DE',
  will_year: new Date().getFullYear(),
  retire_age: 65,
  retire_country: 'DE',
  retire_income_monthly: 2000,
  learning_priorities: [],
};

export const CASES: Record<
  'A' | 'B' | 'C' | 'D',
  {
    answers: Answers;
    expected: {
      required_pot: number;
      projected_assets: number;
      position: number;
      position_today?: number;
      extra_monthly?: number;
      at3?: number;
      at5?: number;
      rule9: boolean;
    };
  }
> = {
  A: {
    answers: BASE,
    expected: {
      required_pot: 879387,
      projected_assets: 907888,
      position: 28501,
      position_today: 13612,
      at3: -264628,
      at5: 204379,
      rule9: false,
    },
  },
  B: {
    answers: {
      ...BASE,
      saving_monthly_other: 200,
      property_value: 200000,
      property_mortgage: 120000,
      property_for_retirement: 'yes',
      debt_at_retirement: 15000,
    },
    expected: {
      required_pot: 879387,
      projected_assets: 1179492,
      position: 300105,
      rule9: false,
    },
  },
  C: {
    answers: { ...BASE, retire_income_monthly: 3000 },
    expected: {
      required_pot: 1507520,
      projected_assets: 907888,
      position: -599632,
      position_today: -286388,
      extra_monthly: 1007,
      rule9: false,
    },
  },
  D: {
    answers: {
      ...BASE,
      pensions: [{ ...STATE_PENSION, pension_start_age: 67 }, WORKPLACE_PENSION],
    },
    expected: {
      required_pot: 1256267,
      projected_assets: 907888,
      position: -348379,
      position_today: -166388,
      extra_monthly: 585,
      rule9: true,
    },
  },
};
