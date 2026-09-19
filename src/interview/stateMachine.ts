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

function skipHidden(s: InterviewState): InterviewState {
  const answers = { ...s.answers } as Record<string, unknown>;
  let i = s.fieldIndex;
  while (i < FIELDS.length) {
    const f = FIELDS[i]!;
    if (!f.showIf || f.showIf(answers as Partial<Answers>)) break;
    answers[f.id] = 'n/a';
    i += 1;
  }
  return {
    ...s,
    answers: answers as Partial<Answers>,
    fieldIndex: i,
    complete: i >= FIELDS.length,
  };
}

function inPensionPhase(s: InterviewState): boolean {
  return s.pensionFieldIndex !== undefined || s.answers.pensions === undefined;
}

export function createState(userId: string): InterviewState {
  return skipHidden({
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
  if (s.complete || s.fieldIndex >= FIELDS.length) return null;
  const f = FIELDS[s.fieldIndex]!;
  if (f.id === 'beneficiaries_named' && inPensionPhase(s)) {
    if (s.pensionFieldIndex === ANOTHER_PENSION_INDEX)
      return ANOTHER_PENSION_FIELD;
    return PENSION_FIELDS[s.pensionFieldIndex ?? 0]!;
  }
  return f;
}

export function applyAnswer(s: InterviewState, value: unknown): InterviewState {
  const f = currentField(s);
  if (!f) return s;

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
    return skipHidden({
      ...s,
      assumptions,
      fieldIndex: s.fieldIndex + 1,
      retries: 0,
    });
  }

  const answers = { ...s.answers, [f.id]: value } as Partial<Answers>;
  return skipHidden({
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
