import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createConversationMemory } from '../../src/agent/memory.js';

describe('conversation memory', () => {
  it('retains the last 16 turns oldest-first and forgets a thread', async () => {
    const path = join(tmpdir(), `finblindspot-memory-${randomUUID()}.sqlite`);
    const { conversation } = createConversationMemory({ url: `file:${path}` });

    for (let i = 0; i < 18; i += 1) {
      await conversation.remember('user-1', { role: i % 2 === 0 ? 'user' : 'assistant', text: `turn-${i}` });
    }

    expect(await conversation.history('user-1')).toEqual(
      Array.from({ length: 16 }, (_, i) => ({
        role: (i + 2) % 2 === 0 ? 'user' : 'assistant',
        text: `turn-${i + 2}`,
      })),
    );

    await conversation.forget('user-1');
    expect(await conversation.history('user-1')).toEqual([]);
    await unlink(path).catch(() => undefined);
  });
});
