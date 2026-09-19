import 'dotenv/config';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { LibSQLStore } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { readConfig } from '../config/env';
import { NEBIUS_BASE_URL } from '../config/models';
import { createNebiusClient } from '../nebius/client';
import { OutboundGuard } from '../guardrail/classifier';
import { AssessmentRepository } from '../storage/assessment-repository';
import { ConversationMemory } from '../storage/conversation-memory';
import { AnswerExtractor } from '../application/extraction';
import { AssessmentService } from '../application/handle-turn';
import { evalRoutes } from '../server/eval-routes';
import { reportRoutes } from '../server/report-routes';
import { webRoutes } from '../server/web-routes';
import { ExplanationWriter } from '../application/explanation-writer';
import { instructions } from './instructions';
import { PrivateChannelState, telegramChannels, WEBHOOK_PATH } from './telegram';
import { recordAnswer } from './tools/record-answer';
import { runScorecard } from './tools/run-scorecard';
import { compareSnapshots } from './tools/compare-snapshots';

const config = readConfig();
const storage = new LibSQLStore({ id: 'blindspot-memory', url: config.DATABASE_URL });
const memory = new Memory({ storage, options: { readOnly: true, lastMessages: 4, semanticRecall: false, workingMemory: { enabled: false }, generateTitle: false } });
const repository = new AssessmentRepository(config.APP_DATABASE_URL, config.RETENTION_DAYS);
const guard = new OutboundGuard(createNebiusClient(config), config.NEBIUS_CLASSIFIER_MODEL);
const conversationMemory = new ConversationMemory(memory);
let ready: Promise<AssessmentService> | undefined;
const getService = (): Promise<AssessmentService> => ready ??= (async () => {
  await repository.init();
  const runtime = new AssessmentService(repository, conversationMemory, new AnswerExtractor(() => agent, () => !!config.NEBIUS_API_KEY), guard, config, new ExplanationWriter(() => agent, () => !!config.NEBIUS_API_KEY));
  await runtime.purgeExpired();
  setInterval(() => runtime.purgeExpired().catch(() => console.error('retention_cleanup_failed')), 60000).unref();
  return runtime;
})();
const agent = new Agent({
  id: 'financial-blindspot', name: 'Financial Blindspot', instructions,
  model: () => {
    if (!config.NEBIUS_API_KEY) throw new Error('NEBIUS_API_KEY is required');
    return { providerId: 'nebius', modelId: config.NEBIUS_INTERVIEW_MODEL, url: NEBIUS_BASE_URL, apiKey: config.NEBIUS_API_KEY };
  },
  memory,
  tools: { recordAnswer, runScorecard, compareSnapshots },
  channels: telegramChannels(config, new PrivateChannelState(storage.stores.memory!), getService),
});
export const mastra = new Mastra({
  agents: { agent }, storage, logger: false,
  server: {
    host: '0.0.0.0', port: config.PORT, apiPrefix: '/internal', studioBase: '/disabled-studio', drainTimeout: 25000,
    build: { swaggerUI: false, openAPIDocs: false },
    bodySizeLimit: 20000,
    onError: (_error, c) => c.json({ error: 'request_failed' }, 500),
    cors: { origin: config.PUBLIC_BASE_URL, allowMethods: ['GET', 'POST'], credentials: false },
    auth: { protected: [/^\/internal(?:\/|$)/], public: [[WEBHOOK_PATH, 'POST']], authenticateToken: async () => null },
    apiRoutes: [...evalRoutes(config, getService, repository), ...reportRoutes(repository, getService, config), ...webRoutes],
  },
});
