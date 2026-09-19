import { profileSchema, type FinancialProfile, type MoneyAnswer, type NumericRange } from './profile';

export const indicatorIds = ['runway', 'debt', 'retirement', 'concentration', 'crossBorder'] as const;
export type IndicatorId = typeof indicatorIds[number];
export type Indicator = { id: IndicatorId; range: NumericRange | null; unit: 'months' | 'ratio' | 'missing fields' | 'complexity points'; reason: string; inputs: string[] };
const absent = (id: IndicatorId, unit: Indicator['unit'], reason = 'missing_data'): Indicator => ({ id, unit, range: null, reason, inputs: [] });
const known = (id: IndicatorId, unit: Indicator['unit'], range: NumericRange, inputs: string[]): Indicator => Number.isFinite(range.min) && Number.isFinite(range.max) ? { id, unit, range, reason: 'calculated', inputs } : absent(id, unit, 'out_of_range');
const amount = (value: MoneyAnswer, currency: string | null, stock: boolean): NumericRange | null => {
  if (value.status !== 'known' || !currency || value.value.currency !== currency || (value.value.period === 'balance') !== stock) return null;
  const divisor = value.value.period === 'annual' ? 12 : 1;
  return { min: value.value.min / divisor, max: value.value.max / divisor };
};
export const formatRange = (range: NumericRange, digits = 2): string => {
  const fmt = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: digits });
  return range.min === range.max ? fmt(range.min) : `${fmt(range.min)}–${fmt(range.max)}`;
};
function ratio(id: 'runway' | 'debt', numerator: MoneyAnswer, denominator: MoneyAnswer, currency: string | null): Indicator {
  const unit = id === 'runway' ? 'months' : 'ratio';
  const n = amount(numerator, currency, id === 'runway');
  const d = amount(denominator, currency, false);
  if (!n || !d) return absent(id, unit, 'missing_or_incomparable');
  if (d.min <= 0) return absent(id, unit, 'zero_denominator');
  return known(id, unit, { min: n.min / d.max, max: n.max / d.min }, [`${formatRange(n)} ${currency}${id === 'debt' ? '/month' : ''}`, `${formatRange(d)} ${currency}/month`]);
}
function retirement(p: FinancialProfile): Indicator {
  if (p.pensions.status !== 'known') return absent('retirement', 'missing fields');
  const { pots, complete } = p.pensions.value;
  if (!complete) return absent('retirement', 'missing fields', 'incomplete_pension_list');
  if (!pots.length) return absent('retirement', 'missing fields', 'no_pensions');
  const missingAnswer = (status: string) => status !== 'known' && status !== 'not_applicable';
  let missing = Number(missingAnswer(p.retirementAge.status));
  for (const pot of pots) missing += Number(!pot.country) + Number(missingAnswer(pot.balance.status)) + Number(missingAnswer(pot.contribution.status)) + Number(pot.statusKnown !== true);
  return known('retirement', 'missing fields', { min: missing, max: missing }, [`${pots.length} reported pension pots`, `${missing} missing applicable fields`]);
}
function concentration(p: FinancialProfile, currency: string | null): Indicator {
  if (p.investments.status !== 'known' || !p.investments.value.complete || p.pensions.status !== 'known' || !p.pensions.value.complete) return absent('concentration', 'ratio');
  const entries: [string, MoneyAnswer][] = [['cash', p.cash], ['property', p.property], ...p.investments.value.assets.map(a => [a.category, a.amount] as [string, MoneyAnswer]), ...p.pensions.value.pots.map(pot => ['pensions', pot.balance] as [string, MoneyAnswer])];
  const groups = new Map<string, NumericRange>();
  for (const [category, value] of entries) {
    const a = amount(value, currency, true);
    if (!a) return absent('concentration', 'ratio', 'missing_or_incomparable');
    const prev = groups.get(category) ?? { min: 0, max: 0 };
    groups.set(category, { min: prev.min + a.min, max: prev.max + a.max });
  }
  const values = [...groups.values()];
  const total = values.reduce((sum, a) => ({ min: sum.min + a.min, max: sum.max + a.max }), { min: 0, max: 0 });
  if (total.min <= 0) return absent('concentration', 'ratio', 'zero_or_uncertain_total');
  const lower = Math.max(...values.map(a => a.min / (a.min + total.max - a.max)));
  const upper = Math.max(...values.map(a => a.max / (a.max + total.min - a.min)));
  return known('concentration', 'ratio', { min: lower, max: upper }, [...groups].map(([name, value]) => `${name}: ${formatRange(value)} ${currency}`));
}
function crossBorder(p: FinancialProfile): Indicator {
  if (p.residency.status !== 'known' || p.previousCountries.status !== 'known' || p.pensions.status !== 'known' || !p.pensions.value.complete || p.investments.status !== 'known' || !p.investments.value.complete) return absent('crossBorder', 'complexity points');
  if (p.pensions.value.pots.some(pot => !pot.country) || p.investments.value.assets.some(a => !a.country)) return absent('crossBorder', 'complexity points', 'unknown_jurisdiction');
  const countries = new Set([p.residency.value.country, ...p.previousCountries.value, ...p.pensions.value.pots.map(pot => pot.country!), ...p.investments.value.assets.map(a => a.country!)]);
  const money = [p.income, p.expenses, p.cash, p.debt, p.property, ...p.pensions.value.pots.flatMap(pot => [pot.balance, pot.contribution]), ...p.investments.value.assets.map(a => a.amount)];
  if (money.some(a => a.status === 'unknown' || a.status === 'skipped')) return absent('crossBorder', 'complexity points', 'incomplete_currency_information');
  const currencies = new Set([p.residency.value.currency, ...money.flatMap(a => a.status === 'known' ? [a.value.currency] : [])]);
  const unverified = p.pensions.value.pots.filter(pot => pot.country !== (p.residency.status === 'known' ? p.residency.value.country : '') && pot.statusKnown !== true).length;
  const count = countries.size - 1 + currencies.size - 1 + unverified;
  return known('crossBorder', 'complexity points', { min: count, max: count }, [`${countries.size} reported jurisdictions`, `${currencies.size} reported currencies`, `${unverified} unverified foreign pensions`]);
}
export function calculateIndicators(input: FinancialProfile): Indicator[] {
  const p = profileSchema.parse(input);
  const currency = p.residency.status === 'known' ? p.residency.value.currency : null;
  return [ratio('runway', p.cash, p.expenses, currency), ratio('debt', p.debt, p.income, currency), retirement(p), concentration(p, currency), crossBorder(p)];
}
