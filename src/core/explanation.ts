import { z } from 'zod';
import { indicatorIds, type IndicatorId } from './indicators';
import { education, type Report } from './report';

export const explanationSchema = z.strictObject({ selections: z.array(z.strictObject({ indicatorId: z.enum(indicatorIds), emphasis: z.enum(['definition', 'uncertainty']) })).max(3) });
export const uncertainty: Record<IndicatorId, string> = {
  runway: 'This estimate depends on accessible cash and essential expenditure in comparable units. Missing values and ranges can limit what it tells us.',
  debt: 'This is based on reported debt payments and take-home income, not a complete affordability assessment. Zero or unknown income prevents a meaningful ratio.',
  retirement: 'Unknown pension balances, contributions or status are information gaps. They do not establish entitlement, tax treatment or retirement adequacy.',
  concentration: 'The result depends on the completeness and comparability of reported categories. It is not a recommendation about how assets should be distributed.',
  crossBorder: 'Reported countries and currencies are only a picture of complexity. They do not establish tax residence, liabilities or pension rights.',
};
export function selectExplanations(report: Report, input: unknown): Partial<Record<IndicatorId, string>> {
  const parsed = explanationSchema.parse(input);
  if (new Set(parsed.selections.map(s => s.indicatorId)).size !== parsed.selections.length || parsed.selections.some(s => !report.blindspots.includes(s.indicatorId))) throw new Error('Explanation references unsupported facts');
  return Object.fromEntries(parsed.selections.map(s => [s.indicatorId, s.emphasis === 'definition' ? education[s.indicatorId] : uncertainty[s.indicatorId]]));
}
