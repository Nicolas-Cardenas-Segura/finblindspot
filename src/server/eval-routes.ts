import { randomUUID } from 'node:crypto';
import { registerApiRoute } from '@mastra/core/server';
import { z } from 'zod';
import type { Config } from '../config/env';
import type { AssessmentService } from '../application/handle-turn';
import type { AssessmentRepository } from '../storage/assessment-repository';
import { RateLimiter, validBearer } from './access';

const galteaIdSchema = z.string().min(1).max(200).regex(/^[^\s{}\u0000-\u001f\u007f]+$/u);
const messageFields = { message: z.string().min(1).max(4000), turn_id: z.string().min(1).max(100).optional() };
export const evalMessageSchema = z.union([
  z.strictObject({ session_id: z.string().uuid(), ...messageFields }),
  z.strictObject({ galtea_session_id: galteaIdSchema, ...messageFields }),
]);
export const evalFinishSchema = z.union([
  z.strictObject({ session_id: z.string().uuid() }),
  z.strictObject({ galtea_session_id: galteaIdSchema }),
]);
export function evalRoutes(config: Config, service: () => Promise<AssessmentService>, repository: AssessmentRepository) {
  const limiter = new RateLimiter(60);
  return (['init', 'message', 'finalize'] as const).map(operation => registerApiRoute(`/api/eval/${operation}`, {
    method: 'POST', requiresAuth: false,
    handler: async c => {
      c.header('Cache-Control', 'no-store');
      if (!validBearer(c.req.header('Authorization'), config.EVAL_API_TOKEN)) return c.json({ error: 'unauthorized' }, 401);
      if (!limiter.accept('eval')) return c.json({ error: 'rate_limited' }, 429);
      if (!config.NEBIUS_API_KEY && operation !== 'finalize') return c.json({ error: 'model_not_configured' }, 503);
      const length = Number(c.req.header('Content-Length') ?? '0');
      if (length > 20000) return c.json({ error: 'request_too_large' }, 413);
      try {
        const runtime = await service();
        if (operation === 'init') {
          const id = randomUUID();
          if (!await repository.createSession(`eval:${id}`)) return c.json({ error: 'session_limit' }, 429);
          return c.json({ session_id: id });
        }
        const raw = await c.req.text();
        if (raw.length > 20000) return c.json({ error: 'request_too_large' }, 413);
        const parsed = (operation === 'message' ? evalMessageSchema : evalFinishSchema).safeParse(JSON.parse(raw));
        if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
        let owner: string | null;
        if ('galtea_session_id' in parsed.data) {
          if (operation === 'message') {
            const session = await repository.resolveGalteaSession(parsed.data.galtea_session_id);
            if (session.status === 'limit') return c.json({ error: 'session_limit' }, 429);
            if (session.status === 'expired') return c.json({ error: 'expired_session' }, 410);
            owner = session.owner;
          } else owner = await repository.galteaSessionOwner(parsed.data.galtea_session_id);
        } else owner = `eval:${parsed.data.session_id}`;
        if (!owner || !await repository.load(owner)) return c.json({ error: 'unknown_session' }, 404);
        if (operation === 'finalize') { await runtime.finalize(owner); return c.json({ closed: true }); }
        const input = evalMessageSchema.parse(parsed.data);
        const response = await runtime.turn(owner, input.turn_id ?? (c.req.header('X-Galtea-Inference-Id') || randomUUID()), input.message);
        return response ? c.json({ response: response.text, session_id: owner.slice('eval:'.length) }) : c.json({ error: 'response_withheld' }, 503);
      } catch (error) {
        return error instanceof SyntaxError || error instanceof z.ZodError ? c.json({ error: 'invalid_request' }, 400) : c.json({ error: 'infrastructure_failed' }, 503);
      }
    },
  }));
}
