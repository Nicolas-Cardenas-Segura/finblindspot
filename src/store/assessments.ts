import type BetterSqlite3 from 'better-sqlite3';
import type { Assessment } from '../assess/assess.js';
import type { InterviewState } from '../interview/stateMachine.js';

interface AssessmentRow {
  id: string;
  user_id: string;
  created_at: string;
  status: string;
  base_currency: string;
  answers_json: string;
  assumptions_json: string;
  derived_json: string;
  results_json: string;
  blind_spots_json: string;
  unanswered_json: string | null;
  not_assessed_json: string | null;
}

function toAssessment(row: AssessmentRow): Assessment {
  return {
    id: row.id,
    user_id: row.user_id,
    created_at: row.created_at,
    status: row.status as Assessment['status'],
    base_currency: row.base_currency as Assessment['base_currency'],
    answers: JSON.parse(row.answers_json) as Assessment['answers'],
    assumptions: JSON.parse(row.assumptions_json) as Assessment['assumptions'],
    derived: JSON.parse(row.derived_json) as Assessment['derived'],
    results: JSON.parse(row.results_json) as Assessment['results'],
    blind_spots: JSON.parse(row.blind_spots_json) as Assessment['blind_spots'],
    unanswered: JSON.parse(row.unanswered_json ?? '[]') as Assessment['unanswered'],
    not_assessed: JSON.parse(row.not_assessed_json ?? '[]') as Assessment['not_assessed'],
  };
}

export function insertAssessment(db: BetterSqlite3.Database, a: Assessment): void {
  db.prepare(
    `INSERT INTO assessments (id, user_id, created_at, status, base_currency, answers_json, assumptions_json, derived_json, results_json, blind_spots_json, unanswered_json, not_assessed_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    a.id,
    a.user_id,
    a.created_at,
    a.status,
    a.base_currency,
    JSON.stringify(a.answers),
    JSON.stringify(a.assumptions),
    JSON.stringify(a.derived),
    JSON.stringify(a.results),
    JSON.stringify(a.blind_spots),
    JSON.stringify(a.unanswered),
    JSON.stringify(a.not_assessed),
  );
}

export function latestComplete(
  db: BetterSqlite3.Database,
  userId: string,
): Assessment | undefined {
  const row = db
    .prepare(
      `SELECT * FROM assessments WHERE user_id = ? AND status = 'complete' ORDER BY created_at DESC LIMIT 1`,
    )
    .get(userId) as AssessmentRow | undefined;
  return row ? toAssessment(row) : undefined;
}

export function listAssessments(db: BetterSqlite3.Database, userId: string): Assessment[] {
  const rows = db
    .prepare(`SELECT * FROM assessments WHERE user_id = ? ORDER BY created_at ASC`)
    .all(userId) as AssessmentRow[];
  return rows.map(toAssessment);
}

export function saveState(db: BetterSqlite3.Database, s: InterviewState): void {
  db.prepare(
    `INSERT INTO interview_state (user_id, state_json) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET state_json = excluded.state_json`,
  ).run(s.userId, JSON.stringify(s));
}

export function loadState(
  db: BetterSqlite3.Database,
  userId: string,
): InterviewState | undefined {
  const row = db
    .prepare(`SELECT state_json FROM interview_state WHERE user_id = ?`)
    .get(userId) as { state_json: string } | undefined;
  return row ? (JSON.parse(row.state_json) as InterviewState) : undefined;
}

export function clearState(db: BetterSqlite3.Database, userId: string): void {
  db.prepare(`DELETE FROM interview_state WHERE user_id = ?`).run(userId);
}

export function deleteUserAssessments(
  db: BetterSqlite3.Database,
  userId: string,
): { assessments: number; states: number } {
  const assessments = db.prepare(`DELETE FROM assessments WHERE user_id = ?`).run(userId).changes;
  const states = db.prepare(`DELETE FROM interview_state WHERE user_id = ?`).run(userId).changes;
  return { assessments, states };
}
