import type { Answers } from '../questionnaire/schema.js';
import type { Derived } from '../engine/derived.js';
import type { Results } from '../engine/projection.js';

const NUMBER_PATTERN = /\d[\d,]*(?:\.\d+)?\s*k?/gi;

function add(set: Set<number>, value: number | null | undefined): void {
  if (value === null || value === undefined || !Number.isFinite(value)) return;
  const n = Math.abs(value);
  set.add(n);
  set.add(Math.round(n / 100) * 100);
  set.add(Math.round(n * 10) / 10);
}

export function extractNumbers(text: string): number[] {
  const found: number[] = [];
  for (const raw of text.match(NUMBER_PATTERN) ?? []) {
    const token = raw.trim().toLowerCase();
    const multiplier = token.endsWith('k') ? 1000 : 1;
    const n = Number(token.replace(/k$/, '').replace(/,/g, '').trim());
    if (Number.isFinite(n)) found.push(n * multiplier);
  }
  return found;
}

export function allowedNumbers(a: Answers, d: Derived, r: Results, libraryText: string): Set<number> {
  const set = new Set<number>();

  for (const value of Object.values(a)) {
    if (typeof value === 'number') add(set, value);
  }
  for (const p of a.pensions) {
    for (const value of Object.values(p)) {
      if (typeof value === 'number') add(set, value);
    }
  }

  add(set, d.monthly_spending);
  add(set, d.monthly_surplus);
  add(set, d.net_worth);
  add(set, d.financial_assets);
  add(set, d.property_net);

  if (typeof a.cash_total === 'number' && d.monthly_spending !== null && d.monthly_spending > 0) {
    add(set, a.cash_total / d.monthly_spending);
  }

  add(set, r.years);
  add(set, r.required_pot);
  add(set, r.projected_assets);
  add(set, r.position);
  add(set, r.position_today);
  add(set, r.extra_monthly);
  for (const s of r.sensitivity) {
    add(set, s.withdrawal_rate);
    add(set, s.required_pot);
    add(set, s.position);
    add(set, s.position_today);
  }

  for (const n of extractNumbers(libraryText)) add(set, n);

  return set;
}

export function hasInventedNumber(draft: string, allowed: Set<number>): boolean {
  for (const n of extractNumbers(draft)) {
    const value = Math.abs(n);
    let ok = false;
    for (const a of allowed) {
      if (a === 0 ? value === 0 : Math.abs(value - a) <= 0.01 * Math.abs(a)) {
        ok = true;
        break;
      }
    }
    if (!ok) return true;
  }
  return false;
}
