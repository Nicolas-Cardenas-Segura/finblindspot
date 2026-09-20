import { z } from 'zod';
import type { LogLevel } from '../log/logger.js';
import { LOG_LEVELS } from '../log/logger.js';

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  NEBIUS_API_KEY: string;
  NEBIUS_BASE_URL: string;
  GALTEA_API_KEY?: string;
  DATABASE_PATH: string;
  NUDGE_TICK_SECONDS: number;
  NUDGE_DEMO_MINUTES?: number;
  LOG_LEVEL: LogLevel;
}

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === '' ? undefined : v));

const EnvSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  NEBIUS_API_KEY: z.string().min(1),
  NEBIUS_BASE_URL: z.string().url().default('https://api.tokenfactory.nebius.com/v1/'),
  GALTEA_API_KEY: optionalString,
  DATABASE_PATH: z.string().min(1).default('./data/finblindspot.sqlite'),
  NUDGE_TICK_SECONDS: z.coerce.number().int().positive().default(3600),
  NUDGE_DEMO_MINUTES: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v.trim() === '') return undefined;
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) {
        ctx.addIssue({ code: 'custom', message: 'must be a positive number of minutes' });
        return z.NEVER;
      }
      return n;
    }),
  LOG_LEVEL: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === '' ? 'info' : v.trim().toLowerCase()))
    .pipe(z.enum(LOG_LEVELS)),
});

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const keys = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))];
    throw new Error(`Invalid environment: missing or invalid ${keys.join(', ')}`);
  }
  return parsed.data;
}
