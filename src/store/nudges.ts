import type BetterSqlite3 from 'better-sqlite3';
import type { Nudge } from '../nudge/scheduler.js';

interface NudgeRow {
  id: string;
  user_id: string;
  assessment_id: string;
  due_at: string;
  sent_at: string | null;
  cancelled: number;
}

function toNudge(row: NudgeRow): Nudge {
  return {
    id: row.id,
    userId: row.user_id,
    assessmentId: row.assessment_id,
    dueAt: row.due_at,
    sentAt: row.sent_at,
    cancelled: row.cancelled === 1,
  };
}

export function insertNudge(db: BetterSqlite3.Database, n: Nudge): void {
  db.prepare(
    `INSERT INTO nudges (id, user_id, assessment_id, due_at, sent_at, cancelled)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(n.id, n.userId, n.assessmentId, n.dueAt, n.sentAt, n.cancelled ? 1 : 0);
}

export function dueNudges(db: BetterSqlite3.Database, now: string): Nudge[] {
  const rows = db
    .prepare(
      `SELECT * FROM nudges WHERE sent_at IS NULL AND cancelled = 0 AND due_at <= ? ORDER BY due_at ASC`,
    )
    .all(now) as NudgeRow[];
  return rows.map(toNudge);
}

export function markNudgeSent(db: BetterSqlite3.Database, id: string, sentAt: string): void {
  db.prepare(`UPDATE nudges SET sent_at = ? WHERE id = ?`).run(sentAt, id);
}

export function cancelPendingNudges(
  db: BetterSqlite3.Database,
  userId: string,
  _at: string,
): number {
  return db
    .prepare(`UPDATE nudges SET cancelled = 1 WHERE user_id = ? AND sent_at IS NULL AND cancelled = 0`)
    .run(userId).changes;
}

export function deleteUserNudges(db: BetterSqlite3.Database, userId: string): number {
  return db.prepare(`DELETE FROM nudges WHERE user_id = ?`).run(userId).changes;
}
