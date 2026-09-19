import { randomUUID } from 'node:crypto';
import type { Memory } from '@mastra/memory';

export class ConversationMemory {
  constructor(readonly memory: Memory) {}
  async remember(owner: string, summary: string, response: string): Promise<void> {
    if (!await this.memory.getThreadById({ threadId: owner })) await this.memory.createThread({ threadId: owner, resourceId: owner, title: 'Financial education assessment' });
    const createdAt = new Date();
    await this.memory.saveMessages({ messages: [
      { id: randomUUID(), threadId: owner, resourceId: owner, role: 'user', createdAt, content: { format: 2, parts: [{ type: 'text', text: summary }] } },
      { id: randomUUID(), threadId: owner, resourceId: owner, role: 'assistant', createdAt, content: { format: 2, parts: [{ type: 'text', text: response }] } },
    ] });
  }
  async forget(owner: string): Promise<void> { await this.memory.deleteThread(owner); }
}
