import { z } from 'zod';
import type { Agent } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import { answerSchemas, parseAnswer, type Domain, type FinancialProfile } from '../core/profile';
import { questions } from '../core/interview';
import { checkInput } from '../guardrail/input-policy';

export type Extraction = { kind: 'answer'; answer: FinancialProfile[Domain] } | { kind: 'clarify' | 'off_topic'; message: string };
export class AnswerExtractor {
  constructor(private agent: () => Agent, private configured: () => boolean) {}
  async extract(owner: string, domain: Domain, text: string, profile: FinancialProfile): Promise<Extraction> {
    if (!this.configured()) throw new Error('Model unavailable');
    const schema = z.strictObject({ kind: z.enum(['answer', 'clarify', 'off_topic']), answer: answerSchemas[domain].nullable(), message: z.string().max(300) });
    const requestContext = new RequestContext();
    requestContext.set('profile', profile);
    const result = await this.agent().generate(JSON.stringify({ domain, question: questions[domain], userAnswer: text, knownBaseCurrency: profile.residency.status === 'known' ? profile.residency.value.currency : null }), {
      memory: { thread: owner, resource: owner, options: { readOnly: true, lastMessages: 4, semanticRecall: false } },
      requestContext,
      structuredOutput: { schema, errorStrategy: 'strict', jsonPromptInjection: false },
      activeTools: [],
      maxSteps: 1,
      modelSettings: { maxOutputTokens: 1200, temperature: 0, maxRetries: 0 },
      abortSignal: AbortSignal.timeout(20000),
    });
    const parsed = schema.parse(result.object);
    if (parsed.kind !== 'answer' || parsed.answer === null) return { kind: parsed.kind === 'off_topic' ? 'off_topic' : 'clarify', message: parsed.message || questions[domain] };
    const answer = parseAnswer(domain, parsed.answer);
    if (!checkInput(JSON.stringify(answer)).accepted) throw new Error('Unsupported extracted data');
    return { kind: 'answer', answer };
  }
}
