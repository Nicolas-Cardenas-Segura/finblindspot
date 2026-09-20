import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evalMessageSchema, evalFinishSchema } from '../src/server/eval-routes';
import { AssessmentRepository } from '../src/storage/assessment-repository';

const legacyId = '5c9db7cb-5e66-4ec6-9803-b7d13f25bd82';

describe('evaluation request contract', () => {
  it('accepts a native Galtea identifier without a pre-created app session', () => {
    expect(evalMessageSchema.parse({ galtea_session_id: 'galtea_session_123', message: '/quick' })).toEqual({ galtea_session_id: 'galtea_session_123', message: '/quick' });
    expect(evalFinishSchema.parse({ galtea_session_id: 'galtea_session_123' })).toEqual({ galtea_session_id: 'galtea_session_123' });
  });
  it('preserves the explicit UUID lifecycle', () => {
    expect(evalMessageSchema.safeParse({ session_id: legacyId, message: '/start' }).success).toBe(true);
    expect(evalFinishSchema.safeParse({ session_id: legacyId }).success).toBe(true);
    expect(evalMessageSchema.safeParse({ session_id: 'thread_abc123', message: '/start' }).success).toBe(false);
  });
  it.each(['', ' ', '{{ galtea_session_id }}', 'x'.repeat(201), 'id\nnext'])('rejects absent or unrendered native identifiers: %s', galtea_session_id => {
    expect(evalMessageSchema.safeParse({ galtea_session_id, message: '/start' }).success).toBe(false);
  });
  it('rejects ambiguous identities and caller-supplied owners', () => {
    expect(evalMessageSchema.safeParse({ session_id: legacyId, galtea_session_id: 'other', message: '/start' }).success).toBe(false);
    expect(evalMessageSchema.safeParse({ galtea_session_id: 'other', owner: 'telegram:victim', message: '/start' }).success).toBe(false);
    expect(evalMessageSchema.safeParse({ message: '/start' }).success).toBe(false);
  });
});

it('atomically maps Galtea IDs to private persistent sessions without resetting progress', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'blindspot-galtea-'));
  const url = `file:${join(directory, 'app.db')}`;
  let repository = new AssessmentRepository(url, 7);
  try {
    await repository.init();
    const results = await Promise.all(Array.from({ length: 6 }, () => repository.resolveGalteaSession('galtea_session_123')));
    for (const result of results) expect(result.status).toBe('ready');
    const first = results[0];
    if (first.status !== 'ready') throw new Error('Expected a session');
    expect(new Set(results.map(result => result.status === 'ready' ? result.owner : null)).size).toBe(1);
    expect(first.owner).toMatch(/^eval:[a-f0-9-]{36}$/);
    expect(await repository.activeEvalCount()).toBe(1);
    const record = (await repository.load(first.owner))!;
    record.profile.residency = { status: 'known', value: { country: 'ES', currency: 'EUR' } };
    record.state.mode = 'quick'; record.state.answered = ['residency'];
    await repository.commitTurn(record, 'synthetic-turn', 'Validated synthetic response.');
    const second = await repository.resolveGalteaSession('another-galtea-session');
    expect(second.status).toBe('ready');
    if (second.status !== 'ready') throw new Error('Expected another session');
    expect(second.owner).not.toBe(first.owner);
    expect((await repository.load(second.owner))?.profile.residency.status).toBe('unknown');
    repository.close();
    repository = new AssessmentRepository(url, 7);
    await repository.init();
    expect(await repository.resolveGalteaSession('galtea_session_123')).toEqual(first);
    expect((await repository.load(first.owner))?.state.answered).toEqual(['residency']);
    expect(await repository.galteaSessionOwner('not-created')).toBeNull();
    await repository.forget(first.owner);
    expect(await repository.galteaSessionOwner('galtea_session_123')).toBeNull();
    expect(await repository.load(first.owner)).toBeNull();
    expect(await repository.load(second.owner)).not.toBeNull();
    const recreated = await repository.resolveGalteaSession('galtea_session_123');
    expect(recreated.status).toBe('ready');
    if (recreated.status !== 'ready') throw new Error('Expected a fresh session');
    expect(recreated.owner).not.toBe(first.owner);
    expect((await repository.load(recreated.owner))?.profile.residency.status).toBe('unknown');
    await repository.createSession(`eval:${legacyId}`);
    const namedLikeLegacy = await repository.resolveGalteaSession(legacyId);
    expect(namedLikeLegacy.status).toBe('ready');
    if (namedLikeLegacy.status !== 'ready') throw new Error('Expected an isolated native session');
    expect(namedLikeLegacy.owner).not.toBe(`eval:${legacyId}`);
  } finally { repository.close(); await rm(directory, { recursive: true, force: true }); }
});

it('does not reset an expired native session before retention cleanup', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'blindspot-galtea-expired-'));
  const repository = new AssessmentRepository(`file:${join(directory, 'app.db')}`, 0);
  try {
    await repository.init();
    expect(await repository.resolveGalteaSession('expired')).toEqual({ status: 'expired' });
    const owner = await repository.galteaSessionOwner('expired');
    expect(owner).not.toBeNull();
    expect(await repository.resolveGalteaSession('expired')).toEqual({ status: 'expired' });
    expect(await repository.galteaSessionOwner('expired')).toBe(owner);
    expect(await repository.load(owner!)).toBeNull();
    await repository.forget(owner!);
    expect(await repository.galteaSessionOwner('expired')).toBeNull();
  } finally { repository.close(); await rm(directory, { recursive: true, force: true }); }
});

it('keeps capacity checks atomic while allowing existing sessions to resume', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'blindspot-galtea-limit-'));
  const repository = new AssessmentRepository(`file:${join(directory, 'app.db')}`, 7);
  try {
    await repository.init();
    const results = await Promise.all(['one', 'two', 'three'].map(id => repository.resolveGalteaSession(id, 1)));
    expect(results.filter(result => result.status === 'ready')).toHaveLength(1);
    expect(results.filter(result => result.status === 'limit')).toHaveLength(2);
    const winner = results.findIndex(result => result.status === 'ready');
    expect(await repository.resolveGalteaSession(['one', 'two', 'three'][winner], 1)).toEqual(results[winner]);
    expect(await repository.activeEvalCount()).toBe(1);
  } finally { repository.close(); await rm(directory, { recursive: true, force: true }); }
});
