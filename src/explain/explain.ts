import type OpenAI from 'openai';
import type { Assessment } from '../assess/assess.js';
import type { GuardDeps } from '../guardrail/guard.js';
import { guardedGenerate } from '../guardrail/guard.js';
import { MODELS } from '../llm/nebius.js';
import { EXPLANATION_PROMPT, SYSTEM_PROMPT } from '../llm/prompts.js';
import type { FiredRule } from '../rules/evaluate.js';
import type { RuleId } from '../rules/rules.js';
import { fillPlaceholders, loadContent } from './content.js';

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function ratio(top: number | null, bottom: number | null): number | null {
  if (top === null || bottom === null || bottom <= 0) return null;
  return round(top / bottom);
}

function positionAt(assessment: Assessment, rate: number): number | null {
  const entry = assessment.results.sensitivity.find((r) => r.withdrawal_rate === rate);
  return entry === undefined ? null : entry.position;
}

function ruleNumbers(ruleId: RuleId, assessment: Assessment): Record<string, number | null> {
  const a = assessment.answers;
  const d = assessment.derived;
  const r = assessment.results;

  switch (ruleId) {
    case 'thin_emergency_fund':
      return {
        cash_total: a.cash_total,
        monthly_spending: d.monthly_spending,
        months_of_cover: ratio(a.cash_total, d.monthly_spending),
      };
    case 'negative_surplus':
      return {
        income_monthly: a.income_monthly,
        monthly_spending: d.monthly_spending,
        monthly_surplus: d.monthly_surplus,
      };
    case 'family_unprotected':
      return {
        dependants: a.dependants,
        life_cover_amount: typeof a.life_cover_amount === 'number' ? a.life_cover_amount : null,
        monthly_spending: d.monthly_spending,
      };
    case 'no_income_safety_net':
    case 'no_health_cover':
      return { income_monthly: a.income_monthly, monthly_spending: d.monthly_spending };
    case 'succession_gap':
      return { will_year: typeof a.will_year === 'number' ? a.will_year : null };
    case 'education_unfunded':
      return { dependants: a.dependants };
    case 'pension_visibility':
      return { pensions: a.pensions.length, financial_assets: d.financial_assets };
    case 'pension_timing_gap':
      return { retire_age: a.retire_age, excluded_pensions: r.excluded_pensions.length };
    case 'scattered_pensions':
      return {
        pensions: a.pensions.length,
        pension_countries: new Set(a.pensions.map((p) => p.pension_country)).size,
      };
    case 'beneficiary_gap':
      return { financial_assets: d.financial_assets };
    case 'fees_unknown':
      return { investments_total: a.investments_total };
    case 'expensive_debt':
      return { debt_total: a.debt_total, debt_max_rate: a.debt_max_rate };
    case 'debt_into_retirement':
      return { debt_at_retirement: a.debt_at_retirement, retire_age: a.retire_age };
    case 'cash_concentration':
      return {
        cash_total: a.cash_total,
        financial_assets: d.financial_assets,
        cash_share: ratio(a.cash_total, d.financial_assets),
      };
    case 'property_concentration':
      return {
        property_net: d.property_net,
        net_worth: d.net_worth,
        property_share: ratio(d.property_net, d.net_worth),
      };
    case 'currency_exposure':
      return { cash_total: a.cash_total, money_countries: a.money_countries.length };
    case 'single_point_of_failure':
      return { net_worth: d.net_worth };
    case 'retirement_gap':
      return {
        years: r.years,
        required_pot: r.required_pot,
        projected_assets: r.projected_assets,
        position: positionAt(assessment, 0.04),
        extra_monthly: r.extra_monthly,
      };
    case 'lifestyle_reality_check':
      return {
        retire_income_monthly: a.retire_income_monthly,
        monthly_spending: d.monthly_spending,
      };
  }
}

export async function explainBlindSpot(
  rule: FiredRule,
  assessment: Assessment,
  deps: { client: OpenAI; guard: GuardDeps },
): Promise<string> {
  const content = loadContent()[rule.rule_id];
  const fallback = fillPlaceholders(content.why, assessment.answers, assessment.results);
  const numbers = ruleNumbers(rule.rule_id, assessment);
  const prompt = EXPLANATION_PROMPT({ ...content, why: fallback }, numbers);

  const generated = await guardedGenerate(
    async () => {
      const response = await deps.client.chat.completions.create({
        model: MODELS.interview,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      });
      return response.choices[0]?.message?.content?.trim() ?? '';
    },
    fallback,
    { userId: assessment.user_id },
    deps.guard,
  );

  return generated.text;
}
