import type { Assessment } from '../assess/assess.js';
import { FIELDS } from '../questionnaire/fields.js';
import { advanceToVisible } from './stateMachine.js';
import type { InterviewState } from './stateMachine.js';

function hasUnknownPensionValue(previous: Assessment): boolean {
  return (previous.answers.pensions ?? []).some((row) =>
    Object.values(row).some((v) => v === null),
  );
}

function unknownFirstOrder(previous: Assessment): number[] {
  const answers = previous.answers as unknown as Record<string, unknown>;
  const pensionUnknown = hasUnknownPensionValue(previous);
  const first: number[] = [];
  const rest: number[] = [];
  FIELDS.forEach((f, i) => {
    const unknown =
      f.id === 'beneficiaries_named'
        ? answers[f.id] === null || pensionUnknown
        : answers[f.id] === null;
    (unknown ? first : rest).push(i);
  });
  return [...first, ...rest];
}

export function createRevisitState(
  userId: string,
  previous: Assessment,
): InterviewState {
  return advanceToVisible({
    userId,
    answers: {},
    assumptions: { ...previous.assumptions },
    fieldIndex: 0,
    retries: 0,
    mode: 'revisit',
    prefill: previous.answers,
    order: unknownFirstOrder(previous),
    complete: false,
  });
}
