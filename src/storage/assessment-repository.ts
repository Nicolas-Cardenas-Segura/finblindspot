import { createHash, randomBytes } from 'node:crypto';
import type { Client, InStatement } from '@libsql/client';
import { emptyProfile, profileSchema, type FinancialProfile } from '../core/profile';
import { initialState, stateSchema, type InterviewState } from '../core/interview';
import type { Report } from '../core/report';
import { openDatabase, prepareDatabase } from './database';

export type AssessmentRecord = { owner: string; profile: FinancialProfile; state: InterviewState; expiresAt: number };
export type Snapshot = { id: string; report: Report; text: string };
export type Capability = { token: string; hash: string; expiresAt: number };
export const hashCapability = (token: string) => createHash('sha256').update(token).digest('hex');
export const newCapability = (ttlMs: number): Capability => { const token = randomBytes(32).toString('base64url'); return { token, hash: hashCapability(token), expiresAt: Date.now() + ttlMs }; };
export class AssessmentRepository {
  private client!: Client;
  constructor(private url: string, readonly retentionDays: number) {}
  async init(): Promise<void> {
    await prepareDatabase(this.url);
    this.client = openDatabase(this.url);
    await this.client.executeMultiple(`
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS assessments (owner TEXT PRIMARY KEY, profile TEXT NOT NULL, state TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS turns (owner TEXT NOT NULL, turn_id TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY(owner, turn_id));
      CREATE TABLE IF NOT EXISTS snapshots (id TEXT PRIMARY KEY, owner TEXT NOT NULL, report TEXT NOT NULL, profile TEXT NOT NULL, response TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS snapshots_owner ON snapshots(owner, created_at);
      CREATE TABLE IF NOT EXISTS capabilities (hash TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL, owner TEXT NOT NULL, expires_at INTEGER NOT NULL);
    `);
  }
  fresh(owner: string): AssessmentRecord { return { owner, profile: emptyProfile(), state: initialState(), expiresAt: Date.now() + this.retentionDays * 86400000 }; }
  async load(owner: string): Promise<AssessmentRecord | null> {
    const { rows } = await this.client.execute({ sql: 'SELECT * FROM assessments WHERE owner = ? AND expires_at > ?', args: [owner, Date.now()] });
    if (!rows[0]) return null;
    return { owner, profile: profileSchema.parse(JSON.parse(String(rows[0].profile))), state: stateSchema.parse(JSON.parse(String(rows[0].state))), expiresAt: Number(rows[0].expires_at) };
  }
  async createSession(owner: string): Promise<void> {
    const record = this.fresh(owner);
    await this.client.execute({ sql: 'INSERT INTO assessments(owner,profile,state,expires_at) VALUES(?,?,?,?)', args: [owner, JSON.stringify(record.profile), JSON.stringify(record.state), record.expiresAt] });
  }
  async requestForget(record: AssessmentRecord): Promise<void> {
    await this.client.execute({ sql: 'UPDATE assessments SET state=? WHERE owner=?', args: [JSON.stringify({ ...record.state, forgetRequested: true }), record.owner] });
  }
  async isExpired(owner: string): Promise<boolean> {
    const { rows } = await this.client.execute({ sql: 'SELECT owner FROM assessments WHERE owner=? AND expires_at<=?', args: [owner, Date.now()] });
    return rows.length > 0;
  }
  async activeEvalCount(): Promise<number> {
    const { rows } = await this.client.execute({ sql: "SELECT count(*) AS total FROM assessments WHERE owner LIKE 'eval:%' AND expires_at>?", args: [Date.now()] });
    return Number(rows[0]?.total ?? 0);
  }
  async getTurn(owner: string, turnId: string): Promise<string | null> {
    const { rows } = await this.client.execute({ sql: 'SELECT response FROM turns JOIN assessments USING(owner) WHERE owner = ? AND turn_id = ? AND expires_at > ?', args: [owner, turnId, Date.now()] });
    return rows[0] ? String(rows[0].response) : null;
  }
  private snapshotStatement(owner: string, snapshot: Snapshot, profile: FinancialProfile): InStatement {
    return { sql: 'INSERT INTO snapshots(id, owner, report, profile, response, created_at) VALUES(?,?,?,?,?,?)', args: [snapshot.id, owner, JSON.stringify(snapshot.report), JSON.stringify(profile), snapshot.text, snapshot.report.createdAt] };
  }
  async commitTurn(record: AssessmentRecord, turnId: string, response: string, snapshot?: Snapshot, capability?: Capability): Promise<void> {
    const statements: InStatement[] = [
      { sql: 'INSERT INTO turns(owner, turn_id, response) VALUES(?,?,?)', args: [record.owner, turnId, response] },
      { sql: 'INSERT INTO assessments(owner,profile,state,expires_at) VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET profile=excluded.profile,state=excluded.state', args: [record.owner, JSON.stringify(profileSchema.parse(record.profile)), JSON.stringify(stateSchema.parse(record.state)), record.expiresAt] },
    ];
    if (snapshot) statements.push(this.snapshotStatement(record.owner, snapshot, record.profile));
    if (snapshot && capability) statements.push({ sql: 'INSERT INTO capabilities(hash,snapshot_id,owner,expires_at) VALUES(?,?,?,?)', args: [capability.hash, snapshot.id, record.owner, Math.min(capability.expiresAt, record.expiresAt)] });
    await this.client.batch(statements, 'write');
  }
  async saveSnapshot(owner: string, id: string, report: Report, text: string): Promise<void> {
    const record = await this.load(owner);
    if (!record) throw new Error('Assessment unavailable');
    await this.client.execute(this.snapshotStatement(owner, { id, report, text }, record.profile));
  }
  async baseline(owner: string): Promise<Snapshot | null> {
    const { rows } = await this.client.execute({ sql: 'SELECT s.id,s.report,s.response FROM snapshots s JOIN assessments a ON a.owner=s.owner WHERE s.owner=? AND a.expires_at>? ORDER BY s.rowid LIMIT 1', args: [owner, Date.now()] });
    return rows[0] ? { id: String(rows[0].id), report: JSON.parse(String(rows[0].report)), text: String(rows[0].response) } : null;
  }
  async createCapability(owner: string, snapshotId: string, ttlMs: number): Promise<string> {
    const record = await this.load(owner);
    if (!record) throw new Error('Assessment unavailable');
    const capability = newCapability(ttlMs);
    const result = await this.client.execute({ sql: 'INSERT INTO capabilities(hash,snapshot_id,owner,expires_at) SELECT ?,id,owner,? FROM snapshots WHERE id=? AND owner=?', args: [capability.hash, Math.min(record.expiresAt, capability.expiresAt), snapshotId, owner] });
    if (!result.rowsAffected) throw new Error('Snapshot unavailable');
    return capability.token;
  }
  async getReport(token: string): Promise<Snapshot | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const { rows } = await this.client.execute({ sql: 'SELECT s.id,s.report,s.response FROM capabilities c JOIN snapshots s ON s.id=c.snapshot_id AND s.owner=c.owner JOIN assessments a ON a.owner=c.owner WHERE c.hash=? AND c.expires_at>? AND a.expires_at>?', args: [hashCapability(token), Date.now(), Date.now()] });
    return rows[0] ? { id: String(rows[0].id), report: JSON.parse(String(rows[0].report)), text: String(rows[0].response) } : null;
  }
  async forget(owner: string): Promise<void> {
    await this.client.batch(['capabilities', 'snapshots', 'turns', 'assessments'].map(table => ({ sql: `DELETE FROM ${table} WHERE owner=?`, args: [owner] })), 'write');
  }
  async expiredOwners(): Promise<string[]> {
    const { rows } = await this.client.execute({ sql: 'SELECT owner FROM assessments WHERE expires_at<=?', args: [Date.now()] });
    return rows.map(row => String(row.owner));
  }
  close(): void { this.client?.close(); }
}
