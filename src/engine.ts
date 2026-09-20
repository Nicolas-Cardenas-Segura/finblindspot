import { z } from 'zod';
import { FRAMEWORK_VERSION, profileSchema, valueOf, type Profile } from './profile.js';

export const assumptionsSchema = z.object({
  annualRealReturn: z.number().min(-0.1).max(0.1),
  withdrawalRate: z.number().min(0.01).max(0.1),
  runwayRedBelow: z.number().positive(),
  runwayGreenAt: z.number().positive(),
  debtGreenBelow: z.number().min(0).max(1),
  debtRedAbove: z.number().min(0).max(1),
  concentrationGreenBelow: z.number().min(0).max(1),
  concentrationRedAbove: z.number().min(0).max(1),
}).strict().refine((a) =>
  a.runwayRedBelow < a.runwayGreenAt &&
  a.debtGreenBelow < a.debtRedAbove &&
  a.concentrationGreenBelow < a.concentrationRedAbove,
);
export type Assumptions = z.infer<typeof assumptionsSchema>;
export const defaults: Assumptions = {
  annualRealReturn: 0.03, withdrawalRate: 0.04,
  runwayRedBelow: 3, runwayGreenAt: 6,
  debtGreenBelow: 0.2, debtRedAbove: 0.4,
  concentrationGreenBelow: 0.5, concentrationRedAbove: 0.8,
};
export const indicatorSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(['red', 'amber', 'green']),
  value: z.number().finite().nullable(),
  unit: z.string(),
  explanation: z.string(),
  nextStep: z.string(),
}).strict();
export type Indicator = z.infer<typeof indicatorSchema>;
export const scorecardSchema = z.object({
  frameworkVersion: z.string(),
  assumptions: assumptionsSchema,
  indicators: z.array(indicatorSchema),
  topBlindSpots: z.array(indicatorSchema),
  unknownFields: z.array(z.string()),
  retirement: z.object({
    projectedPot: z.number().finite().nullable(),
    requiredPot: z.number().finite().nullable(),
    gap: z.number().finite().nullable(),
    years: z.number().finite().nullable(),
  }).strict(),
}).strict();
export type Scorecard = z.infer<typeof scorecardSchema>;
export const severity = { red: 2, amber: 1, green: 0 } as const;

export function ratio(numerator: number | null, denominator: number | null): number | null {
  return numerator === null || denominator === null || denominator <= 0
    ? null : Number((numerator / denominator).toPrecision(15));
}

export function futureValue(pot: number, monthly: number, years: number, annualRealReturn: number): number {
  const months = years * 12;
  const rate = Math.pow(1 + annualRealReturn, 1 / 12) - 1;
  if (rate === 0) return pot + monthly * months;
  const growth = Math.pow(1 + rate, months);
  return pot * growth + monthly * (growth - 1) / rate;
}

export function assess(input: Profile, settings: Assumptions = defaults): Scorecard {
  const p = profileSchema.parse(input);
  const a = assumptionsSchema.parse(settings);
  const cash = valueOf(p.cash), expenses = valueOf(p.expenses);
  const pension = valueOf(p.pension), investments = valueOf(p.investments);
  const contribution = valueOf(p.contribution), age = valueOf(p.age);
  const retirementAge = valueOf(p.retirementAge);
  const untracked = valueOf(p.untrackedPensions);
  const spending = valueOf(p.retirementSpending);
  const years = age !== null && retirementAge !== null && retirementAge >= age ? retirementAge - age : null;
  const projectedPot = years === null || pension === null || investments === null ||
    contribution === null || untracked !== 0 ? null
    : futureValue(pension + investments, contribution, years, a.annualRealReturn);
  const requiredPot = spending === null ? null : spending * 12 / a.withdrawalRate;
  const gap = projectedPot === null || requiredPot === null ? null : projectedPot - requiredPot;
  const indicators: Indicator[] = [];
  const add = (id: string, title: string, status: Indicator['status'], value: number | null,
    unit: string, explanation: string, nextStep: string) => {
    indicators.push({ id, title, status, value, unit, explanation, nextStep });
  };
  const runway = ratio(cash, expenses);
  add('runway', 'Emergency buffer', runway === null ? 'amber' :
    runway < a.runwayRedBelow ? 'red' : runway < a.runwayGreenAt ? 'amber' : 'green',
  runway, 'months', runway === null ? 'Cash or spending is unknown, or spending is zero. Runway cannot be calculated.' :
    'Accessible cash divided by reported monthly spending.',
  'Check accessible savings and monthly spending against recent statements.');
  const debt = ratio(valueOf(p.debtPayment), valueOf(p.income));
  add('debt', 'Debt commitments', debt === null ? 'amber' : debt > a.debtRedAbove ? 'red' :
    debt >= a.debtGreenBelow ? 'amber' : 'green', debt === null ? null : debt * 100, '% of income',
  debt === null ? 'Debt payments or income are unknown, or income is zero.' :
    'Monthly debt payments as a share of take-home income.',
  'List recurring repayment amounts and confirm your monthly take-home income.');
  const taxKnown = valueOf(p.pensionTaxKnown);
  const missingRetirement = [p.pension, p.untrackedPensions, p.age, p.retirementAge, p.pensionTaxKnown]
    .filter((answer) => answer.status === 'unknown').length;
  add('pensions', 'Pension visibility', untracked === null || missingRetirement > 1 ||
    (untracked !== null && untracked > 1) ? 'red' :
    missingRetirement > 0 || untracked > 0 || taxKnown === false ? 'amber' : 'green',
  untracked, 'untracked pots', 'Unknown pots and unclear access/tax rules are gaps in your picture, not zero-valued assets.',
  'Locate pension statements and verify access and tax rules in the relevant countries.');
  add('retirement', 'Retirement lifestyle', gap === null ? 'amber' : gap < 0 ? 'red' : 'green',
    gap, p.currency, gap === null ? 'The retirement scenario needs known ages, all pension values, contributions, investments and a spending goal.' :
      'Illustrative projected retirement capital minus capital needed for your stated lifestyle, in today’s money.',
    'Confirm pension values and the spending level that matches your retirement lifestyle.');
  const assets = [cash, investments, pension, valueOf(p.property)];
  const total = assets.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const concentration = assets.some((v) => v === null) || untracked !== 0 || total === 0
    ? null : ratio(Math.max(...assets.map((v) => v ?? 0)), total);
  add('concentration', 'Asset concentration', concentration === null ? 'amber' :
    concentration > a.concentrationRedAbove ? 'red' : concentration >= a.concentrationGreenBelow ? 'amber' : 'green',
  concentration === null ? null : concentration * 100, '% in largest category',
  'Coarse concentration across cash, investments, pensions and property equity; underlying holdings are not assessed.',
  'Map the categories and underlying holdings on your statements to understand concentration.');
  const countries = valueOf(p.countries), residence = valueOf(p.residence);
  const count = countries === null || residence === null ? null : new Set([...countries, residence]).size;
  add('borders', 'Cross-border complexity', count === null ? 'amber' : count >= 3 ? 'red' : count === 2 ? 'amber' : 'green',
    count, 'countries', 'More jurisdictions mean more records and potentially conflicting rules; this is a complexity indicator.',
    'Check where your pensions, assets and residency obligations sit. Seek qualified local guidance for legal/tax questions.');
  for (const [id, title, answer, nextStep] of [
    ['fees', 'Unseen fees', p.feesKnown, 'Find the fee schedule for each pension and investment account.'],
    ['will', 'Will where you live', p.localWill, 'Ask a qualified local professional whether your existing will applies where you live.'],
    ['beneficiaries', 'Beneficiary nominations', p.beneficiaries, 'Check whether account and pension beneficiary details are current.'],
  ] as const) {
    const value = valueOf(answer);
    add(id, title, value === null ? 'amber' : value ? 'green' : 'red', null, '',
      value === null ? 'You marked this as unknown. That uncertainty is a finding worth following up.' :
        value ? 'You reported that this has been checked.' : 'You reported that this has not been checked.',
      nextStep);
  }
  return {
    frameworkVersion: FRAMEWORK_VERSION, assumptions: a, indicators,
    topBlindSpots: indicators.filter((i) => i.status !== 'green')
      .sort((left, right) => severity[right.status] - severity[left.status]).slice(0, 3),
    unknownFields: Object.entries(p).filter(([, value]) => typeof value !== 'string' && value.status === 'unknown')
      .map(([key]) => key),
    retirement: { projectedPot, requiredPot, gap, years },
  };
}
