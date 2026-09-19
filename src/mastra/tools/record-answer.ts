import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { domainSchema, parseAnswer } from '../../core/profile';
import { checkInput } from '../../guardrail/input-policy';

export const recordAnswer = createTool({
  id: 'record-answer',
  description: 'Validate one proposed answer. This does not persist data, select identity, or confirm corrections; application code owns those decisions.',
  inputSchema: z.strictObject({ domain: domainSchema, answerJson: z.string().max(6000) }),
  outputSchema: z.strictObject({ domain: domainSchema, answerJson: z.string() }),
  execute: async ({ domain, answerJson }) => {
    if (!checkInput(answerJson).accepted) throw new Error('Unsupported answer content');
    return { domain, answerJson: JSON.stringify(parseAnswer(domain, JSON.parse(answerJson))) };
  },
});
