import { InputFile } from 'grammy';
import { describe, expect, it, vi } from 'vitest';
import type { Outgoing } from '../../src/agent/handlers.js';
import type { ReplyTarget } from '../../src/agent/telegram.js';
import { sendOutgoing } from '../../src/agent/telegram.js';

function mockCtx() {
  return {
    reply: vi.fn<ReplyTarget['reply']>(async () => undefined),
    replyWithDocument: vi.fn<ReplyTarget['replyWithDocument']>(async () => undefined),
  };
}

const document = { filename: 'report.pdf', data: Buffer.from('%PDF-'), caption: 'Your report' };

describe('sendOutgoing', () => {
  it('sends a short report and its PDF as one message', async () => {
    const ctx = mockCtx();
    const outgoing: Outgoing = { text: 'Short report', document, followUp: 'Remind you?' };

    await sendOutgoing(ctx, outgoing);

    expect(ctx.replyWithDocument).toHaveBeenCalledTimes(1);
    const [file, options] = ctx.replyWithDocument.mock.calls[0]!;
    expect(file).toBeInstanceOf(InputFile);
    expect(options).toEqual({ caption: 'Short report' });
    expect(ctx.reply.mock.calls).toEqual([['Remind you?', { reply_markup: { remove_keyboard: true } }]]);
  });

  it('sends long report text separately from the PDF', async () => {
    const ctx = mockCtx();
    const text = 'x'.repeat(1025);

    await sendOutgoing(ctx, { text, document, followUp: 'Remind you?' });

    expect(ctx.reply.mock.calls.map((c) => c[0])).toEqual([text, 'Remind you?']);
    expect(ctx.replyWithDocument.mock.calls[0]![1]).toEqual({ caption: 'Your report' });
  });

  it('sends plain text without a follow-up as a single reply', async () => {
    const ctx = mockCtx();

    await sendOutgoing(ctx, { text: 'Hello' });

    expect(ctx.replyWithDocument).not.toHaveBeenCalled();
    expect(ctx.reply.mock.calls).toEqual([['Hello', { reply_markup: { remove_keyboard: true } }]]);
  });
});
