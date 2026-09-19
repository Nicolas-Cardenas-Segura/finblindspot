import { expect, it } from 'vitest';
import { sanitiseTelegramUpdate, REJECTED_INPUT } from '../src/mastra/telegram-input';

const envelope = (text?: string) => ({ update_id: 1, message: { message_id: 2, date: 123, text, chat: { id: 42, type: 'private', first_name: 'Personal name' }, from: { id: 42, is_bot: false, first_name: 'Personal name', username: 'private-handle' }, document: { file_id: 'private-file' }, reply_to_message: { text: 'older sensitive text' } } });
it('replaces sensitive text before the SDK can parse or cache it', () => {
  const result = sanitiseTelegramUpdate(envelope('My card number is 4111 1111 1111 1111'));
  expect(result?.message.text).toBe(REJECTED_INPUT);
  expect(JSON.stringify(result)).not.toContain('4111');
  expect(JSON.stringify(result)).not.toContain('Personal name');
  expect(JSON.stringify(result)).not.toContain('private-file');
  expect(JSON.stringify(result)).not.toContain('older sensitive');
});
it('allows only private human messages and replaces documents with an unsupported-input marker', () => {
  const group = envelope('hi'); group.message.chat.type = 'group';
  expect(sanitiseTelegramUpdate(group)).toBeNull();
  expect(sanitiseTelegramUpdate(envelope())?.message.text).toBe(REJECTED_INPUT);
  expect(sanitiseTelegramUpdate(envelope('/start'))?.message.text).toBe('/start');
});
