import type { Store } from '../store/db.js';
import { createLogger, errorData } from '../log/logger.js';

const log = createLogger('nudge');

export interface Nudge {
  id: string;
  userId: string;
  assessmentId: string;
  dueAt: string;
  sentAt: string | null;
  cancelled: boolean;
}

export function dueAt(from: Date, months: 6 | 12, demoMinutes?: number): Date {
  if (demoMinutes !== undefined) {
    return new Date(from.getTime() + months * demoMinutes * 60_000);
  }
  const target = new Date(from.getTime());
  const day = target.getUTCDate();
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

export function renderNudge(assessedOn: string | undefined): string {
  const since = assessedOn === undefined ? '' : ` on ${assessedOn}`;
  return `You asked me to remind you to re-check your financial blind spots. Your last assessment was${since}. Reply /revisit to update it and see what moved.`;
}

function assessedOn(store: Store, n: Nudge): string | undefined {
  const assessment = store.listAssessments(n.userId).find((a) => a.id === n.assessmentId);
  return assessment?.created_at.slice(0, 10);
}

export function startNudgeScheduler(deps: {
  store: Store;
  send: (userId: string, text: string) => Promise<void>;
  tickSeconds: number;
  now?: () => Date;
}): { stop(): void; tick(): Promise<number> } {
  const now = deps.now ?? (() => new Date());

  async function tick(): Promise<number> {
    const at = now().toISOString();
    const due = deps.store.dueNudges(at);
    log.debug('tick', { at, due: due.length });
    let sent = 0;
    for (const nudge of due) {
      const text = renderNudge(assessedOn(deps.store, nudge));
      try {
        await deps.send(nudge.userId, text);
      } catch (error) {
        log.error('send failed, will retry next tick', { nudgeId: nudge.id, userId: nudge.userId, ...errorData(error) });
        continue;
      }
      deps.store.markNudgeSent(nudge.id, now().toISOString());
      log.info('nudge sent', { nudgeId: nudge.id, userId: nudge.userId, dueAt: nudge.dueAt, text });
      sent += 1;
    }
    return sent;
  }

  log.info('scheduler started', { tickSeconds: deps.tickSeconds });
  const timer = setInterval(() => {
    void tick();
  }, deps.tickSeconds * 1000);

  return {
    stop() {
      clearInterval(timer);
    },
    tick,
  };
}
