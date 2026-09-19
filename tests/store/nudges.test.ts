import { describe, it, expect } from 'vitest';
import { openStore } from '../../src/store/db.js';
import type { Nudge } from '../../src/nudge/scheduler.js';

const NOW = '2026-01-01T00:00:00.000Z';
const FUTURE = '2026-07-01T00:00:00.000Z';
const FAR_FUTURE = '2030-01-01T00:00:00.000Z';

function nudge(id: string, dueAt: string, overrides: Partial<Nudge> = {}): Nudge {
  return {
    id,
    userId: 'u1',
    assessmentId: 'a1',
    dueAt,
    sentAt: null,
    cancelled: false,
    ...overrides,
  };
}

describe('nudge store', () => {
  it('returns only nudges that are due, unsent and not cancelled', () => {
    const store = openStore(':memory:');
    store.insertNudge(nudge('n1', '2025-12-01T00:00:00.000Z'));
    store.insertNudge(nudge('n2', FUTURE));
    store.insertNudge(nudge('n3', '2025-11-01T00:00:00.000Z', { sentAt: '2025-11-02T00:00:00.000Z' }));

    const due = store.dueNudges(NOW);
    expect(due.map((n) => n.id)).toEqual(['n1']);

    store.markNudgeSent('n1', NOW);
    expect(store.dueNudges(NOW)).toHaveLength(0);
    expect(store.dueNudges(FAR_FUTURE).map((n) => n.id)).toEqual(['n2']);
  });

  it('cancels pending nudges so they are never due again', () => {
    const store = openStore(':memory:');
    store.insertNudge(nudge('n1', FUTURE));

    expect(store.cancelPendingNudges('u1', NOW)).toBe(1);
    expect(store.dueNudges(FUTURE)).toHaveLength(0);
    expect(store.dueNudges(FAR_FUTURE)).toHaveLength(0);
  });

  it('deletes nudges for a user only', () => {
    const store = openStore(':memory:');
    store.insertNudge(nudge('n1', FUTURE));
    store.insertNudge(nudge('n2', FUTURE, { userId: 'u2' }));

    expect(store.deleteUser('u1').nudges).toBe(1);
    expect(store.dueNudges(FAR_FUTURE).map((n) => n.id)).toEqual(['n2']);
  });
});
