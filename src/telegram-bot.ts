import { Bot, type BotConfig, type Context } from 'grammy';
import { type AssessmentService } from './interview.js';

export function chunks(text: string): string[] {
  const result: string[] = [];
  while (text.length > 3500) {
    const newline = text.lastIndexOf('\n', 3500);
    const cut = newline > 0 ? newline : 3500;
    result.push(text.slice(0, cut));
    text = text.slice(cut).replace(/^\n/, '');
  }
  if (text) result.push(text);
  return result;
}

export function createBot(token: string, service: AssessmentService, config?: BotConfig<Context>): Bot {
  const bot = new Bot(token, config);
  bot.on('message:text', async (ctx) => {
    if (ctx.chat.type !== 'private' || ctx.from.is_bot) return;
    const input = ctx.message.text.replace(/^\/(\w+)@\w+/, '/$1');
    const response = await service.reply(`telegram:${ctx.from.id}`, input);
    for (const part of chunks(response)) await ctx.reply(part, { protect_content: true });
  });
  return bot;
}
