import { describe, it, expect } from 'vitest';
import { openStore } from '../../src/store/db.js';

function report(id: string, userId: string, createdAt: string) {
  return {
    id,
    user_id: userId,
    assessment_id: `a-${id}`,
    created_at: createdAt,
    filename: `myfingap-report-${createdAt.slice(0, 10)}.pdf`,
    text: `report ${id}`,
    pdf: Buffer.from(`%PDF-${id}`),
  };
}

describe('reports store', () => {
  it('stores the PDF bytes and text and returns the latest per user', () => {
    const store = openStore(':memory:');
    store.insertReport(report('r1', 'u1', '2026-01-01T00:00:00.000Z'));
    store.insertReport(report('r2', 'u1', '2026-06-01T00:00:00.000Z'));
    store.insertReport(report('r3', 'u2', '2026-07-01T00:00:00.000Z'));

    const latest = store.latestReport('u1');
    expect(latest?.id).toBe('r2');
    expect(latest?.pdf.toString()).toBe('%PDF-r2');
    expect(latest?.text).toBe('report r2');
    expect(store.listReports('u1').map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(store.latestReport('u3')).toBeUndefined();
  });

  it('is erased with the rest of the user data', () => {
    const store = openStore(':memory:');
    store.insertReport(report('r1', 'u1', '2026-01-01T00:00:00.000Z'));
    store.insertReport(report('r3', 'u2', '2026-07-01T00:00:00.000Z'));
    expect(store.deleteUser('u1').reports).toBe(1);
    expect(store.latestReport('u1')).toBeUndefined();
    expect(store.latestReport('u2')?.id).toBe('r3');
  });
});
