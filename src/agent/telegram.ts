import { Bot, InputFile } from 'grammy';
import { createLogger, errorData } from '../log/logger.js';
import type { Incoming, Outgoing } from './handlers.js';

export const ERROR_REPLY =
  'Sorry, something went wrong on my side. Please send that again.';

const log = createLogger('telegram');

const CAPTION_LIMIT = 1024;

let activeBot: Bot | null = null;

export interface ReplyTarget {
  reply(text: string, other?: { reply_markup?: { remove_keyboard: true } }): Promise<unknown>;
  replyWithDocument(document: InputFile, other?: { caption?: string }): Promise<unknown>;
}

export async function sendOutgoing(ctx: ReplyTarget, outgoing: Outgoing): Promise<void> {
  const textOptions = { reply_markup: { remove_keyboard: true } } as const;
  if (outgoing.document !== undefined) {
    const file = new InputFile(outgoing.document.data, outgoing.document.filename);
    if (outgoing.text.length <= CAPTION_LIMIT) {
      await ctx.replyWithDocument(file, { caption: outgoing.text });
    } else {
      await ctx.reply(outgoing.text, textOptions);
      await ctx.replyWithDocument(file, { caption: outgoing.document.caption });
    }
  } else {
    await ctx.reply(outgoing.text, textOptions);
  }
  if (outgoing.followUp !== undefined) {
    await ctx.reply(outgoing.followUp, textOptions);
  }
}

export async function sendMessage(userId: string, text: string): Promise<void> {
  if (activeBot === null) throw new Error('Telegram bot not started');
  log.info('push →', { userId, text });
  await activeBot.api.sendMessage(userId, text);
}

export async function stopTelegram(): Promise<void> {
  if (activeBot === null) return;
  log.info('stopping long polling');
  await activeBot.stop();
  activeBot = null;
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
      firstName: ctx.from.first_name,
    };
    void ctx.replyWithChatAction('typing').catch(() => undefined);
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
        text: outgoing.text,
        document: outgoing.document?.filename,
      });
      await sendOutgoing(ctx, outgoing);
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
