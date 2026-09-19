import { z } from 'zod';
import { checkInput } from '../guardrail/input-policy';

export const REJECTED_INPUT = '/unsupportedinput';
const updateSchema = z.object({
  update_id: z.number().int(),
  message: z.object({
    message_id: z.number().int(), date: z.number().int(), text: z.string().optional(),
    chat: z.object({ id: z.number().int(), type: z.string() }),
    from: z.object({ id: z.number().int(), is_bot: z.boolean() }),
  }),
});
export function sanitiseTelegramUpdate(input: unknown) {
  const result = updateSchema.safeParse(input);
  if (!result.success || result.data.message.chat.type !== 'private' || result.data.message.from.is_bot) return null;
  const { update_id, message } = result.data;
  if (message.chat.id !== message.from.id) return null;
  const checked = checkInput(message.text ?? '');
  return { update_id, message: { message_id: message.message_id, date: message.date, chat: { id: message.chat.id, type: 'private' }, from: { id: message.from.id, is_bot: false, first_name: 'User' }, text: checked.accepted ? checked.text : REJECTED_INPUT } };
}
