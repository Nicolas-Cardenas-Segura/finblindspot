import type { Agent } from '@mastra/core/agent';
import type { Report } from '../core/report';
import { explanationSchema, selectExplanations } from '../core/explanation';

export class ExplanationWriter {
  constructor(private agent: () => Agent, private configured: () => boolean) {}
  async write(report: Report, owner: string): Promise<Report['explanations']> {
    if (!this.configured() || !report.blindspots.length) return {};
    try {
      const result = await this.agent().generate(JSON.stringify({ task: 'Select educational emphasis for the provided server-ranked indicators, without adding facts or changing ranking. Select uncertainty when an indicator cannot be assessed; otherwise select definition. Do not generate advice or numbers.', rankedIndicators: report.blindspots, facts: report.cards }), {
        structuredOutput: { schema: explanationSchema, errorStrategy: 'strict', jsonPromptInjection: false },
        memory: { thread: owner, resource: owner, options: { readOnly: true, lastMessages: false, semanticRecall: false } },
        activeTools: [], maxSteps: 1, modelSettings: { maxOutputTokens: 250, temperature: 0, maxRetries: 0 }, abortSignal: AbortSignal.timeout(10000),
      });
      return selectExplanations(report, result.object);
    } catch { return {}; }
  }
}
