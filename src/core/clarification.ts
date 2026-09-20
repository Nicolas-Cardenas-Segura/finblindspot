import { z } from 'zod';
import { answerSchemas, countrySchema, currencySchema, type FinancialProfile } from './profile';
import { formatRange } from './indicators';

export const monetaryDomains = ['income', 'expenses', 'cash', 'debt', 'property'] as const;
const amount = z.number().finite().nonnegative().max(1e12).nullable();
export const residencyDraftSchema = z.strictObject({ country: countrySchema.nullable(), currency: currencySchema.nullable() });
export const moneyDraftSchema = z.strictObject({ min: amount, max: amount, currency: currencySchema.nullable(), period: z.enum(['monthly', 'annual', 'balance']).nullable() });
export const clarificationSchema = z.union([
  z.strictObject({ domain: z.literal('residency'), value: residencyDraftSchema }),
  z.strictObject({ domain: z.enum(monetaryDomains), value: moneyDraftSchema }),
]);
export type ClarificationDraft = z.infer<typeof clarificationSchema>;
export function mergeClarification(previous: ClarificationDraft | null, incoming: ClarificationDraft): ClarificationDraft {
  const prior = previous?.domain === incoming.domain ? previous.value : {};
  const value = Object.fromEntries(Object.entries(incoming.value).map(([key, entry]) => [key, entry ?? (prior as Record<string, unknown>)[key] ?? null]));
  return clarificationSchema.parse({ domain: incoming.domain, value });
}
export function completedClarification(draft: ClarificationDraft): FinancialProfile[ClarificationDraft['domain']] | null {
  const result = answerSchemas[draft.domain].safeParse({ status: 'known', value: draft.value });
  return result.success ? result.data : null;
}
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const currencyNames = new Intl.DisplayNames(['en'], { type: 'currency' });
const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
export function validCurrencyEvidence(currency: string, _evidence: string | null, text: string): boolean {
  const input = normalize(text);
  const name = normalize(currencyNames.of(currency) ?? currency);
  const labels = [currency.toLowerCase(), name, `${name}s`, ...(currency === 'EUR' ? ['€', 'euro', 'euros'] : []), ...(currency === 'GBP' ? ['sterling', 'pounds sterling'] : [])];
  return labels.some(label => {
    let start = input.indexOf(label);
    while (start !== -1) {
      if (!/[a-z]/i.test(input[start - 1] ?? '') && !/[a-z]/i.test(input[start + label.length] ?? '')) return true;
      start = input.indexOf(label, start + 1);
    }
    return false;
  });
}
export function currencyReply(text: string): string | null {
  const value = normalize(text).replace(/[!?]+$/g, '').replace(/^(?:(?:i would|i['’]?d|i) (?:prefer|choose|like)|please use|let['’]?s use|use)\s+/, '').replace(/\s+(?:please|for (?:the |my )?report)$/, '').trim();
  for (const currency of Intl.supportedValuesOf('currency')) {
    const name = normalize(currencyNames.of(currency) ?? currency);
    if ([currency.toLowerCase(), name, `${name}s`, ...(currency === 'EUR' ? ['€', 'euro', 'euros'] : []), ...(currency === 'GBP' ? ['sterling', 'pounds sterling'] : [])].includes(value)) return currency;
  }
  return null;
}
export function clarificationQuestion(draft: ClarificationDraft): string {
  if (draft.domain === 'residency') {
    const { country, currency } = draft.value;
    if (country && !currency) return `I’ve noted ${regionNames.of(country) ?? country}. The app can record amounts in different currencies. Which currency would you prefer for the report? This choice won’t convert your balances; individual amounts can still use their original currencies.`;
    if (currency && !country) return `We can use ${currency} for the report. Which country are you based in?`;
    return 'Which country are you based in, and which single currency would you prefer for the report? Your money can still be held in several currencies.';
  }
  const { min, max, currency, period } = draft.value;
  if (min === null || max === null || max < min) return `Could you give a rough amount or both ends of a range${currency ? ` in ${currency}` : ', together with its currency'}? You can also say unknown.`;
  const amountText = formatRange({ min, max });
  const periodText = period === 'monthly' ? ' per month' : period === 'annual' ? ' per year' : '';
  if (!currency) return `I’ve kept the amount as ${amountText}${periodText}. Which currency is that in? For dollars, please specify which kind, such as US or Canadian dollars.`;
  if (!period) return `I’ve noted ${amountText} ${currency}. Is that a monthly amount, an annual amount, or a balance held right now?`;
  return 'Could you clarify that estimate? You can also say unknown.';
}
