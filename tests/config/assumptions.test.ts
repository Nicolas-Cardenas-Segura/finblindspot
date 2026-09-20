import { describe, expect, it } from 'vitest';
import { ASSUMPTION_RANGES, DEFAULT_ASSUMPTIONS } from '../../src/config/assumptions.js';
import type { Assumptions } from '../../src/questionnaire/schema.js';

describe('assumptions', () => {
  it('keeps every default within its range', () => {
    for (const key of Object.keys(DEFAULT_ASSUMPTIONS) as Array<keyof Assumptions>) {
      const value = DEFAULT_ASSUMPTIONS[key];
      const range = ASSUMPTION_RANGES[key];

      expect(value).toBeGreaterThanOrEqual(range.min);
      expect(value).toBeLessThanOrEqual(range.max);
    }
  });
});
