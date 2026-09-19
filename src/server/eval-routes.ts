import { randomUUID } from 'node:crypto';
import { registerApiRoute } from '@mastra/core/server';
import { z } from 'zod';
import type { Config } from '../config/env';
import type { AssessmentService } from '../application/handle-turn';
import type { AssessmentRepository } from '../storage/assessment-repository';
import { RateLimiter, validBearer } from './access';

const messageSchema = z.strictObject({ session_id: z.string().uuid(), message: z.string().min(1).max(4000), turn_id: z.string().min(1).max(100).optional() });
const finishSchema = z.strictObject({ session_id: z.string().uuid() });
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
          if (await repository.activeEvalCount() >= 500) return c.json({ error: 'session_limit' }, 429);
          const id = randomUUID();
          await repository.createSession(`eval:${id}`);
          return c.json({ session_id: id });
        }
        const raw = await c.req.text();
        if (raw.length > 20000) return c.json({ error: 'request_too_large' }, 413);
        const parsed = (operation === 'message' ? messageSchema : finishSchema).safeParse(JSON.parse(raw));
        if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
        const id = parsed.data.session_id;
        const owner = `eval:${id}`;
        if (!await repository.load(owner)) return c.json({ error: 'unknown_session' }, 404);
        if (operation === 'finalize') { await runtime.finalize(owner); return c.json({ closed: true }); }
        const input = messageSchema.parse(parsed.data);
        const response = await runtime.turn(owner, input.turn_id ?? c.req.header('X-Galtea-Inference-Id') ?? randomUUID(), input.message);
        return response ? c.json({ response: response.text }) : c.json({ error: 'response_withheld' }, 503);
      } catch (error) {
        return error instanceof SyntaxError || error instanceof z.ZodError ? c.json({ error: 'invalid_request' }, 400) : c.json({ error: 'infrastructure_failed' }, 503);
      }
    },
  }));
}
