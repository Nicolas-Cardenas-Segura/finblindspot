import { describe, it, expect } from 'vitest';
import { guardedGenerate } from '../../src/guardrail/guard.js';
import type { GuardDeps } from '../../src/guardrail/guard.js';
import type { ComplianceTrigger } from '../../src/store/db.js';

function setup(options: { block?: string[]; invented?: string[] } = {}): {
  deps: GuardDeps;
  triggers: ComplianceTrigger[];
} {
  const triggers: ComplianceTrigger[] = [];
  const deps: GuardDeps = {
    classify: async (t) => ((options.block ?? []).includes(t) ? 'BLOCK' : 'ALLOW'),
    inventedNumber: (t) => (options.invented ?? []).includes(t),
    logTrigger: (t) => {
      triggers.push(t);
    },
  };
  return { deps, triggers };
}

describe('guardedGenerate', () => {
  it('returns the first draft when it is allowed', async () => {
    const { deps, triggers } = setup();
    const result = await guardedGenerate(async () => 'clean draft', 'fallback', { userId: 'u1' }, deps);
    expect(result).toEqual({ text: 'clean draft', attempts: 1, fellBack: false });
    expect(triggers).toHaveLength(0);
  });

  it('retries after a blocked draft and returns the second one', async () => {
    const { deps, triggers } = setup({ block: ['bad draft'] });
    const drafts = ['bad draft', 'good draft'];
    const result = await guardedGenerate(
      async (attempt) => drafts[attempt - 1],
      'fallback',
      { userId: 'u1' },
      deps,
    );
    expect(result).toEqual({ text: 'good draft', attempts: 2, fellBack: false });
    expect(triggers).toHaveLength(1);
    expect(triggers[0].attempt).toBe(1);
    expect(triggers[0].reason).toBe('classifier');
    expect(triggers[0].userId).toBe('u1');
    expect(triggers[0].draft).toBe('bad draft');
    expect(triggers[0].verdict).toBe('BLOCK');
  });

  it('falls back after every attempt is blocked', async () => {
    const { deps, triggers } = setup({ block: ['bad draft'] });
    let calls = 0;
    const result = await guardedGenerate(
      async () => {
        calls += 1;
        return 'bad draft';
      },
      'fallback',
      { userId: 'u1' },
      deps,
    );
    expect(result).toEqual({ text: 'fallback', attempts: 2, fellBack: true });
    expect(triggers).toHaveLength(2);
    expect(calls).toBe(2);
  });

  it('retries after an invented number', async () => {
    const { deps, triggers } = setup({ invented: ['made up 1234'] });
    const drafts = ['made up 1234', 'good draft'];
    const result = await guardedGenerate(
      async (attempt) => drafts[attempt - 1],
      'fallback',
      { userId: 'u1' },
      deps,
    );
    expect(result).toEqual({ text: 'good draft', attempts: 2, fellBack: false });
    expect(triggers).toHaveLength(1);
    expect(triggers[0].reason).toBe('invented_number');
    expect(triggers[0].attempt).toBe(1);
  });

  it('honours a custom maxAttempts', async () => {
    const { deps, triggers } = setup({ block: ['bad draft'] });
    const result = await guardedGenerate(
      async () => 'bad draft',
      'fallback',
      { userId: 'u1' },
      { ...deps, maxAttempts: 3 },
    );
    expect(result).toEqual({ text: 'fallback', attempts: 3, fellBack: true });
    expect(triggers).toHaveLength(3);
  });
});
