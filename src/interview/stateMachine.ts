import { DEFAULT_ASSUMPTIONS } from '../config/assumptions.js';
import { FIELDS, PENSION_FIELDS } from '../questionnaire/fields.js';
import type { FieldDef } from '../questionnaire/fields.js';
import type {
  Answers,
  Assumptions,
  FieldId,
  PensionRow,
} from '../questionnaire/schema.js';

export interface InterviewState {
  userId: string;
  answers: Partial<Answers>;
  assumptions: Assumptions;
  pensionDraft?: Partial<PensionRow>;
  fieldIndex: number;
  pensionFieldIndex?: number;
  retries: number;
  mode: 'assess' | 'revisit';
  prefill?: Answers;
  order?: number[];
  complete: boolean;
  awaitingNudgeChoice?: boolean;
}

const ANOTHER_PENSION_INDEX = -1;

export const ANOTHER_PENSION_FIELD: FieldDef = {
  id: 'pensions',
  section: 'D',
  prompt: 'Another pension?',
  rationale: 'Lets you add every pension you hold, one at a time.',
  type: 'enum',
  options: ['yes', 'no'],
  allowUnknown: false,
};

const ASSUMPTION_IDS = new Set<string>(Object.keys(DEFAULT_ASSUMPTIONS));

function isAssumptionId(id: FieldId): id is keyof Assumptions {
  return ASSUMPTION_IDS.has(id);
}

function fieldCount(s: InterviewState): number {
  return s.order ? s.order.length : FIELDS.length;
}

function fieldAt(s: InterviewState, i: number): FieldDef | undefined {
  const index = s.order ? s.order[i] : i;
  return index === undefined ? undefined : FIELDS[index];
}

export function advanceToVisible(s: InterviewState): InterviewState {
  const answers = { ...s.answers } as Record<string, unknown>;
  let i = s.fieldIndex;
  const n = fieldCount(s);
  while (i < n) {
    const f = fieldAt(s, i)!;
    const view =
      s.mode === 'revisit' && s.prefill ? { ...s.prefill, ...answers } : answers;
    if (!f.showIf || f.showIf(view as Partial<Answers>)) break;
    answers[f.id] = 'n/a';
    i += 1;
  }
  return {
    ...s,
    answers: answers as Partial<Answers>,
    fieldIndex: i,
    complete: i >= n,
  };
}

function inPensionPhase(s: InterviewState): boolean {
  return s.pensionFieldIndex !== undefined || s.answers.pensions === undefined;
}

export function createState(userId: string): InterviewState {
  return advanceToVisible({
    userId,
    answers: {},
    assumptions: { ...DEFAULT_ASSUMPTIONS },
    fieldIndex: 0,
    retries: 0,
    mode: 'assess',
    complete: false,
  });
}

export function currentField(s: InterviewState): FieldDef | null {
  if (s.complete || s.fieldIndex >= fieldCount(s)) return null;
  const f = fieldAt(s, s.fieldIndex)!;
  if (f.id === 'beneficiaries_named' && inPensionPhase(s)) {
    if (s.pensionFieldIndex === ANOTHER_PENSION_INDEX)
      return ANOTHER_PENSION_FIELD;
    return PENSION_FIELDS[s.pensionFieldIndex ?? 0]!;
  }
  return f;
}

function resolveSame(
  s: InterviewState,
  f: FieldDef,
  value: unknown,
): unknown {
  if (value !== 'same' || s.mode !== 'revisit' || !s.prefill) return value;
  const rows = s.prefill.pensions ?? [];
  if (f.id === 'pensions') {
    return (s.answers.pensions?.length ?? 0) < rows.length ? 'yes' : 'no';
  }
  if (f.repeat === 'pensions') {
    const row = rows[s.answers.pensions?.length ?? 0];
    if (!row || !(f.id in row)) return value;
    return (row as unknown as Record<string, unknown>)[f.id];
  }
  if (!(f.id in s.prefill)) return value;
  return (s.prefill as unknown as Record<string, unknown>)[f.id];
}

export function applyAnswer(
  s: InterviewState,
  rawValue: unknown,
): InterviewState {
  const f = currentField(s);
  if (!f) return s;
  const value = resolveSame(s, f, rawValue);

  if (f.id === 'pensions') {
    if (value === 'yes')
      return { ...s, pensionDraft: {}, pensionFieldIndex: 0 };
    const { pensionDraft: _draft, pensionFieldIndex: _idx, ...rest } = s;
    return {
      ...rest,
      answers: { ...s.answers, pensions: s.answers.pensions ?? [] },
    };
  }

  if (f.repeat === 'pensions') {
    const idx = s.pensionFieldIndex ?? 0;
    const draft = {
      ...(s.pensionDraft ?? {}),
      [f.id]: value,
    } as Partial<PensionRow>;
    if (idx + 1 < PENSION_FIELDS.length) {
      return { ...s, pensionDraft: draft, pensionFieldIndex: idx + 1 };
    }
    const pensions = [...(s.answers.pensions ?? []), draft as PensionRow];
    const { pensionDraft: _draft, ...rest } = s;
    return {
      ...rest,
      answers: { ...s.answers, pensions },
      pensionFieldIndex: ANOTHER_PENSION_INDEX,
    };
  }

  if (isAssumptionId(f.id)) {
    const assumptions =
      typeof value === 'number'
        ? { ...s.assumptions, [f.id]: value }
        : s.assumptions;
    return advanceToVisible({
      ...s,
      assumptions,
      fieldIndex: s.fieldIndex + 1,
      retries: 0,
    });
  }

  const answers = { ...s.answers, [f.id]: value } as Partial<Answers>;
  return advanceToVisible({
    ...s,
    answers,
    fieldIndex: s.fieldIndex + 1,
    retries: 0,
  });
}

export function applyCorrection(
  s: InterviewState,
  fieldId: FieldId,
  value: unknown,
): InterviewState {
  if (isAssumptionId(fieldId)) {
    if (typeof value !== 'number')
      throw new Error(`Invalid assumption value for ${fieldId}`);
    return { ...s, assumptions: { ...s.assumptions, [fieldId]: value } };
  }
  if (!(fieldId in s.answers))
    throw new Error(`Field ${fieldId} has not been answered`);
  return {
    ...s,
    answers: { ...s.answers, [fieldId]: value } as Partial<Answers>,
  };
}

export function isComplete(s: InterviewState): boolean {
  return s.complete;
}
