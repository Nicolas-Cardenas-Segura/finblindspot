import { z } from 'zod';

export const FRAMEWORK_VERSION = '1.0.0';
const money = z.number().finite().min(0).max(1_000_000_000);
const age = z.number().int().min(18).max(100);
const country = z.string().regex(/^[A-Z]{2}$/);
export const currencies = ['EUR', 'GBP', 'USD', 'CHF', 'CAD', 'AUD'] as const;

function knowledge<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion('status', [
    z.object({ status: z.literal('known'), value }).strict(),
    z.object({ status: z.literal('unknown') }).strict(),
  ]);
}

export const profileSchema = z.object({
  currency: z.enum(currencies),
  residence: knowledge(country),
  countries: knowledge(z.array(country).min(1).max(20).refine(
    (values) => new Set(values).size === values.length, 'Use each country once.',
  )),
  age: knowledge(age),
  retirementAge: knowledge(age),
  income: knowledge(money),
  expenses: knowledge(money),
  cash: knowledge(money),
  debtPayment: knowledge(money),
  investments: knowledge(money),
  property: knowledge(money),
  pension: knowledge(money),
  untrackedPensions: knowledge(z.number().int().min(0).max(100)),
  pensionTaxKnown: knowledge(z.boolean()),
  contribution: knowledge(money),
  retirementSpending: knowledge(money),
  feesKnown: knowledge(z.boolean()),
  localWill: knowledge(z.boolean()),
  beneficiaries: knowledge(z.boolean()),
}).strict();

export type Profile = z.infer<typeof profileSchema>;
export type Field = Exclude<keyof Profile, 'currency'>;
export type Answer = Profile[Field];
export type Draft = Partial<Profile>;
export type Known<T> = { status: 'known'; value: T };
export const known = <T>(value: T): Known<T> => ({ status: 'known', value });
export const unknown = { status: 'unknown' } as const;

export function valueOf<T>(answer: Known<T> | { status: 'unknown' }): T | null {
  return answer.status === 'known' ? answer.value : null;
}

type Question = { id: Field; text: string; kind: 'number' | 'boolean' | 'country' | 'countries' };
export const questions: readonly Question[] = [
  { id: 'residence', kind: 'country', text: 'Where do you live? Use a two-letter country code, e.g. ES.' },
  { id: 'countries', kind: 'countries', text: 'In which countries have you worked or held assets/pensions? Use codes separated by commas, e.g. ES,GB.' },
  { id: 'age', kind: 'number', text: 'How old are you?' },
  { id: 'retirementAge', kind: 'number', text: 'At what age would you like to retire?' },
  { id: 'income', kind: 'number', text: 'About how much is your monthly take-home income?' },
  { id: 'expenses', kind: 'number', text: 'About how much do you spend each month, including debt payments?' },
  { id: 'cash', kind: 'number', text: 'How much accessible cash savings do you have?' },
  { id: 'debtPayment', kind: 'number', text: 'How much goes to debt repayments each month? Enter 0 if none.' },
  { id: 'investments', kind: 'number', text: 'What is the approximate value of your investments, excluding pensions and property? Enter 0 if none.' },
  { id: 'property', kind: 'number', text: 'What is your property equity (value minus outstanding mortgage)? Enter 0 if none; unknown if negative or unclear.' },
  { id: 'pension', kind: 'number', text: 'What is the total current value of the pension pots you can account for? Enter 0 if none, or unknown.' },
  { id: 'untrackedPensions', kind: 'number', text: 'How many other pension pots can you not value or locate? Enter 0 if none, or unknown.' },
  { id: 'pensionTaxKnown', kind: 'boolean', text: 'Do you understand the tax/access rules for your pensions where you live? Answer yes/no; yes if you have no pensions.' },
  { id: 'contribution', kind: 'number', text: 'How much goes into pensions and retirement investments each month, including employer contributions?' },
  { id: 'retirementSpending', kind: 'number', text: 'What monthly retirement spending would fit the lifestyle you want, in today’s money?' },
  { id: 'feesKnown', kind: 'boolean', text: 'Do you know the fees on all your pensions and investments? Answer yes/no; yes if you have neither.' },
  { id: 'localWill', kind: 'boolean', text: 'Have you confirmed that your will applies where you currently live? Answer yes/no.' },
  { id: 'beneficiaries', kind: 'boolean', text: 'Have you checked beneficiary nominations on your pensions/accounts? Answer yes/no; yes if none apply.' },
];
