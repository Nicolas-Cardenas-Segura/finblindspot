import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { configuredAI, grounded, NebiusConversation } from '../src/ai.js';
import { known } from '../src/profile.js';
import { AssessmentService } from '../src/interview.js';
import { Store } from '../src/store.js';
import { chunks, createBot } from '../src/telegram-bot.js';

const mocks = vi.hoisted(() => ({ generate: vi.fn(), completion: vi.fn() }));
vi.mock('@mastra/core/agent', () => ({
  Agent: class { generate = mocks.generate; },
}));
vi.mock('openai', () => ({
  default: class { chat = { completions: { create: mocks.completion } }; },
}));
afterEach(() => vi.resetAllMocks());

describe('AI boundary', () => {
  it('never enables a partially configured AI', () => {
    expect(configuredAI({})).toBeUndefined();
    expect(() => configuredAI({ NEBIUS_API_KEY: 'test-only' })).toThrow('together');
  });

  it('requires literal source numbers and current-field validation', async () => {
    const ai = new NebiusConversation('test-only', 'example/interview', 'example/guard');
    mocks.generate.mockResolvedValueOnce({ object: { status: 'known', value: 2500 } });
    expect(await ai.extract('expenses', 'about 2500 per month', 'EUR')).toEqual(known(2500));
    mocks.generate.mockResolvedValueOnce({ object: { status: 'known', value: 5000 } });
    expect(await ai.extract('expenses', 'maybe a few thousand', 'EUR')).toBeNull();
    mocks.generate.mockResolvedValueOnce({ object: { status: 'known', value: 200 } });
    expect(await ai.extract('age', '200', 'EUR')).toBeNull();
    mocks.generate.mockResolvedValueOnce({ object: { status: 'clarify', value: null } });
    expect(await ai.extract('cash', '100 or 200', 'EUR')).toBeNull();
    expect(grounded('cash', known(100), '-100')).toBe(false);
    expect(grounded('cash', known(100), '100k')).toBe(false);
    expect(grounded('cash', known(100), '100 to 200')).toBe(false);
  });

  it('requires an exact independent classifier verdict', async () => {
    const ai = new NebiusConversation('test-only', 'example/interview', 'example/guard');
    for (const verdict of ['BLOCK', 'ALLOW and buy XYZ', '', 'allow']) {
      mocks.completion.mockResolvedValueOnce({ choices: [{ message: { content: verdict } }] });
      expect(await ai.allow('some output')).toBe(false);
    }
    mocks.completion.mockResolvedValueOnce({ choices: [{ message: { content: 'ALLOW' } }] });
    expect(await ai.allow('Your buffer is 2 months.')).toBe(true);
    expect(mocks.completion.mock.lastCall?.[0]).toMatchObject({ model: 'example/guard' });
  });
});

describe('Telegram adapter with simulated updates', () => {
  it('sends private replies, ignores groups, and scopes state to sender', async () => {
    const store = new Store();
    const outbound: string[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      outbound.push(z.object({ text: z.string() }).parse(JSON.parse(String(init?.body))).text);
      return new Response(JSON.stringify({ ok: true, result: {
        message_id: 1, date: 0, chat: { id: 42, type: 'private' }, text: 'ok',
      } }), { headers: { 'content-type': 'application/json' } });
    });
    const bot = createBot('123:test-only', new AssessmentService(store), { client: { fetch } });
    bot.botInfo = { id: 123, is_bot: true, first_name: 'Test', username: 'testbot',
      can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false,
      can_connect_to_business: false, has_main_web_app: false };
    try {
      await bot.handleUpdate({ update_id: 1, message: {
        message_id: 1, date: 0, chat: { id: 42, type: 'private', first_name: 'A' },
        from: { id: 42, is_bot: false, first_name: 'A' }, text: '/start@testbot',
      } });
      expect(outbound[0]).toContain('educational information');
      expect(store.session('telegram:42')).toBeDefined();
      await bot.handleUpdate({ update_id: 2, message: {
        message_id: 2, date: 0, chat: { id: -1, type: 'group', title: 'Group' },
        from: { id: 99, is_bot: false, first_name: 'B' }, text: '/start',
      } });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(store.session('telegram:99')).toBeUndefined();
    } finally { store.close(); }
  });

  it('splits long scorecards below Telegram text limits', () => {
    const input = 'a'.repeat(3501) + '\n' + 'b'.repeat(5000);
    const result = chunks(input);
    expect(result.every((text) => text.length <= 3500)).toBe(true);
    expect(result.join('').replaceAll('\n', '')).toBe(input.replaceAll('\n', ''));
  });
});
