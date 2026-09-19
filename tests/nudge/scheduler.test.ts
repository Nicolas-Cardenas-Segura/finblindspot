import { describe, it, expect } from 'vitest';
import { openStore } from '../../src/store/db.js';
import { dueAt, renderNudge, startNudgeScheduler } from '../../src/nudge/scheduler.js';
import type { Nudge } from '../../src/nudge/scheduler.js';

const NOW = new Date('2026-06-01T00:00:00.000Z');

function nudge(id: string, due: string): Nudge {
  return {
    id,
    userId: `user-${id}`,
    assessmentId: `assessment-${id}`,
    dueAt: due,
    sentAt: null,
    cancelled: false,
  };
}

function storeWithOneDueNudge() {
  const store = openStore(':memory:');
  store.insertNudge(nudge('due', '2026-05-01T00:00:00.000Z'));
  store.insertNudge(nudge('future', '2026-12-01T00:00:00.000Z'));
  return store;
}

describe('dueAt', () => {
  it('adds calendar months', () => {
    expect(dueAt(new Date('2026-01-31T00:00:00.000Z'), 6).toISOString()).toBe(
      '2026-07-31T00:00:00.000Z',
    );
  });

  it('scales months to minutes in demo mode', () => {
    const from = new Date('2026-01-31T00:00:00.000Z');
    expect(dueAt(from, 12, 1).getTime()).toBe(from.getTime() + 12 * 60_000);
  });
});

describe('renderNudge', () => {
  it('renders the reminder sentence', () => {
    expect(renderNudge(6)).toBe(
      'It has been 6 months since your last check. Reply /revisit to update it in five minutes and see what moved.',
    );
  });
});

describe('startNudgeScheduler', () => {
  it('sends due nudges once', async () => {
    const store = storeWithOneDueNudge();
    const sent: Array<{ userId: string; text: string }> = [];
    const scheduler = startNudgeScheduler({
      store,
      send: async (userId, text) => {
        sent.push({ userId, text });
      },
      tickSeconds: 3600,
      now: () => NOW,
    });

    expect(await scheduler.tick()).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].userId).toBe('user-due');
    expect(sent[0].text).toContain('/revisit');
    expect(await scheduler.tick()).toBe(0);
    scheduler.stop();
  });

  it('leaves the nudge unsent when sending fails', async () => {
    const store = storeWithOneDueNudge();
    const scheduler = startNudgeScheduler({
      store,
      send: async () => {
        throw new Error('transport down');
      },
      tickSeconds: 3600,
      now: () => NOW,
    });

    expect(await scheduler.tick()).toBe(0);
    expect(store.dueNudges(NOW.toISOString()).map((n) => n.id)).toEqual(['due']);
    scheduler.stop();
  });
});
