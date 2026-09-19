import type { Answers, Assumptions, FieldId, PensionRow } from '../questionnaire/schema.js';
import type { Derived } from '../engine/derived.js';
import type { RuleId } from '../rules/rules.js';
import type { Assessment } from './assess.js';
import { runAssessment } from './assess.js';

export interface Delta {
  position_change: number | null;
  net_worth_change: number | null;
  monthly_saving_change: number | null;
  emergency_months_change: number | null;
  blind_spots_closed: RuleId[];
  blind_spots_new: RuleId[];
  blind_spots_still_open: RuleId[];
  unknowns_resolved: FieldId[];
  assumptions_changed: boolean;
}

function change(previous: number | null, current: number | null): number | null {
  if (previous === null || current === null) return null;
  return current - previous;
}

function monthlySaving(a: Answers): number | null {
  if (a.saving_monthly_other === null) return null;
  return a.pensions.reduce((acc, p) => acc + p.pension_contribution_monthly, a.saving_monthly_other);
}

function emergencyMonths(a: Answers, d: Derived): number | null {
  if (a.cash_total === null || d.monthly_spending === null || d.monthly_spending === 0) return null;
  return a.cash_total / d.monthly_spending;
}

function resolvedFields(previous: Answers, current: Answers): FieldId[] {
  const resolved: FieldId[] = [];
  const add = (id: FieldId): void => {
    if (!resolved.includes(id)) resolved.push(id);
  };

  for (const key of Object.keys(current) as Array<keyof Answers>) {
    if (previous[key] === null && current[key] !== null) add(key);
  }

  current.pensions.forEach((row, i) => {
    const before = previous.pensions[i];
    if (before === undefined) return;
    for (const key of Object.keys(row) as Array<keyof PensionRow>) {
      if (before[key] === null && row[key] !== null) add(key);
    }
  });

  return resolved;
}

function assumptionsEqual(previous: Assumptions, current: Assumptions): boolean {
  return (Object.keys(current) as Array<keyof Assumptions>).every((key) => previous[key] === current[key]);
}

export function compare(previous: Assessment, current: Assessment): Delta {
  const prev = runAssessment(previous.answers, current.assumptions);
  const cur = runAssessment(current.answers, current.assumptions);

  const prevIds = prev.blind_spots.map((f) => f.rule_id);
  const curIds = cur.blind_spots.map((f) => f.rule_id);

  return {
    position_change: change(prev.results.position_today, cur.results.position_today),
    net_worth_change: change(prev.derived.net_worth, cur.derived.net_worth),
    monthly_saving_change: change(monthlySaving(previous.answers), monthlySaving(current.answers)),
    emergency_months_change: change(
      emergencyMonths(previous.answers, prev.derived),
      emergencyMonths(current.answers, cur.derived),
    ),
    blind_spots_closed: prevIds.filter((id) => !curIds.includes(id)),
    blind_spots_new: curIds.filter((id) => !prevIds.includes(id)),
    blind_spots_still_open: curIds.filter((id) => prevIds.includes(id)),
    unknowns_resolved: resolvedFields(previous.answers, current.answers),
    assumptions_changed: !assumptionsEqual(previous.assumptions, current.assumptions),
  };
}
