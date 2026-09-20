import { describe, it, expect } from 'vitest';
import { openStore } from '../../src/store/db.js';
import type { ComplianceTrigger } from '../../src/store/db.js';

function trigger(overrides: Partial<ComplianceTrigger> = {}): ComplianceTrigger {
  return {
    userId: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
    draft: 'you should buy this fund',
    verdict: 'BLOCK',
    attempt: 1,
    reason: 'classifier',
    ...overrides,
  };
}

describe('trigger store', () => {
  it('counts triggers, optionally since a timestamp', () => {
    const store = openStore(':memory:');
    store.logTrigger(trigger());
    store.logTrigger(trigger({ attempt: 2 }));
    store.logTrigger(trigger({ reason: 'invented_number' }));

    expect(store.countTriggers()).toBe(3);
    expect(store.countTriggers('2030-01-01T00:00:00.000Z')).toBe(0);
    expect(store.countTriggers('2025-01-01T00:00:00.000Z')).toBe(3);
  });

  it('deletes everything belonging to a user', () => {
    const store = openStore(':memory:');
    store.logTrigger(trigger());
    store.insertNudge({
      id: 'n1',
      userId: 'u1',
      assessmentId: 'a1',
      dueAt: '2026-07-01T00:00:00.000Z',
      sentAt: null,
      cancelled: false,
    });

    expect(store.deleteUser('u1')).toEqual({ assessments: 0, states: 0, nudges: 1, triggers: 1, reports: 0 });
    expect(store.countTriggers()).toBe(0);
    expect(store.dueNudges('2030-01-01T00:00:00.000Z')).toHaveLength(0);
  });
});
