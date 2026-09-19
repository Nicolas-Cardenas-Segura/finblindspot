import { Bot, Keyboard } from 'grammy';
import type { Incoming, Outgoing } from './handlers.js';

export const ERROR_REPLY =
  'Sorry, something went wrong on my side. Please send that again.';

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
  await activeBot.api.sendMessage(userId, text);
}

export async function startTelegram(
  token: string,
  onMessage: (m: Incoming) => Promise<Outgoing>,
): Promise<void> {
  const bot = new Bot(token);
  activeBot = bot;

  bot.on('message:text', async (ctx) => {
    try {
      const outgoing = await onMessage({
        userId: String(ctx.from.id),
        text: ctx.message.text,
      });
      await ctx.reply(
        outgoing.text,
        outgoing.options
          ? { reply_markup: keyboard(outgoing.options) }
          : undefined,
      );
    } catch {
      await ctx.reply(ERROR_REPLY);
    }
  });

  await bot.start();
}
