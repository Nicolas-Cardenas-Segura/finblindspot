import { severity } from './engine.js';
import { type Snapshot } from './store.js';

function number(value: number | null): string {
  return value === null ? 'Unknown / unavailable' : value.toLocaleString('en-GB', { maximumFractionDigits: 1 });
}

export function renderReport(snapshot: Snapshot): string {
  const { scorecard: s, profile: p } = snapshot;
  const lines = [
    `MyFinGap · ${snapshot.createdAt.slice(0, 10)}`,
    'Your assessment is saved. These are starting points for checking your records, not investment recommendations.',
    `Unknown answers: ${s.unknownFields.length}. Unknown never means zero.`,
    '', 'WHERE TO FOCUS',
    ...s.topBlindSpots.map((i, n) =>
      `${n + 1}. ${i.title} [${i.status.toUpperCase()}]\n${i.explanation}\nNext check: ${i.nextStep}`),
    ...(s.topBlindSpots.length ? [] : ['No flags under this limited framework. This does not establish overall financial health.']),
    '', 'YOUR INDICATORS',
    ...s.indicators.map((i) => `${i.title}: ${i.status.toUpperCase()}${i.unit ? ` · ${number(i.value)} ${i.unit}` : ''}`),
    '', `RETIREMENT SCENARIO · ${p.currency}, today’s money`,
    `Projected pot: ${number(s.retirement.projectedPot)}`,
    `Lifestyle target pot: ${number(s.retirement.requiredPot)}`,
    `Surplus / shortfall: ${number(s.retirement.gap)}`,
    `Assumptions: ${s.assumptions.annualRealReturn * 100}% annual real return after fees; ${s.assumptions.withdrawalRate * 100}% annual withdrawal.`,
    'Constant end-of-month contributions; no state pension, tax, currency conversion or property sale. Returns and withdrawals are illustrations, not forecasts or guarantees.',
    '', 'Revisit in 6–12 months with /revisit. /history lists saved assessments. /delete removes local records.',
    `Framework ${s.frameworkVersion}. Educational information only; not financial, legal or tax advice.`,
  ];
  return lines.join('\n');
}

export function compare(baseline: Snapshot, current: Snapshot): string {
  if (baseline.profile.currency !== current.profile.currency ||
    baseline.scorecard.frameworkVersion !== current.scorecard.frameworkVersion ||
    JSON.stringify(baseline.scorecard.assumptions) !== JSON.stringify(current.scorecard.assumptions)) {
    return 'Progress comparison unavailable: currency, framework or assumptions changed. Review the two assessments separately.';
  }
  const before = baseline.scorecard.indicators;
  const after = current.scorecard.indicators;
  const resolved = after.filter((i) => i.status === 'green' && before.some((b) => b.id === i.id && b.status !== 'green'));
  const remaining = after.filter((i) => i.status !== 'green' && before.some((b) => b.id === i.id && b.status !== 'green'));
  const appeared = after.filter((i) => i.status !== 'green' && before.some((b) => b.id === i.id && b.status === 'green'));
  const changed = after.flatMap((i) => {
    const previous = before.find((b) => b.id === i.id);
    if (!previous) return [];
    const delta = previous.value === null || i.value === null ? '' :
      `; value change ${number(i.value - previous.value)} ${i.unit}`;
    return previous.status === i.status && !delta ? [] :
      [`${i.title}: ${previous.status} → ${i.status}${delta}${severity[i.status] < severity[previous.status] ? ' (improved flag)' : ''}`];
  });
  const names = (items: typeof after) => items.map((i) => i.title).join(', ') || 'None';
  const newlyKnown = baseline.scorecard.unknownFields.filter((id) => !current.scorecard.unknownFields.includes(id));
  const newlyUnknown = current.scorecard.unknownFields.filter((id) => !baseline.scorecard.unknownFields.includes(id));
  return [
    `THEN → NOW · original baseline ${baseline.createdAt.slice(0, 10)} → ${current.createdAt.slice(0, 10)}`,
    `Resolved flags: ${names(resolved)}`, `Still present: ${names(remaining)}`, `New flags: ${names(appeared)}`,
    `Previously unknown, now answered: ${newlyKnown.join(', ') || 'None'}`,
    `New unknowns: ${newlyUnknown.join(', ') || 'None'}`,
    ...changed,
    'Changes reflect self-reported answers; confirmed facts and risk are different measures.',
  ].join('\n');
}
