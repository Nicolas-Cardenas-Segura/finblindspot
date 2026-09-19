import { expect, it } from 'vitest';
import { LibSQLStore } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { ConversationMemory } from '../src/storage/conversation-memory';

it('stores only explicitly supplied sanitised context and forgets its thread', async () => {
  const store = new LibSQLStore({ id: 'memory-check', url: ':memory:' });
  await store.init();
  const memory = new Memory({ storage: store, options: { readOnly: true, semanticRecall: false, generateTitle: false } });
  const history = new ConversationMemory(memory);
  try {
    await history.remember('eval:synthetic', 'Validated income estimate recorded.', 'What are your essential monthly expenses?');
    const result = await memory.recall({ threadId: 'eval:synthetic', resourceId: 'eval:synthetic', perPage: 10 });
    expect(result.messages).toHaveLength(2);
    await history.forget('eval:synthetic');
    expect(await memory.getThreadById({ threadId: 'eval:synthetic' })).toBeNull();
    await expect(history.forget('eval:absent')).resolves.toBeUndefined();
  } finally { await store.close(); }
});
