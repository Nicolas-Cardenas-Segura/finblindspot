import { z } from 'zod';
import { domainSchema, domains, withAnswer, type Domain, type FinancialProfile } from './profile';
import { formatRange } from './indicators';

export const quickDomains: Domain[] = ['residency', 'income', 'expenses', 'cash', 'debt'];
export const stateSchema = z.strictObject({ mode: z.enum(['quick', 'full']).nullable(), answered: z.array(domainSchema), editing: domainSchema.nullable(), pending: z.strictObject({ domain: domainSchema, value: z.unknown() }).nullable(), forgetRequested: z.boolean(), simulation: z.boolean(), introduced: z.boolean().default(false) });
export type InterviewState = z.infer<typeof stateSchema>;
export const initialState = (): InterviewState => ({ mode: null, answered: [], editing: null, pending: null, forgetRequested: false, simulation: false, introduced: false });
export const selectMode = (state: InterviewState, mode: 'quick' | 'full'): InterviewState => ({ ...state, mode });
export function nextDomain(state: InterviewState): Domain | null {
  return state.editing ?? (state.mode ? (state.mode === 'quick' ? quickDomains : domains).find(d => !state.answered.includes(d)) ?? null : null);
}
export function applyAnswer(profile: FinancialProfile, state: InterviewState, domain: Domain, value: unknown, confirmed = false): { profile: FinancialProfile; state: InterviewState } {
  const patched = withAnswer(profile, domain, value);
  if (!confirmed && state.answered.includes(domain) && JSON.stringify(profile[domain]) !== JSON.stringify(patched[domain])) {
    return { profile, state: { ...state, pending: { domain, value: patched[domain] } } };
  }
  return { profile: patched, state: { ...state, answered: [...new Set([...state.answered, domain])], pending: null, editing: null } };
}
export function confirmPending(profile: FinancialProfile, state: InterviewState, accepted: boolean): { profile: FinancialProfile; state: InterviewState } {
  if (!state.pending) return { profile, state };
  return accepted ? applyAnswer(profile, state, state.pending.domain, state.pending.value, true) : { profile, state: { ...state, pending: null, editing: null } };
}
export function describeAnswer(answer: FinancialProfile[Domain]): string {
  if (answer.status !== 'known') return answer.status.replace('_', ' ');
  const value = answer.value;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'none';
  if ('min' in value) return `${formatRange(value)} ${value.currency}${value.period === 'balance' ? '' : value.period === 'annual' ? ' per year' : ' per month'}`;
  if ('country' in value) return `${value.country}; base currency ${value.currency}`;
  return 'pots' in value ? `${value.pots.length} pension pots; ${value.complete ? 'complete' : 'incomplete'} list` : `${value.assets.length} broad investment categories; ${value.complete ? 'complete' : 'incomplete'} list`;
}
export const questions: Record<Domain, string> = {
  residency: 'Which country do you live in, and which currency would you like to use for this assessment?',
  income: 'Approximately how much take-home income do you receive each month? Include the currency; a range is fine.',
  expenses: 'Approximately how much is your essential monthly expenditure? Include housing, food and bills, and the currency.',
  cash: 'Approximately how much accessible cash savings do you have? Include the currency, without account details.',
  debt: 'How much do your debt payments total per month, in which currency? If none, say zero.',
  age: 'What is your approximate age? This check is for adults.',
  previousCountries: 'Which other countries have you lived in? Country names only, or none.',
  pensions: 'What pension pots do you know about? For each: country, approximate balance/currency, regular contribution and whether its status is known. No provider names or account numbers; unknown is fine. Is this a complete list?',
  investments: 'What broad investment categories do you hold: equities, bonds, funds or other? Give approximate totals, currencies and countries, not specific products. Is this the complete list? If none, say none.',
  property: 'What is the approximate value of property you own, in which currency? No address; say zero if none.',
  dependants: 'How many people depend on your income?',
  protection: 'Do you know what insurance and protection you have? Say known, uncertain, or none; no provider details.',
  goals: 'What is one major financial goal you want to understand better? Keep it general, without identifying details.',
  retirementAge: 'At approximately what age do you expect to retire? Unknown is a valid answer.',
  confidence: 'How confident do you feel about understanding your finances, from 1 (not confident) to 5 (very confident)?',
};
