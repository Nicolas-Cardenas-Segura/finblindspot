import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { HandlerDeps } from './agent/handlers.js';
import { handleMessage } from './agent/handlers.js';
import { sendMessage, startTelegram } from './agent/telegram.js';
import { loadEnv } from './config/env.js';
import { classifyOutbound } from './guardrail/classifier.js';
import { createNebiusClient } from './llm/nebius.js';
import { startNudgeScheduler } from './nudge/scheduler.js';
import { openStore } from './store/db.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const client = createNebiusClient(env);
  mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });
  const store = openStore(env.DATABASE_PATH);

  const deps: HandlerDeps = {
    store,
    llm: client,
    guard: {
      classify: (t) => classifyOutbound(t, { client }),
      inventedNumber: () => false,
      logTrigger: (t) => store.logTrigger(t),
    },
    nudgeDemoMinutes: env.NUDGE_DEMO_MINUTES,
  };

  const telegram = startTelegram(env.TELEGRAM_BOT_TOKEN, (m) => handleMessage(m, deps));
  const scheduler = startNudgeScheduler({
    store,
    send: sendMessage,
    tickSeconds: env.NUDGE_TICK_SECONDS,
  });
  process.once('SIGINT', () => scheduler.stop());
  process.once('SIGTERM', () => scheduler.stop());
  await telegram;
  scheduler.stop();
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
