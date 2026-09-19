import type { Verdict } from './classifier.js';
import type { ComplianceTrigger } from '../store/db.js';

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

    if (deps.inventedNumber(draft)) {
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

    if ((await deps.classify(draft)) === 'BLOCK') {
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

  return { text: fallback, attempts: maxAttempts, fellBack: true };
}
