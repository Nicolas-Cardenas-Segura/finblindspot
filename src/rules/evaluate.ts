import type { Topic } from '../questionnaire/schema.js';
import { RULES } from './rules.js';
import type { RuleContext, RuleId, Severity } from './rules.js';

export interface FiredRule {
  rule_id: RuleId;
  number: number;
  severity: Severity;
  fired_at: string;
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const BUMPED: Record<Severity, Severity> = { low: 'medium', medium: 'high', high: 'high' };

export function evaluateRules(ctx: RuleContext): FiredRule[] {
  const fired_at = ctx.now.toISOString();
  return RULES.filter((rule) => rule.fires(ctx)).map((rule) => ({
    rule_id: rule.id,
    number: rule.number,
    severity: rule.baseSeverity,
    fired_at,
  }));
}

export function applyTopicBump(fired: FiredRule[], priorities: Topic[]): FiredRule[] {
  return fired.map((f) => {
    const rule = RULES.find((r) => r.id === f.rule_id);
    if (rule === undefined || !priorities.includes(rule.topic)) return { ...f };
    return { ...f, severity: BUMPED[f.severity] };
  });
}

export function selectActionPlan(fired: FiredRule[]): FiredRule[] {
  return [...fired]
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.number - b.number)
    .slice(0, 3);
}
