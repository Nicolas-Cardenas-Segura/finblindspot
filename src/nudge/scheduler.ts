import type { Store } from '../store/db.js';

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

export function renderNudge(months: 6 | 12): string {
  return `It has been ${months} months since your last check. Reply /revisit to update it in five minutes and see what moved.`;
}

function monthsFor(store: Store, n: Nudge): 6 | 12 {
  const assessment = store.listAssessments(n.userId).find((a) => a.id === n.assessmentId);
  if (!assessment) return 6;
  const elapsed = new Date(n.dueAt).getTime() - new Date(assessment.created_at).getTime();
  return elapsed > 9 * 30 * 24 * 3_600_000 ? 12 : 6;
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
    let sent = 0;
    for (const nudge of deps.store.dueNudges(at)) {
      try {
        await deps.send(nudge.userId, renderNudge(monthsFor(deps.store, nudge)));
      } catch (error) {
        console.error(`nudge ${nudge.id} send failed`, error);
        continue;
      }
      deps.store.markNudgeSent(nudge.id, now().toISOString());
      sent += 1;
    }
    return sent;
  }

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
