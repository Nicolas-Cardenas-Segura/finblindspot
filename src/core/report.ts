import { calculateIndicators, formatRange, type IndicatorId } from './indicators';
import type { Comparison } from './comparison';
import type { FinancialProfile } from './profile';
import { rankBlindspots, scoreIndicator, type ScoredIndicator } from './rules';
import { LIMITATION, RULES_VERSION, thresholdDescriptions } from './thresholds';

export const titles: Record<IndicatorId, string> = { runway: 'Emergency runway', debt: 'Debt exposure', retirement: 'Retirement visibility', concentration: 'Asset concentration', crossBorder: 'Cross-border complexity' };
export const education: Record<IndicatorId, string> = {
  runway: 'Emergency runway relates accessible cash to essential expenditure. It is an estimate, not a prediction of how long money will last.',
  debt: 'Debt exposure describes the share of reported take-home income used for debt payments. It does not account for every household circumstance.',
  retirement: 'Retirement visibility measures how much pension information is known, not whether retirement is funded.',
  concentration: 'Concentration describes the distribution across broad reported asset categories. Categories can overlap; this is not a recommendation to rebalance.',
  crossBorder: 'Cross-border complexity summarises reported jurisdictions, currencies and pension uncertainty. It does not establish tax residence, liability or pension rights.',
};
export type Report = { schemaVersion: 1; rulesVersion: string; createdAt: string; currency: string | null; cards: ScoredIndicator[]; blindspots: IndicatorId[]; limitation: string; baselineAt?: string; comparison?: Comparison[]; simulation?: boolean; explanations?: Partial<Record<IndicatorId, string>> };
export function createReport(profile: FinancialProfile, createdAt: string): Report {
  const cards = calculateIndicators(profile).map(scoreIndicator);
  return { schemaVersion: 1, rulesVersion: RULES_VERSION, createdAt, currency: profile.residency.status === 'known' ? profile.residency.value.currency : null, cards, blindspots: rankBlindspots(cards).map(c => c.id), limitation: LIMITATION };
}
export function displayValue(card: ScoredIndicator): string {
  if (!card.range) return card.reason === 'no_pensions' ? 'No pensions declared; not an adequacy assessment' : 'Not assessed';
  return card.unit === 'ratio' ? `${formatRange({ min: card.range.min * 100, max: card.range.max * 100 })}%` : `${formatRange(card.range)} ${card.unit}`;
}
export function renderReport(report: Report): string {
  const cards = report.cards.map(c => `${titles[c.id]}: ${c.status.replace('_', ' ').toUpperCase()} — ${displayValue(c)}`);
  const gaps = report.blindspots.map((id, i) => `${i + 1}. ${titles[id]}${report.cards.find(c => c.id === id)?.status === 'not_assessed' ? ' (data gap or uncertainty)' : ''}: ${report.explanations?.[id] ?? education[id]}`);
  const changes = report.comparison?.map(c => `${titles[c.id]}: ${c.delta === null ? 'not comparable' : `${c.delta > 0 ? '+' : ''}${formatRange({ min: c.delta, max: c.delta })} ${c.unit}`} (${c.before.replace('_', ' ')} to ${c.after.replace('_', ' ')})`) ?? [];
  return ['Your financial visibility check', ...(report.simulation ? ['Six-month demonstration; dates below are actual assessment dates.'] : []), ...cards, '', gaps.length ? 'What stands out' : 'No amber or red flags in the assessed indicators.', ...gaps, ...(changes.length ? ['', `Compared with ${report.baselineAt?.slice(0, 10)}`, ...changes] : []), '', LIMITATION].join('\n');
}
export function reportDetails(report: Report) {
  return report.cards.map(card => ({ ...card, title: titles[card.id], display: displayValue(card), explanation: report.explanations?.[card.id] ?? education[card.id], thresholds: thresholdDescriptions[card.id] }));
}
