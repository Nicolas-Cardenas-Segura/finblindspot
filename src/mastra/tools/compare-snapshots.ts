import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { compareReports } from '../../core/comparison';
import type { Report } from '../../core/report';

export const compareSnapshots = createTool({
  id: 'compare-snapshots',
  description: 'Compare server-owned baseline and current deterministic reports; unavailable values are not treated as improvement.',
  inputSchema: z.strictObject({}),
  execute: async (_input, context) => {
    const baseline = context?.requestContext?.get('baseline') as Report | undefined;
    const current = context?.requestContext?.get('report') as Report | undefined;
    return baseline && current ? compareReports(baseline, current) : [];
  },
});
