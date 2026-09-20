import type { Assumptions } from '../questionnaire/schema.js';

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  inflation_rate: 0.03,
  investment_growth_rate: 0.05,
  cash_growth_rate: 0.02,
  property_growth_rate: 0.03,
  withdrawal_rate: 0.04,
};

export const ASSUMPTION_RANGES: Record<keyof Assumptions, { min: number; max: number }> = {
  inflation_rate: { min: 0.02, max: 0.05 },
  investment_growth_rate: { min: 0.03, max: 0.07 },
  cash_growth_rate: { min: 0.001, max: 0.04 },
  property_growth_rate: { min: 0.001, max: 0.05 },
  withdrawal_rate: { min: 0.03, max: 0.05 },
};
