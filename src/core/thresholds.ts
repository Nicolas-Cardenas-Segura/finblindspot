export const RULES_VERSION = '2026-09-19.1';
export const thresholds = {
  runway: { amber: 3, green: 6 },
  debt: { amber: 0.2, red: 0.4 },
  concentration: { amber: 0.6, red: 0.8 },
  retirement: { amber: 1, red: 2 },
  crossBorder: { amber: 1, red: 3 },
} as const;
export const thresholdDescriptions = {
  runway: 'Red: below 3 months; amber: 3 to below 6; green: 6 or more.',
  debt: 'Green: below 20%; amber: 20% to below 40%; red: 40% or more of take-home income.',
  concentration: 'Green: below 60%; amber: 60% to below 80%; red: 80% or more in one reported asset class.',
  retirement: 'Green: no missing applicable fields; amber: one; red: two or more. Measures visibility, not adequacy.',
  crossBorder: 'Extra reported jurisdictions + extra reported currencies + unverified foreign pensions. Green: zero; amber: one or two; red: three or more.',
} as const;
export const LIMITATION = 'Illustrative educational indicators based on self-reported estimates, not universal standards or financial advice. No products, allocations, pension entitlements or tax rules are recommended or inferred.';
