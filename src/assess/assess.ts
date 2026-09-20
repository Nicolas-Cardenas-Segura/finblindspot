import type { Answers, Assumptions, Currency, FieldId } from '../questionnaire/schema.js';
import { FIELDS } from '../questionnaire/fields.js';
import type { Derived } from '../engine/derived.js';
import { computeDerived } from '../engine/derived.js';
import type { Results } from '../engine/projection.js';
import { computeProjection, emptyResults } from '../engine/projection.js';
import type { FiredRule } from '../rules/evaluate.js';
import { applyTopicBump, evaluateRules } from '../rules/evaluate.js';
import { RULES } from '../rules/rules.js';
import type { RuleId } from '../rules/rules.js';

export interface Assessment {
  id: string;
  user_id: string;
  created_at: string;
  status: 'draft' | 'complete' | 'partial';
  base_currency: Currency;
  answers: Answers;
  assumptions: Assumptions;
  derived: Derived;
  results: Results;
  blind_spots: FiredRule[];
  /** Fields the person declined or never reached; empty for a complete assessment. */
  unanswered: FieldId[];
  /** Rules that could not be evaluated because one of their inputs is unanswered. */
  not_assessed: RuleId[];
}

export type Computed = Pick<Assessment, 'derived' | 'results' | 'blind_spots' | 'unanswered' | 'not_assessed'>;

export function runAssessment(a: Answers, s: Assumptions, now = new Date()): Computed {
  const derived = computeDerived(a);
  const results = computeProjection(a, s, derived);
  const fired = evaluateRules({ answers: a, derived, results, now });
  return {
    derived,
    results,
    blind_spots: applyTopicBump(fired, a.learning_priorities),
    unanswered: [],
    not_assessed: [],
  };
}

const NOT_ASKED = new Set<FieldId>([
  'consent',
  'inflation_rate',
  'investment_growth_rate',
  'cash_growth_rate',
  'property_growth_rate',
  'withdrawal_rate',
]);

const LIST_FIELDS: FieldId[] = ['pensions', 'money_countries', 'learning_priorities'];

/** Unanswered fields become "unknown" (null) where the schema allows it, empty lists otherwise; nothing is invented. */
export function fillUnanswered(partial: Partial<Answers>): Answers {
  const filled: Record<string, unknown> = { ...partial };
  for (const f of FIELDS) {
    if (f.id in filled) continue;
    if (f.allowUnknown) filled[f.id] = null;
  }
  for (const id of LIST_FIELDS) {
    if (!(id in filled)) filled[id] = [];
  }
  return filled as unknown as Answers;
}

/** Questionnaire order including the repeated pensions block, which is asked before beneficiaries_named. */
export const ASKED_ORDER: FieldId[] = FIELDS.flatMap((f) =>
  f.id === 'beneficiaries_named' ? ['pensions' as const, f.id] : [f.id],
).filter((id) => !NOT_ASKED.has(id));

export function unansweredFields(partial: Partial<Answers>, skipped: FieldId[] = []): FieldId[] {
  return ASKED_ORDER.filter((id) => !(id in partial) || skipped.includes(id));
}

/**
 * Assessment over whatever was answered. Rules run only when every field they read was asked
 * (an explicit "don't know" counts as asked); the rest are reported as not assessed rather than guessed.
 * `skipped` lists fields that hold a placeholder but were declined (e.g. pensions left as []).
 * With every field answered this equals runAssessment.
 */
export function runPartialAssessment(
  partial: Partial<Answers>,
  s: Assumptions,
  now = new Date(),
  skipped: FieldId[] = [],
): Computed & { answers: Answers } {
  const answers = fillUnanswered(partial);
  const unanswered = unansweredFields(partial, skipped);
  const asked = new Set<FieldId>((Object.keys(partial) as FieldId[]).filter((id) => !skipped.includes(id)));

  const derived = computeDerived(answers);
  const projected =
    asked.has('age') && asked.has('retire_age') && asked.has('base_currency')
      ? computeProjection(answers, s, derived)
      : emptyResults('not_assessed', null);
  const results: Results =
    projected.mode !== 'not_assessed' && !asked.has('pensions')
      ? { ...projected, is_minimum_estimate: true, missing_fields: [...projected.missing_fields, 'pensions'] }
      : projected;

  const evaluable = RULES.filter((r) => r.inputs.every((id) => asked.has(id)));
  const not_assessed = RULES.filter((r) => !evaluable.includes(r)).map((r) => r.id);
  const fired = evaluateRules({ answers, derived, results, now }).filter((f) => !not_assessed.includes(f.rule_id));

  return {
    answers,
    derived,
    results,
    blind_spots: applyTopicBump(fired, answers.learning_priorities),
    unanswered,
    not_assessed,
  };
}
