import type { Report } from './report';
import type { IndicatorId } from './indicators';
import type { Status } from './rules';

export type Comparison = { id: IndicatorId; before: Status; after: Status; delta: number | null; unit: string; reason: string };
export function compareReports(baseline: Report, current: Report): Comparison[] {
  const compatible = baseline.currency === current.currency && baseline.rulesVersion === current.rulesVersion && baseline.schemaVersion === current.schemaVersion;
  return current.cards.map(card => {
    const prior = baseline.cards.find(c => c.id === card.id);
    const comparable = compatible && prior?.range && card.range && prior.unit === card.unit && prior.range.min === prior.range.max && card.range.min === card.range.max;
    return { id: card.id, before: prior?.status ?? 'not_assessed', after: card.status, unit: card.unit, delta: comparable ? card.range!.min - prior!.range!.min : null, reason: comparable ? 'comparable' : 'incompatible_or_incomplete' };
  });
}
