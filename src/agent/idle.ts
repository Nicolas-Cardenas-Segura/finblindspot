import { createLogger, errorData } from '../log/logger.js';
import type { Store } from '../store/db.js';

export const IDLE_STOP_PROPOSAL =
  'No rush. If you would rather stop here, reply stop and I will build your report from what you have told me so far, with the gaps clearly marked. Otherwise just carry on whenever you are ready.';

const log = createLogger('idle');

export interface IdleWatcher {
  touch(userId: string): void;
  clear(userId: string): void;
  stop(): void;
}

export function createIdleWatcher(deps: {
  seconds: number;
  store: Store;
  send: (userId: string, text: string) => Promise<void>;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}): IdleWatcher {
  const setTimer = deps.setTimer ?? setTimeout;
  const clearTimer = deps.clearTimer ?? clearTimeout;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function cancel(userId: string): void {
    const timer = timers.get(userId);
    if (timer === undefined) return;
    clearTimer(timer);
    timers.delete(userId);
  }

  async function fire(userId: string): Promise<void> {
    timers.delete(userId);
    const state = deps.store.loadState(userId);
    if (state === undefined) {
      log.debug('timer fired, skipped', { userId, reason: 'no draft' });
      return;
    }
    if (state.complete) {
      log.debug('timer fired, skipped', { userId, reason: 'draft complete' });
      return;
    }
    log.debug('timer fired, proposing stop', { userId });
    try {
      await deps.send(userId, IDLE_STOP_PROPOSAL);
    } catch (error) {
      log.error('idle proposal send failed', { userId, ...errorData(error) });
    }
  }

  return {
    touch(userId) {
      cancel(userId);
      const timer = setTimer(() => {
        void fire(userId);
      }, deps.seconds * 1000);
      timers.set(userId, timer);
      log.debug('timer armed', { userId, seconds: deps.seconds });
    },
    clear(userId) {
      if (timers.has(userId)) log.debug('timer cleared', { userId });
      cancel(userId);
    },
    stop() {
      log.debug('stopping all timers', { pending: timers.size });
      for (const userId of [...timers.keys()]) cancel(userId);
    },
  };
}
