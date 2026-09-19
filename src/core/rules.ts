import { indicatorIds, type Indicator, type IndicatorId } from './indicators';
import { thresholds } from './thresholds';

export type Status = 'green' | 'amber' | 'red' | 'not_assessed';
export type ScoredIndicator = Indicator & { status: Status };
function colour(id: IndicatorId, n: number): Status {
  if (id === 'runway') return n < thresholds.runway.amber ? 'red' : n < thresholds.runway.green ? 'amber' : 'green';
  return n >= thresholds[id].red ? 'red' : n >= thresholds[id].amber ? 'amber' : 'green';
}
export function scoreIndicator(indicator: Indicator): ScoredIndicator {
  if (!indicator.range) return { ...indicator, status: 'not_assessed' };
  const low = colour(indicator.id, indicator.range.min);
  const high = colour(indicator.id, indicator.range.max);
  return { ...indicator, status: low === high ? low : 'not_assessed', reason: low === high ? indicator.reason : 'range_crosses_bands' };
}
export function rankBlindspots(cards: ScoredIndicator[]): ScoredIndicator[] {
  const priority: Record<Status, number> = { red: 0, amber: 1, not_assessed: 2, green: 3 };
  return cards.filter(c => c.status !== 'green' && c.reason !== 'no_pensions').sort((a, b) => priority[a.status] - priority[b.status] || indicatorIds.indexOf(a.id) - indicatorIds.indexOf(b.id)).slice(0, 3);
}
