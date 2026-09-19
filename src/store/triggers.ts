import type BetterSqlite3 from 'better-sqlite3';
import type { ComplianceTrigger } from './db.js';

export function logTrigger(db: BetterSqlite3.Database, t: ComplianceTrigger): void {
  db.prepare(
    `INSERT INTO compliance_triggers (user_id, created_at, draft, verdict, attempt, reason)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(t.userId, t.createdAt, t.draft, t.verdict, t.attempt, t.reason);
}

export function countTriggers(db: BetterSqlite3.Database, since?: string): number {
  const row = since
    ? (db
        .prepare(`SELECT COUNT(*) AS n FROM compliance_triggers WHERE created_at >= ?`)
        .get(since) as { n: number })
    : (db.prepare(`SELECT COUNT(*) AS n FROM compliance_triggers`).get() as { n: number });
  return row.n;
}

export function deleteUserTriggers(db: BetterSqlite3.Database, userId: string): number {
  return db.prepare(`DELETE FROM compliance_triggers WHERE user_id = ?`).run(userId).changes;
}
