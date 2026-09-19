import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { createReport } from '../../core/report';
import type { FinancialProfile } from '../../core/profile';

export const runScorecard = createTool({
  id: 'run-scorecard',
  description: 'Read deterministic indicators from the current server-owned profile. Never supply or choose scores.',
  inputSchema: z.strictObject({}),
  execute: async (_input, context) => {
    const profile = context?.requestContext?.get('profile') as FinancialProfile | undefined;
    if (!profile) throw new Error('Assessment context required');
    return createReport(profile, new Date().toISOString());
  },
});
