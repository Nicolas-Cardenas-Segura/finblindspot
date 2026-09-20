import type { Verdict } from './classifier.js';
import type { ComplianceTrigger } from '../store/db.js';
import { createLogger } from '../log/logger.js';

const log = createLogger('guard');

export interface GuardDeps {
  classify: (t: string) => Promise<Verdict>;
  inventedNumber: (t: string) => boolean;
  logTrigger: (t: ComplianceTrigger) => void;
  maxAttempts?: number;
}

export async function guardedGenerate(
  generate: (attempt: number) => Promise<string>,
  fallback: string,
  ctx: { userId: string },
  deps: GuardDeps,
): Promise<{ text: string; attempts: number; fellBack: boolean }> {
  const maxAttempts = deps.maxAttempts ?? 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const draft = await generate(attempt);
    log.debug('draft generated', { userId: ctx.userId, attempt, maxAttempts, draft });

    if (deps.inventedNumber(draft)) {
      log.warn('draft BLOCKED: invented number', { userId: ctx.userId, attempt, draft });
      deps.logTrigger({
        userId: ctx.userId,
        createdAt: new Date().toISOString(),
        draft,
        verdict: 'BLOCK',
        attempt,
        reason: 'invented_number',
      });
      continue;
    }

    const verdict = await deps.classify(draft);
    log.debug('classifier verdict', { userId: ctx.userId, attempt, verdict });
    if (verdict === 'BLOCK') {
      log.warn('draft BLOCKED: classifier', { userId: ctx.userId, attempt, draft });
      deps.logTrigger({
        userId: ctx.userId,
        createdAt: new Date().toISOString(),
        draft,
        verdict: 'BLOCK',
        attempt,
        reason: 'classifier',
      });
      continue;
    }

    return { text: draft, attempts: attempt, fellBack: false };
  }

  log.warn('all attempts blocked → static fallback', { userId: ctx.userId, maxAttempts, fallback });
  return { text: fallback, attempts: maxAttempts, fellBack: true };
}
