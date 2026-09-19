import { createHash } from 'node:crypto';
import { createTelegramAdapter } from '@chat-adapter/telegram';
import { MastraStateAdapter, type ChannelConfig, type ChannelHandler } from '@mastra/core/channels';
import type { Config } from '../config/env';
import type { AssessmentService } from '../application/handle-turn';
import { validSecret } from '../server/access';
import { REJECTED_INPUT, sanitiseTelegramUpdate } from './telegram-input';

export const WEBHOOK_PATH = '/api/agents/financial-blindspot/channels/telegram/webhook';
export class PrivateChannelState extends MastraStateAdapter {
  override async appendToList(key: string, value: unknown, options?: { maxLength?: number; ttlMs?: number }): Promise<void> {
    if (key.startsWith('msg-history:')) return;
    await super.appendToList(key, value, options);
  }
}
export const telegramOwner = (userId: string) => `telegram:${createHash('sha256').update(userId).digest('hex')}`;
export function telegramChannels(config: Config, state: PrivateChannelState, service: () => Promise<AssessmentService>): ChannelConfig | undefined {
  if (!config.TELEGRAM_BOT_TOKEN) return undefined;
  const adapter = createTelegramAdapter({ mode: 'webhook', botToken: config.TELEGRAM_BOT_TOKEN, secretToken: config.TELEGRAM_WEBHOOK_SECRET_TOKEN, userName: config.TELEGRAM_BOT_USERNAME, nativeStreaming: false });
  const receive = adapter.handleWebhook.bind(adapter);
  adapter.handleWebhook = async (request, options) => {
    if (!validSecret(request.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? undefined, config.TELEGRAM_WEBHOOK_SECRET_TOKEN)) return new Response('Unauthorized', { status: 401 });
    if (Number(request.headers.get('Content-Length') ?? '0') > 20000) return new Response('Request too large', { status: 413 });
    try {
      const body = await request.text();
      if (body.length > 20000) return new Response('Request too large', { status: 413 });
      const update = sanitiseTelegramUpdate(JSON.parse(body));
      if (!update) return new Response('OK');
      const headers = new Headers(request.headers);
      headers.delete('Content-Length'); headers.set('Content-Type', 'application/json');
      return receive(new Request(request.url, { method: 'POST', headers, body: JSON.stringify(update), signal: request.signal }), options);
    } catch { return new Response('Invalid update', { status: 400 }); }
  };
  const handler: ChannelHandler = async (thread, message) => {
    if (!thread.isDM || message.author.isBot) return;
    try {
      const response = await (await service()).turn(telegramOwner(message.author.userId), message.id, message.text, message.attachments.length > 0 || message.text === REJECTED_INPUT);
      if (response) await thread.post(response.text);
    } catch { console.error('telegram_turn_failed'); }
  };
  return {
    adapters: { telegram: { adapter, streaming: false, toolDisplay: 'hidden', typingStatus: false, textFormat: 'plain' } },
    state,
    inlineMedia: [],
    threadContext: { maxMessages: 0, addSystemMessage: false },
    chatOptions: { logger: 'silent', concurrency: 'concurrent', fallbackStreamingPlaceholderText: null },
    handlers: {
      onDirectMessage: handler,
      onSubscribedMessage: handler,
      onMention: false,
      onAction: false,
      onSlashCommand: async event => {
        if (!event.channel.isDM || event.user.isBot) return;
        const raw = event.raw as { message_id?: number; update_id?: number };
        if (raw.message_id === undefined && raw.update_id === undefined) return;
        try {
          const response = await (await service()).turn(telegramOwner(event.user.userId), `slash:${raw.message_id ?? raw.update_id}`, `${event.command} ${event.text}`.trim(), event.command === REJECTED_INPUT);
          if (response) await event.channel.post(response.text);
        } catch { console.error('telegram_command_failed'); }
      },
    },
  };
}
