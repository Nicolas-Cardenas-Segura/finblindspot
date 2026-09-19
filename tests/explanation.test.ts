import { expect, it } from 'vitest';
import { createReport, renderReport } from '../src/core/report';
import { emptyProfile } from '../src/core/profile';
import { selectExplanations, uncertainty } from '../src/core/explanation';

it('only permits model-selected educational phrases tied to actual ranked indicators', () => {
  const report = createReport(emptyProfile(), '2026-09-19T12:00:00Z');
  const explanations = selectExplanations(report, { selections: [{ indicatorId: 'runway', emphasis: 'uncertainty' }] });
  expect(explanations.runway).toBe(uncertainty.runway);
  expect(renderReport({ ...report, explanations })).toContain(uncertainty.runway);
  expect(() => selectExplanations(report, { selections: [{ indicatorId: 'runway', emphasis: 'uncertainty', text: 'Invented fact' }] })).toThrow();
  expect(() => selectExplanations(report, { selections: [{ indicatorId: 'crossBorder', emphasis: 'definition' }] })).toThrow();
  expect(() => selectExplanations(report, { selections: [{ indicatorId: 'runway', emphasis: 'definition' }, { indicatorId: 'runway', emphasis: 'uncertainty' }] })).toThrow();
});
