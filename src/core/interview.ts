import { z } from 'zod';
import { domainSchema, domains, withAnswer, type Domain, type FinancialProfile } from './profile';
import { formatRange } from './indicators';
import { clarificationSchema } from './clarification';

export const quickDomains: Domain[] = ['residency', 'income', 'expenses', 'cash', 'debt'];
export const stateSchema = z.strictObject({ mode: z.enum(['quick', 'full']).nullable(), answered: z.array(domainSchema), editing: domainSchema.nullable(), pending: z.strictObject({ domain: domainSchema, value: z.unknown() }).nullable(), forgetRequested: z.boolean(), simulation: z.boolean(), introduced: z.boolean().default(false), clarification: clarificationSchema.nullable().default(null) });
export type InterviewState = z.infer<typeof stateSchema>;
export const initialState = (): InterviewState => ({ mode: null, answered: [], editing: null, pending: null, forgetRequested: false, simulation: false, introduced: false, clarification: null });
export const selectMode = (state: InterviewState, mode: 'quick' | 'full'): InterviewState => ({ ...state, mode });
export function nextDomain(state: InterviewState): Domain | null {
  return state.editing ?? (state.mode ? (state.mode === 'quick' ? quickDomains : domains).find(d => !state.answered.includes(d)) ?? null : null);
}
export function applyAnswer(profile: FinancialProfile, state: InterviewState, domain: Domain, value: unknown, confirmed = false): { profile: FinancialProfile; state: InterviewState } {
  const patched = withAnswer(profile, domain, value);
  if (!confirmed && state.answered.includes(domain) && JSON.stringify(profile[domain]) !== JSON.stringify(patched[domain])) {
    return { profile, state: { ...state, pending: { domain, value: patched[domain] }, clarification: state.clarification?.domain === domain ? null : state.clarification } };
  }
  return { profile: patched, state: { ...state, answered: [...new Set([...state.answered, domain])], pending: null, editing: null, clarification: state.clarification?.domain === domain ? null : state.clarification } };
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
export const conversationMessages = {
  choosePath: 'We can start with a short check-in about everyday finances, or take a fuller look at pensions, assets and life across countries. Which would feel more useful?',
  complete: 'We have reached the end of this check-in. You can ask to see your report, take a fuller look, or update your figures. What would be most useful?',
  clarify: 'No rush—we can work with a rough estimate, or leave this unknown.',
  offTopic: 'I can help with understanding your financial picture, without recommending what to do with your money.',
  reportLead: 'Thanks for walking through that. Here is a snapshot of what we know and what is still unclear.',
} as const;
export function introductionMessage(retentionDays: number): string {
  return `Hi, I’m MyFinGap, an AI assistant for financial education. We can take a calm look at your finances, one small step at a time.\n\nI won’t recommend investments or financial products. Rough estimates are enough, and you can skip anything. Please don’t share account numbers, credentials or ID details.\n\nYour assessment is saved for ${retentionDays} days. You can delete it with /forget; Telegram keeps its own chat history.`;
}
export const welcomeMessage = (retentionDays: number) => `${introductionMessage(retentionDays)}\n\n${conversationMessages.choosePath}`;
const naturalNavigation = new Map([
  ['show my report', '/report'], ['show me my report', '/report'], ['my report', '/report'], ['can i see my report', '/report'], ['report', '/report'],
  ['continue', '/resume'], ['lets continue', '/resume'], ['resume', '/resume'],
  ['update my figures', '/revisit'], ['update my answers', '/revisit'], ['lets update my figures', '/revisit'], ['check again', '/revisit'],
  ['start fresh', '/forget'], ['start over', '/forget'], ['i want to start fresh', '/forget'], ['can we start fresh', '/forget'], ['reset my assessment', '/forget'], ['forget my data', '/forget'],
  ['skip', '/skip'], ['skip this', '/skip'], ['id rather not say', '/skip'], ['cancel', '/cancel'], ['help', '/help'],
]);
export function conversationCommand(text: string, state: InterviewState): string | null {
  const normalized = text.normalize('NFKC').toLowerCase().replace(/[’']/g, '').replace(/[,!?.]/g, '').replace(/\s+/g, ' ').trim();
  const navigation = naturalNavigation.get(normalized);
  if (navigation) return navigation;
  if (state.pending || state.forgetRequested || (state.mode && nextDomain(state))) return null;
  if (['yes', 'yes please', 'sure', 'sure please', 'okay', 'ok', 'lets start', 'lets go', 'lets do it', 'sounds good'].includes(normalized)) return '/quick';
  if (/\b(?:not|dont|difference|full[- ]time|quick question)\b|^(?:what|whats|how|which|why|explain)\b/.test(normalized)) return null;
  const quick = /\b(?:quick|short|brief)\b/.test(normalized);
  const full = /\b(?:full|fuller|detailed|thorough)\b/.test(normalized);
  return quick === full ? null : quick ? '/quick' : '/full';
}
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
export function acknowledgeAnswer(domain: Domain, answer: FinancialProfile[Domain]): string {
  if (answer.status !== 'known') {
    if (answer.status === 'unknown') return 'That’s okay—we can leave that unknown for now.';
    if (answer.status === 'skipped') return 'No problem—we can skip that.';
    return 'Understood—we’ll mark that as not applicable.';
  }
  const value = answer.value;
  if (typeof value === 'object' && !Array.isArray(value) && 'country' in value) return `Thanks. I’ve noted ${regionNames.of(value.country) ?? value.country}, with ${value.currency} as your reporting currency.`;
  const description = describeAnswer(answer);
  if (domain === 'income') return `Got it—about ${description} coming in.`;
  if (domain === 'expenses') return `Okay, about ${description} for essentials.`;
  if (domain === 'cash') return `Thanks. I’ve noted about ${description} in accessible cash.`;
  if (domain === 'debt') return `Understood—${description} in debt payments.`;
  if (domain === 'goals') return 'Thanks—that gives us some context for what matters to you.';
  return `Thank you. I’ve noted ${description}.`;
}
export function conversationalBridge(message: string, fallback: string): string {
  const text = message.normalize('NFKC').trim();
  return !text || text.length > 180 || /[?¿\d$€£%]|https?:|\b(?:should|must|recommend)\b/i.test(text) ? fallback : text;
}
export const privacyMessages = {
  confirmForget: 'Delete your stored assessment, snapshots, report links and sanitised conversation memory? Reply /confirmforget to delete or /cancel to keep them. This does not delete Telegram history.',
  forgetPending: 'Reply /confirmforget to delete your application data or /cancel to keep it.',
  forgotten: 'Your application assessment, reports and sanitised conversation memory have been deleted. Telegram history is separate. Use /start to begin again.',
} as const;
export const questions: Record<Domain, string> = {
  residency: 'Let’s start with a little context. Which country are you based in, and what currency would you like to use for the numbers?',
  income: 'To get a rough picture of the month, about how much take-home income comes in, and in which currency? A rounded number or range is fine.',
  expenses: 'And roughly how much goes towards essentials each month—things like housing, food and bills—and in which currency? It doesn’t need to be exact.',
  cash: 'That gives us the everyday picture. Roughly how much cash could you access if something unexpected came up, and in which currency?',
  debt: 'One last part of the short check: about how much goes towards debt payments each month, and in which currency? If there are none, just say so.',
  age: 'A little life context can help too. About how old are you? An estimate is enough; this check is for adults.',
  previousCountries: 'Life across borders can leave a few loose ends. Which other countries have you lived in, if any?',
  pensions: 'Pensions can be easy to lose track of after moving. What do you know about any current or old pots—the countries, rough balances and currencies, contributions and whether their status is clear? Say if the list is incomplete; no provider names or account details are needed.',
  investments: 'Outside pensions and property, what broad investment categories do you hold, if any—equities, bonds, funds or other—with rough totals, currencies and countries? An incomplete list is okay; just say so and leave out product names.',
  property: 'If you own property, about how much is it worth, and in which currency? No address is needed, and zero is fine if you don’t own any.',
  dependants: 'To understand the wider picture, does anyone depend on your income, and if so, how many people?',
  protection: 'How clear do you feel about the insurance or protection you have? You can say known, uncertain or none, without naming providers.',
  goals: 'Is there a financial goal you’d particularly like to understand better? A general description is plenty.',
  retirementAge: 'Have you got a rough retirement age in mind? It’s completely fine if you haven’t decided.',
  confidence: 'Before we wrap up, how confident do you feel about understanding your finances, from 1 (not confident) to 5 (very confident)? There’s no right answer.',
};
