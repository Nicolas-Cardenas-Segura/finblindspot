import Database from 'better-sqlite3';
import type { Assessment } from '../assess/assess.js';
import type { InterviewState } from '../interview/stateMachine.js';
import type { Nudge } from '../nudge/scheduler.js';
import type { Verdict } from '../guardrail/classifier.js';
import {
  clearState,
  deleteUserAssessments,
  insertAssessment,
  latestComplete,
  listAssessments,
  loadState,
  saveState,
} from './assessments.js';
import {
  cancelPendingNudges,
  deleteUserNudges,
  dueNudges,
  insertNudge,
  markNudgeSent,
} from './nudges.js';
import { countTriggers, deleteUserTriggers, logTrigger } from './triggers.js';

export interface ComplianceTrigger {
  userId: string;
  createdAt: string;
  draft: string;
  verdict: Verdict;
  attempt: number;
  reason: 'classifier' | 'invented_number';
}

export interface Store {
  insertAssessment(a: Assessment): void;
  latestComplete(userId: string): Assessment | undefined;
  listAssessments(userId: string): Assessment[];
  saveState(s: InterviewState): void;
  loadState(userId: string): InterviewState | undefined;
  clearState(userId: string): void;
  insertNudge(n: Nudge): void;
  dueNudges(now: string): Nudge[];
  markNudgeSent(id: string, sentAt: string): void;
  cancelPendingNudges(userId: string, at: string): number;
  logTrigger(t: ComplianceTrigger): void;
  countTriggers(since?: string): number;
  deleteUser(userId: string): { assessments: number; states: number; nudges: number; triggers: number };
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  created_at TEXT,
  status TEXT,
  base_currency TEXT,
  answers_json TEXT,
  assumptions_json TEXT,
  derived_json TEXT,
  results_json TEXT,
  blind_spots_json TEXT,
  unanswered_json TEXT,
  not_assessed_json TEXT
);
CREATE TABLE IF NOT EXISTS interview_state (
  user_id TEXT PRIMARY KEY,
  state_json TEXT
);
CREATE TABLE IF NOT EXISTS nudges (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  assessment_id TEXT,
  due_at TEXT,
  sent_at TEXT,
  cancelled INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS compliance_triggers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  created_at TEXT,
  draft TEXT,
  verdict TEXT,
  attempt INTEGER,
  reason TEXT
);
`;

function migrate(db: Database.Database): void {
  const columns = new Set(
    (db.prepare(`PRAGMA table_info(assessments)`).all() as { name: string }[]).map((c) => c.name),
  );
  for (const column of ['unanswered_json', 'not_assessed_json']) {
    if (!columns.has(column)) db.exec(`ALTER TABLE assessments ADD COLUMN ${column} TEXT`);
  }
}

export function openStore(path: string | ':memory:'): Store {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  migrate(db);

  return {
    insertAssessment: (a) => insertAssessment(db, a),
    latestComplete: (userId) => latestComplete(db, userId),
    listAssessments: (userId) => listAssessments(db, userId),
    saveState: (s) => saveState(db, s),
    loadState: (userId) => loadState(db, userId),
    clearState: (userId) => clearState(db, userId),
    insertNudge: (n) => insertNudge(db, n),
    dueNudges: (now) => dueNudges(db, now),
    markNudgeSent: (id, sentAt) => markNudgeSent(db, id, sentAt),
    cancelPendingNudges: (userId, at) => cancelPendingNudges(db, userId, at),
    logTrigger: (t) => logTrigger(db, t),
    countTriggers: (since) => countTriggers(db, since),
    deleteUser: (userId) => {
      const { assessments, states } = deleteUserAssessments(db, userId);
      const nudges = deleteUserNudges(db, userId);
      const triggers = deleteUserTriggers(db, userId);
      return { assessments, states, nudges, triggers };
    },
  };
}
