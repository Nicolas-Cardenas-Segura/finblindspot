import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { profileSchema, type Profile } from './profile.js';
import { scorecardSchema, type Scorecard } from './engine.js';

const draftSchema = z.object({
  answers: profileSchema.partial(),
  previous: profileSchema.optional(),
  pending: z.object({ field: z.string(), answer: z.unknown() }).optional(),
  deleting: z.boolean().optional(),
}).strict();
export type Session = z.infer<typeof draftSchema>;
export const snapshotSchema = z.object({
  id: z.number().int(),
  createdAt: z.string().datetime(),
  profile: profileSchema,
  scorecard: scorecardSchema,
});
export type Snapshot = z.infer<typeof snapshotSchema>;

export class Store {
  private readonly db: DatabaseSync;

  constructor(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`
      PRAGMA secure_delete = ON;
      CREATE TABLE IF NOT EXISTS sessions (user_id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
        created_at TEXT NOT NULL, profile TEXT NOT NULL, scorecard TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS snapshots_user ON snapshots(user_id, id);
    `);
  }

  session(userId: string): Session | undefined {
    const row = this.db.prepare('SELECT payload FROM sessions WHERE user_id = ?').get(userId);
    return row ? draftSchema.parse(JSON.parse(String(row.payload))) : undefined;
  }

  saveSession(userId: string, session: Session): void {
    const payload = JSON.stringify(draftSchema.parse(session));
    this.db.prepare('INSERT INTO sessions VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload')
      .run(userId, payload);
  }

  clearSession(userId: string): void {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }

  snapshots(userId: string): Snapshot[] {
    return this.db.prepare('SELECT * FROM snapshots WHERE user_id = ? ORDER BY id').all(userId)
      .map((row) => snapshotSchema.parse({
        id: Number(row.id), createdAt: String(row.created_at),
        profile: JSON.parse(String(row.profile)), scorecard: JSON.parse(String(row.scorecard)),
      }));
  }

  complete(userId: string, profile: Profile, scorecard: Scorecard, now = new Date()): Snapshot {
    const p = profileSchema.parse(profile), s = scorecardSchema.parse(scorecard);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = this.db.prepare(
        'INSERT INTO snapshots (user_id, created_at, profile, scorecard) VALUES (?, ?, ?, ?)',
      ).run(userId, now.toISOString(), JSON.stringify(p), JSON.stringify(s));
      this.clearSession(userId);
      this.db.exec('COMMIT');
      return { id: Number(result.lastInsertRowid), createdAt: now.toISOString(), profile: p, scorecard: s };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  deleteUser(userId: string): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.clearSession(userId);
      this.db.prepare('DELETE FROM snapshots WHERE user_id = ?').run(userId);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void { this.db.close(); }
}
