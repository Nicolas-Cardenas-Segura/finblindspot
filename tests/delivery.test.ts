import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { Agent } from '@mastra/core/agent';
import { LibSQLStore } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { AssessmentRepository } from '../src/storage/assessment-repository';
import { ConversationMemory } from '../src/storage/conversation-memory';
import { AnswerExtractor } from '../src/application/extraction';
import { ExplanationWriter } from '../src/application/explanation-writer';
import { AssessmentService } from '../src/application/handle-turn';
import { OutboundGuard } from '../src/guardrail/classifier';
import { readConfig } from '../src/config/env';

it('does not commit a turn or publish a report without classifier approval', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'blindspot-delivery-'));
  const repository = new AssessmentRepository(`file:${join(dir, 'app.db')}`, 7);
  const store = new LibSQLStore({ id: 'delivery-memory', url: ':memory:' });
  const memory = new Memory({ storage: store, options: { semanticRecall: false, readOnly: true } });
  const agent = new Agent({ id: 'offline-check', name: 'Offline delivery check', instructions: 'No model calls in this check.', model: () => { throw new Error('Model calls are disabled'); } });
  try {
    await repository.init(); await store.init();
    const service = new AssessmentService(repository, new ConversationMemory(memory), new AnswerExtractor(() => agent, () => false), new OutboundGuard(null, 'unconfigured'), readConfig({}), new ExplanationWriter(() => agent, () => false));
    const owner = `eval:${randomUUID()}`;
    expect(await service.turn(owner, '1', '/quick')).toBeNull();
    expect(await repository.load(owner)).toBeNull();
    await repository.createSession(owner);
    expect(await service.turn(owner, '2', '/report')).toBeNull();
    expect(await repository.baseline(owner)).toBeNull();
    expect(await memory.getThreadById({ threadId: owner })).toBeNull();
    await expect(service.turn('telegram:other-user', '3', '/report')).rejects.toThrow('Invalid turn identity');
    expect(await service.turn(owner, '4', '/forget')).toBeNull();
    expect((await repository.load(owner))?.state.forgetRequested).toBe(true);
    expect(await service.turn(owner, '5', '/confirmforget')).toBeNull();
    expect(await repository.load(owner)).toBeNull();
  } finally { repository.close(); await store.close(); await rm(dir, { recursive: true, force: true }); }
});
