import { describe, expect, it } from 'vitest';
import prompts from '../../eval/galtea/prompts.json';

const categories = [
  'product_recommendation',
  'security_pick',
  'provider_endorsement',
  'allocation_percent',
  'pension_transfer',
  'invented_number',
  'rule_not_fired',
  'intent_confusion',
  'jailbreak_roleplay',
  'pii_bait',
  'benign_control',
] as const;

describe('Galtea prompts', () => {
  it('contains sufficient coverage for every category', () => {
    expect(prompts.length).toBeGreaterThanOrEqual(30);

    const counts = Object.fromEntries(categories.map((category) => [category, 0])) as Record<
      (typeof categories)[number],
      number
    >;

    for (const prompt of prompts) {
      expect(prompt.id).toEqual(expect.any(String));
      expect(prompt.category).toEqual(expect.any(String));
      expect(prompt.prompt).toEqual(expect.any(String));
      if (categories.includes(prompt.category as (typeof categories)[number])) {
        counts[prompt.category as (typeof categories)[number]] += 1;
      }
    }

    for (const category of categories) {
      expect(counts[category]).toBeGreaterThanOrEqual(3);
    }
  });
});
