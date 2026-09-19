import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { AssessmentRepository } from '../src/storage/assessment-repository';
import { emptyProfile } from '../src/core/profile';
import { initialState } from '../src/core/interview';
import { createReport } from '../src/core/report';

it('persists profiles, deduplicates turns, protects reports and forgets only one owner', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'blindspot-'));
  const url = `file:${join(dir, 'app.db')}`;
  let repo = new AssessmentRepository(url, 7);
  try {
    await repo.init();
    const profile = emptyProfile();
    const record = { owner: 'eval:a', profile, state: initialState(), expiresAt: Date.now() + 60000 };
    await repo.commitTurn(record, 'turn-1', 'Approved educational text.');
    await repo.commitTurn({ ...record, owner: 'eval:b' }, 'turn-1', 'Other user.');
    const report = createReport(profile, new Date().toISOString());
    await repo.saveSnapshot('eval:a', 'snapshot-1', report, 'Approved educational text.');
    const token = await repo.createCapability('eval:a', 'snapshot-1', 60000);
    expect(await repo.getReport('not-a-token')).toBeNull();
    expect((await repo.getReport(token))?.report).toEqual(report);
    expect(await repo.getTurn('eval:a', 'turn-1')).toBe('Approved educational text.');
    await expect(repo.commitTurn(record, 'turn-1', 'Duplicate')).rejects.toThrow();
    repo.close();
    repo = new AssessmentRepository(url, 7);
    await repo.init();
    expect((await repo.load('eval:a'))?.profile).toEqual(profile);
    expect((await repo.baseline('eval:a'))?.report).toEqual(report);
    await repo.saveSnapshot('eval:a', 'earlier-alphabetically', { ...report, currency: 'USD' }, 'Later snapshot.');
    expect((await repo.baseline('eval:a'))?.id).toBe('snapshot-1');
    expect(await repo.baseline('eval:b')).toBeNull();
    const expired = await repo.createCapability('eval:a', 'snapshot-1', -1);
    expect(await repo.getReport(expired)).toBeNull();
    await repo.forget('eval:a');
    expect(await repo.getReport(token)).toBeNull();
    expect(await repo.load('eval:a')).toBeNull();
    expect(await repo.load('eval:b')).not.toBeNull();
  } finally { repo.close(); await rm(dir, { recursive: true, force: true }); }
});
