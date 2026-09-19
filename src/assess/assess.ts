import type { Answers, Assumptions, Currency } from '../questionnaire/schema.js';
import type { Derived } from '../engine/derived.js';
import { computeDerived } from '../engine/derived.js';
import type { Results } from '../engine/projection.js';
import { computeProjection } from '../engine/projection.js';
import type { FiredRule } from '../rules/evaluate.js';
import { applyTopicBump, evaluateRules } from '../rules/evaluate.js';

export interface Assessment {
  id: string;
  user_id: string;
  created_at: string;
  status: 'draft' | 'complete';
  base_currency: Currency;
  answers: Answers;
  assumptions: Assumptions;
  derived: Derived;
  results: Results;
  blind_spots: FiredRule[];
}

export function runAssessment(
  a: Answers,
  s: Assumptions,
  now = new Date(),
): Pick<Assessment, 'derived' | 'results' | 'blind_spots'> {
  const derived = computeDerived(a);
  const results = computeProjection(a, s, derived);
  const fired = evaluateRules({ answers: a, derived, results, now });
  return { derived, results, blind_spots: applyTopicBump(fired, a.learning_priorities) };
}
