import { randomUUID } from 'node:crypto';
import { LibSQLStore } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import type { MastraDBMessage } from '@mastra/core/agent';
import type { ConversationTurn } from '../llm/prompts.js';

export interface ConversationMemory {
  remember(userId: string, turn: ConversationTurn): Promise<void>;
  history(userId: string): Promise<ConversationTurn[]>;
  forget(userId: string): Promise<void>;
}

const THREAD_PREFIX = 'interview:';

function threadId(userId: string): string {
  return `${THREAD_PREFIX}${userId}`;
}

function messageText(message: MastraDBMessage): string {
  return message.content.parts
    .filter((part): part is typeof part & { type: 'text'; text: string } => part.type === 'text' && 'text' in part)
    .map((part) => part.text)
    .join('');
}

export function createConversationMemory(opts: {
  url: string;
  lastMessages?: number;
}): { memory: Memory; conversation: ConversationMemory } {
  const lastMessages = opts.lastMessages ?? 16;
  const storage = new LibSQLStore({ id: 'finblindspot-memory', url: opts.url });
  const memory = new Memory({
    storage,
    options: {
      lastMessages,
      semanticRecall: false,
      workingMemory: { enabled: false },
    },
  });
  let lastCreatedAt = 0;

  async function ensureThread(userId: string): Promise<string> {
    const id = threadId(userId);
    const existing = await memory.getThreadById({ threadId: id, resourceId: userId });
    if (existing !== null) return id;
    await memory.createThread({ threadId: id, resourceId: userId, title: `Interview ${userId}` });
    return id;
  }

  const conversation: ConversationMemory = {
    async remember(userId, turn) {
      const id = await ensureThread(userId);
      const now = Date.now();
      lastCreatedAt = Math.max(now, lastCreatedAt + 1);
      const message: MastraDBMessage = {
        id: randomUUID(),
        role: turn.role,
        createdAt: new Date(lastCreatedAt),
        threadId: id,
        resourceId: userId,
        content: {
          format: 2,
          parts: [{ type: 'text', text: turn.text }],
        },
      };
      await memory.saveMessages({ messages: [message] });
    },
    async history(userId) {
      const id = threadId(userId);
      const existing = await memory.getThreadById({ threadId: id, resourceId: userId });
      if (existing === null) return [];
      const recalled = await memory.recall({
        threadId: id,
        resourceId: userId,
        perPage: false,
        page: 0,
        includeTotal: false,
      });
      return recalled.messages
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(-lastMessages)
        .map((message) => ({ role: message.role as 'user' | 'assistant', text: messageText(message) }));
    },
    async forget(userId) {
      const id = threadId(userId);
      const existing = await memory.getThreadById({ threadId: id, resourceId: userId });
      if (existing !== null) await memory.deleteThread(id);
    },
  };

  return { memory, conversation };
}
