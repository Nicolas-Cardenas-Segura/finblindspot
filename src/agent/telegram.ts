import { Bot, Keyboard } from 'grammy';
import { createLogger, errorData } from '../log/logger.js';
import type { Incoming, Outgoing } from './handlers.js';

export const ERROR_REPLY =
  'Sorry, something went wrong on my side. Please send that again.';

const log = createLogger('telegram');

function keyboard(options: string[]): Keyboard {
  const kb = new Keyboard();
  for (const option of options) {
    kb.text(option).row();
  }
  return kb.oneTime();
}

let activeBot: Bot | null = null;

export async function sendMessage(userId: string, text: string): Promise<void> {
  if (activeBot === null) throw new Error('Telegram bot not started');
  log.info('push →', { userId, text });
  await activeBot.api.sendMessage(userId, text);
}

export async function startTelegram(
  token: string,
  onMessage: (m: Incoming) => Promise<Outgoing>,
): Promise<void> {
  const bot = new Bot(token);
  activeBot = bot;

  bot.on('message:text', async (ctx) => {
    const incoming: Incoming = {
      userId: String(ctx.from.id),
      text: ctx.message.text,
    };
    const started = Date.now();
    log.info('← user', { userId: incoming.userId, text: incoming.text });
    log.debug('raw update', {
      update_id: ctx.update.update_id,
      message_id: ctx.message.message_id,
      chat: ctx.chat,
      from: ctx.from,
      date: ctx.message.date,
      entities: ctx.message.entities,
    });
    try {
      const outgoing = await onMessage(incoming);
      log.info('→ bot', {
        userId: incoming.userId,
        ms: Date.now() - started,
        options: outgoing.options,
        text: outgoing.text,
      });
      await ctx.reply(
        outgoing.text,
        outgoing.options
          ? { reply_markup: keyboard(outgoing.options) }
          : undefined,
      );
    } catch (error) {
      log.error('handler failed, sending error reply', {
        userId: incoming.userId,
        ms: Date.now() - started,
        ...errorData(error),
      });
      await ctx.reply(ERROR_REPLY);
    }
  });

  bot.catch((err) => {
    log.error('grammy middleware error', { update_id: err.ctx.update.update_id, ...errorData(err.error) });
  });

  await bot.start({
    onStart: (info) => log.info('long polling started', { bot: info.username, id: info.id }),
  });
}
