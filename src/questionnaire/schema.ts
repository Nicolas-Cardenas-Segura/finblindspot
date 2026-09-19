import { z } from 'zod';

export type Currency = 'EUR' | 'GBP' | 'USD';
export type YesNoDk = 'yes' | 'no' | 'dont_know';
export type Unknown = null; // "I don't know"
export type NotApplicable = 'n/a'; // conditional field skipped
export type Topic =
  | 'protection'
  | 'succession'
  | 'education'
  | 'savings'
  | 'retirement'
  | 'investments'
  | 'cross_border'
  | 'property'
  | 'debt'
  | 'fees';

export interface PensionRow {
  pension_country: string; // ISO-3166 alpha-2
  pension_type: 'state' | 'workplace_dc' | 'personal' | 'defined_benefit' | 'annuity' | 'other';
  pension_value: number | Unknown | NotApplicable;
  pension_fixed_income_monthly: number | Unknown | NotApplicable;
  pension_start_age: number | Unknown;
  pension_contribution_monthly: number;
  pension_contributions_continue: YesNoDk;
}

export interface Answers {
  // A
  consent: 'yes';
  age: number;
  has_partner: 'just_me' | 'household';
  residence_country: string;
  stay_abroad: 'yes' | 'no' | 'unsure' | 'n/a';
  dependants: number;
  education_funded: YesNoDk | NotApplicable;
  decision_maker: 'me' | 'partner' | 'joint' | NotApplicable;
  partner_knows: YesNoDk | NotApplicable;
  // B
  base_currency: Currency;
  income_monthly: number | Unknown;
  spend_housing: number | Unknown;
  spend_living: number | Unknown;
  spend_debt: number | Unknown;
  spend_other: number | Unknown;
  saving_monthly_other: number | Unknown;
  // C
  cash_total: number | Unknown;
  cash_currency_mismatch: YesNoDk;
  money_countries: string[];
  investments_total: number | Unknown;
  fees_known: 'yes' | 'no' | 'not_sure';
  home_value: number | Unknown;
  home_mortgage: number | Unknown;
  property_value: number | Unknown;
  property_mortgage: number | Unknown;
  property_for_retirement: YesNoDk;
  debt_total: number | Unknown;
  debt_max_rate: number | Unknown; // percent, e.g. 8.5
  debt_at_retirement: number | Unknown;
  // D
  pensions: PensionRow[];
  beneficiaries_named: YesNoDk;
  // E
  life_cover: YesNoDk;
  life_cover_amount: number | Unknown | NotApplicable;
  illness_cover: YesNoDk;
  health_cover: YesNoDk;
  will: 'yes' | 'no';
  will_country: string | NotApplicable;
  will_year: number | Unknown | NotApplicable;
  // F
  retire_age: number;
  retire_country: string | Unknown;
  retire_income_monthly: number | Unknown;
  // H
  learning_priorities: Topic[];
}

export interface Assumptions {
  inflation_rate: number; // 0.03
  investment_growth_rate: number; // 0.05
  cash_growth_rate: number; // 0.02
  property_growth_rate: number; // 0.03
  withdrawal_rate: number; // 0.04
}

export type FieldId = keyof Answers | keyof PensionRow | keyof Assumptions;

export const CURRENCIES = ['EUR', 'GBP', 'USD'] as const satisfies readonly Currency[];
export const YES_NO_DK = ['yes', 'no', 'dont_know'] as const satisfies readonly YesNoDk[];
export const TOPICS = [
  'protection',
  'succession',
  'education',
  'savings',
  'retirement',
  'investments',
  'cross_border',
  'property',
  'debt',
  'fees',
] as const satisfies readonly Topic[];
export const PENSION_TYPES = [
  'state',
  'workplace_dc',
  'personal',
  'defined_benefit',
  'annuity',
  'other',
] as const satisfies readonly PensionRow['pension_type'][];

// Per-field parsers. Money: finite number >= 0; 0 is valid; null means "I don't know".
export const MoneySchema = z.number().finite().nonnegative();
export const MoneyOrUnknownSchema = MoneySchema.nullable();
export const MoneyOrUnknownOrNaSchema = MoneySchema.nullable().or(z.literal('n/a'));
export const CountryCodeSchema = z.string().regex(/^[A-Z]{2}$/, 'ISO-3166 alpha-2 code');
export const CurrencySchema = z.enum(CURRENCIES);
export const YesNoDkSchema = z.enum(YES_NO_DK);
export const YesNoDkOrNaSchema = YesNoDkSchema.or(z.literal('n/a'));
export const TopicSchema = z.enum(TOPICS);
export const AgeSchema = z.number().int().min(18).max(80);
export const RetireAgeSchema = z.number().int().min(18).max(100);
export const PensionStartAgeSchema = z.number().int().min(18).max(100).nullable();
export const DependantsSchema = z.number().int().min(0).max(20);
export const PercentSchema = z.number().finite().nonnegative();
export const WillYearSchema = z
  .number()
  .int()
  .min(1950)
  .max(new Date().getFullYear())
  .nullable()
  .or(z.literal('n/a'));

export const PensionRowSchema: z.ZodType<PensionRow> = z.object({
  pension_country: CountryCodeSchema,
  pension_type: z.enum(PENSION_TYPES),
  pension_value: MoneyOrUnknownOrNaSchema,
  pension_fixed_income_monthly: MoneyOrUnknownOrNaSchema,
  pension_start_age: PensionStartAgeSchema,
  pension_contribution_monthly: MoneySchema,
  pension_contributions_continue: YesNoDkSchema,
});

export const AnswersSchema: z.ZodType<Answers> = z.object({
  consent: z.literal('yes'),
  age: AgeSchema,
  has_partner: z.enum(['just_me', 'household']),
  residence_country: CountryCodeSchema,
  stay_abroad: z.enum(['yes', 'no', 'unsure', 'n/a']),
  dependants: DependantsSchema,
  education_funded: YesNoDkOrNaSchema,
  decision_maker: z.enum(['me', 'partner', 'joint', 'n/a']),
  partner_knows: YesNoDkOrNaSchema,
  base_currency: CurrencySchema,
  income_monthly: MoneyOrUnknownSchema,
  spend_housing: MoneyOrUnknownSchema,
  spend_living: MoneyOrUnknownSchema,
  spend_debt: MoneyOrUnknownSchema,
  spend_other: MoneyOrUnknownSchema,
  saving_monthly_other: MoneyOrUnknownSchema,
  cash_total: MoneyOrUnknownSchema,
  cash_currency_mismatch: YesNoDkSchema,
  money_countries: z.array(CountryCodeSchema),
  investments_total: MoneyOrUnknownSchema,
  fees_known: z.enum(['yes', 'no', 'not_sure']),
  home_value: MoneyOrUnknownSchema,
  home_mortgage: MoneyOrUnknownSchema,
  property_value: MoneyOrUnknownSchema,
  property_mortgage: MoneyOrUnknownSchema,
  property_for_retirement: YesNoDkSchema,
  debt_total: MoneyOrUnknownSchema,
  debt_max_rate: PercentSchema.nullable(),
  debt_at_retirement: MoneyOrUnknownSchema,
  pensions: z.array(PensionRowSchema),
  beneficiaries_named: YesNoDkSchema,
  life_cover: YesNoDkSchema,
  life_cover_amount: MoneyOrUnknownOrNaSchema,
  illness_cover: YesNoDkSchema,
  health_cover: YesNoDkSchema,
  will: z.enum(['yes', 'no']),
  will_country: CountryCodeSchema.or(z.literal('n/a')),
  will_year: WillYearSchema,
  retire_age: RetireAgeSchema,
  retire_country: CountryCodeSchema.nullable(),
  retire_income_monthly: MoneyOrUnknownSchema,
  learning_priorities: z.array(TopicSchema),
});

export const AssumptionsSchema: z.ZodType<Assumptions> = z.object({
  inflation_rate: z.number().finite().positive(),
  investment_growth_rate: z.number().finite().positive(),
  cash_growth_rate: z.number().finite().positive(),
  property_growth_rate: z.number().finite().positive(),
  withdrawal_rate: z.number().finite().positive(),
});

/** Parser for a single top-level answer or pension-row field, used by the intent step and state machine. */
export const FIELD_PARSERS: Record<FieldId, z.ZodType<unknown>> = {
  ...((AnswersSchema as unknown as z.ZodObject<Record<keyof Answers, z.ZodType<unknown>>>).shape),
  ...((PensionRowSchema as unknown as z.ZodObject<Record<keyof PensionRow, z.ZodType<unknown>>>).shape),
  ...((AssumptionsSchema as unknown as z.ZodObject<Record<keyof Assumptions, z.ZodType<unknown>>>).shape),
};

export function parseFieldValue(fieldId: FieldId, value: unknown): { success: true; value: unknown } | { success: false } {
  const r = FIELD_PARSERS[fieldId].safeParse(value);
  return r.success ? { success: true, value: r.data } : { success: false };
}
