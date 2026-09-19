import { describe, expect, it } from 'vitest';
import { scoreIndicator, rankBlindspots } from '../src/core/rules';
import type { Indicator, IndicatorId } from '../src/core/indicators';

const metric = (id: IndicatorId, min: number, max = min): Indicator => ({ id, range: { min, max }, unit: 'ratio', reason: 'calculated', inputs: [] });

describe('illustrative threshold boundaries', () => {
  it.each([
    ['runway', 2.999, 'red'], ['runway', 3, 'amber'], ['runway', 6, 'green'],
    ['debt', 0.1999, 'green'], ['debt', 0.2, 'amber'], ['debt', 0.4, 'red'],
    ['concentration', 0.5999, 'green'], ['concentration', 0.6, 'amber'], ['concentration', 0.8, 'red'],
    ['retirement', 0, 'green'], ['retirement', 1, 'amber'], ['retirement', 2, 'red'],
    ['crossBorder', 0, 'green'], ['crossBorder', 1, 'amber'], ['crossBorder', 3, 'red'],
  ] as const)('%s %s -> %s', (id, value, status) => {
    expect(scoreIndicator(metric(id, value)).status).toBe(status);
  });
  it('does not colour uncertain ranges', () => {
    expect(scoreIndicator(metric('runway', 2, 5)).status).toBe('not_assessed');
  });
  it('does not fabricate three problems from green cards', () => {
    expect(rankBlindspots([scoreIndicator(metric('runway', 10)), scoreIndicator(metric('debt', 0))])).toEqual([]);
  });
  it('uses stable priority and caps at three', () => {
    const cards = (['runway', 'debt', 'concentration', 'retirement'] as const).map(id => scoreIndicator(metric(id, id === 'runway' ? 1 : 10)));
    expect(rankBlindspots(cards).map(c => c.id)).toEqual(['runway', 'debt', 'retirement']);
  });
});
