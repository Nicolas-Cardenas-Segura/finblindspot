import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { openStore } from '../../src/store/db.js';
import { runAssessment } from '../../src/assess/assess.js';
import { createState } from '../../src/interview/stateMachine.js';
import { DEFAULT_ASSUMPTIONS } from '../../src/config/assumptions.js';
import type { Assessment } from '../../src/assess/assess.js';
import { BASE } from '../fixtures/cases.js';

function makeAssessment(id: string, userId: string, createdAt: string): Assessment {
  const { derived, results, blind_spots } = runAssessment(BASE, DEFAULT_ASSUMPTIONS, new Date(createdAt));
  return {
    id,
    user_id: userId,
    created_at: createdAt,
    status: 'complete',
    base_currency: BASE.base_currency,
    answers: BASE,
    assumptions: DEFAULT_ASSUMPTIONS,
    derived,
    results,
    blind_spots,
  };
}

describe('assessment store', () => {
  it('returns the latest complete assessment and lists all of them', () => {
    const store = openStore(':memory:');
    store.insertAssessment(makeAssessment('a1', 'u1', '2026-01-01T00:00:00.000Z'));
    store.insertAssessment(makeAssessment('a2', 'u1', '2026-02-01T00:00:00.000Z'));

    expect(store.latestComplete('u1')?.id).toBe('a2');
    expect(store.listAssessments('u1')).toHaveLength(2);
  });

  it('throws when the same id is inserted twice', () => {
    const store = openStore(':memory:');
    store.insertAssessment(makeAssessment('a1', 'u1', '2026-01-01T00:00:00.000Z'));
    expect(() => store.insertAssessment(makeAssessment('a1', 'u1', '2026-03-01T00:00:00.000Z'))).toThrow();
  });

  it('round-trips interview state', () => {
    const store = openStore(':memory:');
    const state = { ...createState('u1'), fieldIndex: 4, retries: 1 };
    store.saveState(state);
    expect(store.loadState('u1')).toEqual(state);

    store.saveState({ ...state, fieldIndex: 7 });
    expect(store.loadState('u1')?.fieldIndex).toBe(7);

    store.clearState('u1');
    expect(store.loadState('u1')).toBeUndefined();
  });

  it('deletes assessments and state for a user', () => {
    const store = openStore(':memory:');
    store.insertAssessment(makeAssessment('a1', 'u1', '2026-01-01T00:00:00.000Z'));
    store.insertAssessment(makeAssessment('a2', 'u2', '2026-01-01T00:00:00.000Z'));
    store.saveState(createState('u1'));

    const counts = store.deleteUser('u1');
    expect(counts.assessments).toBe(1);
    expect(counts.states).toBe(1);
    expect(store.listAssessments('u1')).toHaveLength(0);
    expect(store.listAssessments('u2')).toHaveLength(1);
  });

  it('never updates an assessment row', () => {
    const source = readFileSync(new URL('../../src/store/assessments.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('UPDATE assessments');
  });
});
