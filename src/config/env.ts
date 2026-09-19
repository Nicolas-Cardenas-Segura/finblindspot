import { z } from 'zod';
import { defaultModels } from './models';

const optional = z.preprocess(v => v === '' ? undefined : v, z.string().min(1).optional());
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4111),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:4111'),
  NEBIUS_API_KEY: optional,
  NEBIUS_INTERVIEW_MODEL: z.string().default(defaultModels.interview),
  NEBIUS_CLASSIFIER_MODEL: z.string().default(defaultModels.classifier),
  TELEGRAM_BOT_TOKEN: optional,
  TELEGRAM_BOT_USERNAME: optional,
  TELEGRAM_WEBHOOK_SECRET_TOKEN: optional,
  EVAL_API_TOKEN: optional,
  DATABASE_URL: z.string().default('file:./data/mastra.db'),
  APP_DATABASE_URL: z.string().default('file:./data/blindspot.db'),
  RETENTION_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  REPORT_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
});
export type Config = z.infer<typeof schema>;
export function readConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const result = schema.safeParse(source);
  if (!result.success) throw new Error(`Invalid environment fields: ${result.error.issues.map(i => i.path.join('.')).join(', ')}`);
  const c = result.data;
  if (c.EVAL_API_TOKEN && c.EVAL_API_TOKEN.length < 32) throw new Error('EVAL_API_TOKEN must contain at least 32 characters');
  if (c.TELEGRAM_BOT_TOKEN && (!c.TELEGRAM_WEBHOOK_SECRET_TOKEN || !/^[A-Za-z0-9_-]{32,256}$/.test(c.TELEGRAM_WEBHOOK_SECRET_TOKEN))) throw new Error('Telegram requires a valid webhook secret of at least 32 characters');
  if (c.NODE_ENV === 'production' && (!source.DATABASE_URL?.startsWith('file:/') || !source.APP_DATABASE_URL?.startsWith('file:/') || !c.PUBLIC_BASE_URL.startsWith('https://'))) throw new Error('Production requires explicit absolute volume-backed database URLs and public HTTPS');
  return c;
}
