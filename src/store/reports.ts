import type BetterSqlite3 from 'better-sqlite3';

export interface StoredReport {
  id: string;
  user_id: string;
  assessment_id: string;
  created_at: string;
  filename: string;
  text: string;
  pdf: Buffer;
}

interface ReportRow {
  id: string;
  user_id: string;
  assessment_id: string;
  created_at: string;
  filename: string;
  text: string;
  pdf: Buffer;
}

export function insertReport(db: BetterSqlite3.Database, r: StoredReport): void {
  db.prepare(
    `INSERT INTO reports (id, user_id, assessment_id, created_at, filename, text, pdf)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(r.id, r.user_id, r.assessment_id, r.created_at, r.filename, r.text, r.pdf);
}

export function latestReport(db: BetterSqlite3.Database, userId: string): StoredReport | undefined {
  const row = db
    .prepare(`SELECT * FROM reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(userId) as ReportRow | undefined;
  return row === undefined ? undefined : { ...row, pdf: Buffer.from(row.pdf) };
}

export function listReports(db: BetterSqlite3.Database, userId: string): StoredReport[] {
  const rows = db
    .prepare(`SELECT * FROM reports WHERE user_id = ? ORDER BY created_at ASC`)
    .all(userId) as ReportRow[];
  return rows.map((row) => ({ ...row, pdf: Buffer.from(row.pdf) }));
}

export function deleteUserReports(db: BetterSqlite3.Database, userId: string): number {
  return db.prepare(`DELETE FROM reports WHERE user_id = ?`).run(userId).changes;
}
