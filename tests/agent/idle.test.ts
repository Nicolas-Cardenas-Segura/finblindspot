import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_STOP_PROPOSAL, createIdleWatcher } from '../../src/agent/idle.js';
import { createState } from '../../src/interview/stateMachine.js';
import { openStore } from '../../src/store/db.js';
import type { Store } from '../../src/store/db.js';

const SECONDS = 45;

function setup(seed: (store: Store) => void) {
  const store = openStore(':memory:');
  seed(store);
  const send = vi.fn<(userId: string, text: string) => Promise<void>>().mockResolvedValue(undefined);
  const watcher = createIdleWatcher({ seconds: SECONDS, store, send });
  return { store, send, watcher };
}

function withDraft(store: Store): void {
  store.saveState(createState('user-1'));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createIdleWatcher', () => {
  it('sends the proposal once after the idle period when a draft exists', async () => {
    const { send, watcher } = setup(withDraft);
    watcher.touch('user-1');
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SECONDS * 1000);
    expect(send.mock.calls).toEqual([['user-1', IDLE_STOP_PROPOSAL]]);
    watcher.stop();
  });

  it('does not send when there is no state', async () => {
    const { send, watcher } = setup(() => undefined);
    watcher.touch('user-1');
    await vi.advanceTimersByTimeAsync(SECONDS * 1000);
    expect(send).not.toHaveBeenCalled();
    watcher.stop();
  });

  it('does not send when the state is complete', async () => {
    const { send, watcher } = setup((store) => {
      store.saveState({ ...createState('user-1'), complete: true });
    });
    watcher.touch('user-1');
    await vi.advanceTimersByTimeAsync(SECONDS * 1000);
    expect(send).not.toHaveBeenCalled();
    watcher.stop();
  });

  it('resets the timer on a new touch', async () => {
    const { send, watcher } = setup(withDraft);
    watcher.touch('user-1');
    await vi.advanceTimersByTimeAsync((SECONDS - 5) * 1000);
    watcher.touch('user-1');
    await vi.advanceTimersByTimeAsync(5 * 1000);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync((SECONDS - 5) * 1000);
    expect(send).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it('does not send after clear', async () => {
    const { send, watcher } = setup(withDraft);
    watcher.touch('user-1');
    watcher.clear('user-1');
    await vi.advanceTimersByTimeAsync(SECONDS * 1000 * 3);
    expect(send).not.toHaveBeenCalled();
    watcher.stop();
  });

  it('does not fire twice without another touch', async () => {
    const { send, watcher } = setup(withDraft);
    watcher.touch('user-1');
    await vi.advanceTimersByTimeAsync(SECONDS * 1000 * 5);
    expect(send).toHaveBeenCalledTimes(1);
    watcher.stop();
  });
});
