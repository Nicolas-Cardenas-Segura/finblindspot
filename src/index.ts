import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { HandlerDeps } from './agent/handlers.js';
import { handleMessage } from './agent/handlers.js';
import { createIdleWatcher } from './agent/idle.js';
import { sendMessage, startTelegram, stopTelegram } from './agent/telegram.js';
import { loadEnv } from './config/env.js';
import { classifyOutbound } from './guardrail/classifier.js';
import { createNebiusClient } from './llm/nebius.js';
import { createLogger, errorData, setLogLevel } from './log/logger.js';
import { startNudgeScheduler } from './nudge/scheduler.js';
import { openStore } from './store/db.js';

const log = createLogger('main');

async function main(): Promise<void> {
  const env = loadEnv();
  setLogLevel(env.LOG_LEVEL);
  log.info('starting finblindspot', {
    logLevel: env.LOG_LEVEL,
    databasePath: env.DATABASE_PATH,
    nebiusBaseUrl: env.NEBIUS_BASE_URL,
    nudgeTickSeconds: env.NUDGE_TICK_SECONDS,
    nudgeDemoMinutes: env.NUDGE_DEMO_MINUTES,
    idleProposeStopSeconds: env.IDLE_PROPOSE_STOP_SECONDS,
    node: process.version,
  });
  if (env.LOG_LEVEL === 'debug') {
    log.warn('debug logging prints full user messages and model prompts; use only for local development');
  }

  const client = createNebiusClient(env);
  mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });
  const store = openStore(env.DATABASE_PATH);
  log.debug('store opened', { databasePath: env.DATABASE_PATH });

  const deps: HandlerDeps = {
    store,
    llm: client,
    guard: {
      classify: (t) => classifyOutbound(t, { client }),
      inventedNumber: () => false,
      logTrigger: (t) => {
        log.warn('compliance trigger stored', { ...t });
        store.logTrigger(t);
      },
    },
    nudgeDemoMinutes: env.NUDGE_DEMO_MINUTES,
  };

  const watcher = createIdleWatcher({
    seconds: env.IDLE_PROPOSE_STOP_SECONDS,
    store,
    send: sendMessage,
  });
  const telegram = startTelegram(env.TELEGRAM_BOT_TOKEN, async (m) => {
    const outgoing = await handleMessage(m, deps);
    const state = store.loadState(m.userId);
    if (state !== undefined && !state.complete) watcher.touch(m.userId);
    else watcher.clear(m.userId);
    return outgoing;
  });
  const scheduler = startNudgeScheduler({
    store,
    send: sendMessage,
    tickSeconds: env.NUDGE_TICK_SECONDS,
  });
  const shutdown = (signal: string) => {
    log.info('shutting down', { signal });
    scheduler.stop();
    watcher.stop();
    void stopTelegram().catch((err: unknown) => log.error('stop failed', errorData(err)));
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  await telegram;
  scheduler.stop();
  watcher.stop();
}

main().catch((err: unknown) => {
  log.error('fatal', errorData(err));
  process.exit(1);
});
