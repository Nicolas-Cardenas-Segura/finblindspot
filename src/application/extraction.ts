import { z } from 'zod';
import type { Agent } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import { answerSchemas, parseAnswer, type Domain, type FinancialProfile } from '../core/profile';
import { questions } from '../core/interview';
import { clarificationSchema, residencyDraftSchema, moneyDraftSchema, monetaryDomains, mergeClarification, completedClarification, validCurrencyEvidence, currencyReply, type ClarificationDraft } from '../core/clarification';
import { checkInput } from '../guardrail/input-policy';

export type Extraction = { kind: 'answer'; answer: FinancialProfile[Domain] } | { kind: 'clarify' | 'off_topic'; message: string; draft?: ClarificationDraft };
export function extractionSchema(domain: Domain) {
  const moneyDomain = monetaryDomains.find(value => value === domain);
  const partialSchema = domain === 'residency' ? residencyDraftSchema : moneyDomain ? moneyDraftSchema : z.null();
  const answerSchema = domain === 'residency' || moneyDomain ? answerSchemas[domain].options[0] : answerSchemas[domain];
  return z.strictObject({ kind: z.enum(['answer', 'clarify', 'off_topic']), answer: answerSchema.nullable(), partial: partialSchema.nullable(), currencyEvidence: z.string().max(80).nullable(), reportingCurrencyChosen: z.boolean(), message: z.string().max(300) });
}
const countryNames = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
const openingCountryCodes = Array.from({ length: 676 }, (_, index) => String.fromCharCode(65 + Math.floor(index / 26), 65 + index % 26)).filter(code => countryNames.of(code) !== undefined && !['EU', 'EZ', 'UN', 'XA', 'XB', 'ZZ'].includes(code));
const openingCountrySchema = z.enum(openingCountryCodes as [string, ...string[]]).describe('Current country as an ISO alpha-2 code: Spain is ES, United Kingdom is GB. Never infer country from a currency.');
export class AnswerExtractor {
  constructor(private agent: () => Agent, private configured: () => boolean) {}
  private async generate<T extends z.ZodType>(owner: string, schema: T, payload: unknown, profile: FinancialProfile): Promise<z.infer<T>> {
    if (!this.configured()) throw new Error('Model unavailable');
    const requestContext = new RequestContext();
    requestContext.set('profile', profile);
    const result = await this.agent().generate(JSON.stringify(payload), {
      memory: { thread: owner, resource: owner, options: { readOnly: true, lastMessages: 4, semanticRecall: false } },
      requestContext,
      structuredOutput: { schema, errorStrategy: 'strict', jsonPromptInjection: false },
      activeTools: [],
      maxSteps: 1,
      modelSettings: { maxOutputTokens: 1200, temperature: 0, maxRetries: 0 },
      abortSignal: AbortSignal.timeout(20000),
    });
    return schema.parse(result.object);
  }
  async opening(owner: string, text: string, profile: FinancialProfile): Promise<{ country: string | null; message: string }> {
    const schema = z.strictObject({ country: openingCountrySchema.nullable(), message: z.string().max(180) });
    return this.generate(owner, schema, { task: 'Acknowledge this opening financial concern without recommending actions. Extract only an explicitly stated current country, or null. Do not infer country from currencies. Return a brief acknowledgement without questions or numbers; the app will offer a path choice.', userAnswer: text }, profile);
  }
  async extract(owner: string, domain: Domain, text: string, profile: FinancialProfile, previous: ClarificationDraft | null = null): Promise<Extraction> {
    const moneyDomain = monetaryDomains.find(value => value === domain);
    if (previous?.domain === domain && previous.value.currency === null) {
      const currency = currencyReply(text);
      if (currency) {
        const draft = clarificationSchema.parse({ domain, value: { ...previous.value, currency } });
        const complete = completedClarification(draft);
        return complete ? { kind: 'answer', answer: complete } : { kind: 'clarify', message: '', draft };
      }
    }
    if (/^(?:i (?:really |honestly )?(?:don['’]?t|do not) know|i(?:['’]m| am) not sure|not sure|no idea|unknown)[.! ]*$/i.test(text.trim())) return { kind: 'answer', answer: { status: 'unknown' } };
    if (/^(?:skip(?: this(?: question)?)?|i['’]?d rather not (?:say|answer)|prefer not to (?:say|answer))[.! ]*$/i.test(text.trim())) return { kind: 'answer', answer: { status: 'skipped' } };
    if (/^not applicable[.! ]*$/i.test(text.trim())) return { kind: 'answer', answer: { status: 'not_applicable' } };
    const schema = extractionSchema(domain);
    let prior = previous?.domain === domain ? previous : null;
    const parsed = await this.generate(owner, schema, {
      domain, question: questions[domain], userAnswer: text, validatedPartialAnswer: prior?.value ?? null,
      task: 'Use validated partial fields from earlier turns. For incomplete residency or money answers, choose clarify, set answer to null and return partial with each available field and null for missing fields. Incomplete or ambiguous answers are NOT not-applicable or skipped. Never discard an explicitly stated country because currency is unresolved. A list of currencies held is not a reporting-currency choice: reportingCurrencyChosen must be false unless one reporting currency was actually selected. Unqualified dollars are ambiguous. currencyEvidence must be the exact currency code, symbol or currency name from this user answer, or null. Never invent evidence, infer a currency from the profile, add unlike currencies, or convert amounts. If the user supplies only the previously missing field, combine it with the validated partial answer. Unknown about wealth does not mean unknown about their stated country.',
    }, profile);
    if (parsed.kind === 'off_topic') return { kind: 'off_topic', message: parsed.message };
    if (parsed.answer && parsed.answer.status !== 'known' && parsed.kind === 'answer') return { kind: 'answer', answer: parseAnswer(domain, parsed.answer) };
    if (domain === 'residency' || moneyDomain) {
      const candidate = parsed.kind === 'answer' && parsed.answer?.status === 'known' ? parsed.answer.value : parsed.partial ?? (parsed.answer?.status === 'known' ? parsed.answer.value : null);
      if (candidate) {
        const value = (domain === 'residency' ? residencyDraftSchema : moneyDraftSchema).parse(candidate);
        const currencyIsEvidenced = value.currency !== null && validCurrencyEvidence(value.currency, parsed.currencyEvidence, text);
        if (!currencyIsEvidenced && parsed.currencyEvidence && text.toLowerCase().includes(parsed.currencyEvidence.toLowerCase()) && prior && (domain !== 'residency' || parsed.reportingCurrencyChosen)) prior = clarificationSchema.parse({ domain: prior.domain, value: { ...prior.value, currency: null } });
        if (!currencyIsEvidenced || (domain === 'residency' && !parsed.reportingCurrencyChosen)) value.currency = null;
        if (moneyDomain === 'debt' && 'min' in value && value.min === 0 && value.max === 0 && /\b(?:no|none|zero|nothing)\b/i.test(text)) {
          value.currency ??= profile.income.status === 'known' ? profile.income.value.currency : profile.residency.status === 'known' ? profile.residency.value.currency : null;
        }
        const incoming = clarificationSchema.parse({ domain, value });
        const draft = mergeClarification(prior, incoming);
        if (!checkInput(JSON.stringify(draft)).accepted) throw new Error('Unsupported partial data');
        const complete = completedClarification(draft);
        return complete ? { kind: 'answer', answer: complete } : { kind: 'clarify', message: parsed.message, draft };
      }
    }
    if (parsed.kind !== 'answer' || parsed.answer === null) return { kind: 'clarify', message: parsed.message };
    const answer = parseAnswer(domain, parsed.answer);
    if (!checkInput(JSON.stringify(answer)).accepted) throw new Error('Unsupported extracted data');
    return { kind: 'answer', answer };
  }
}
