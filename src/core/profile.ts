import { z } from 'zod';

export const currencySchema = z.string().regex(/^[A-Z]{3}$/);
const countrySchema = z.string().regex(/^[A-Z]{2}$/);
export const rangeSchema = z.strictObject({ min: z.number().finite().nonnegative().max(1e12), max: z.number().finite().nonnegative().max(1e12) }).refine(v => v.max >= v.min, 'Range maximum must not be below minimum');
export const moneySchema = z.strictObject({ min: z.number().finite().nonnegative().max(1e12), max: z.number().finite().nonnegative().max(1e12), currency: currencySchema, period: z.enum(['monthly', 'annual', 'balance']) }).refine(v => v.max >= v.min, 'Invalid range');
export const answer = <T extends z.ZodType>(value: T) => z.union([
  z.strictObject({ status: z.literal('known'), value }),
  z.strictObject({ status: z.enum(['unknown', 'skipped', 'not_applicable']) }),
]);
const moneyAnswer = answer(moneySchema);
const pensionsSchema = z.strictObject({ complete: z.boolean(), pots: z.array(z.strictObject({ country: countrySchema.nullable(), balance: moneyAnswer, contribution: moneyAnswer, statusKnown: z.boolean().nullable() })).max(20) });
const investmentsSchema = z.strictObject({ complete: z.boolean(), assets: z.array(z.strictObject({ category: z.enum(['equities', 'bonds', 'funds', 'other']), country: countrySchema.nullable(), amount: moneyAnswer })).max(20) });
export const answerSchemas = {
  residency: answer(z.strictObject({ country: countrySchema, currency: currencySchema })),
  income: moneyAnswer,
  expenses: moneyAnswer,
  cash: moneyAnswer,
  debt: moneyAnswer,
  age: answer(z.number().int().min(18).max(110)),
  previousCountries: answer(z.array(countrySchema).max(30)),
  pensions: answer(pensionsSchema),
  investments: answer(investmentsSchema),
  property: moneyAnswer,
  dependants: answer(z.number().int().nonnegative().max(30)),
  protection: answer(z.enum(['known', 'uncertain', 'none'])),
  goals: answer(z.string().trim().min(1).max(300)),
  retirementAge: answer(z.number().int().min(18).max(110)),
  confidence: answer(z.number().int().min(1).max(5)),
};
export const domains = Object.keys(answerSchemas) as (keyof typeof answerSchemas)[];
export const domainSchema = z.enum(domains as [keyof typeof answerSchemas, ...(keyof typeof answerSchemas)[]]);
export const profileSchema = z.strictObject(answerSchemas);
export type FinancialProfile = z.infer<typeof profileSchema>;
export type Domain = keyof FinancialProfile;
export type Money = z.infer<typeof moneySchema>;
export type MoneyAnswer = z.infer<typeof moneyAnswer>;
export type NumericRange = z.infer<typeof rangeSchema>;
export const emptyProfile = (): FinancialProfile => profileSchema.parse(Object.fromEntries(domains.map(key => [key, { status: 'unknown' }])));
export const parseAnswer = (domain: Domain, value: unknown): FinancialProfile[Domain] => answerSchemas[domain].parse(value);
export function withAnswer(profile: FinancialProfile, domain: Domain, value: unknown): FinancialProfile {
  return profileSchema.parse({ ...profile, [domain]: parseAnswer(domain, value) });
}
