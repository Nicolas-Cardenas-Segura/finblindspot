import type { Assessment } from '../assess/assess.js';
import type { Delta } from '../assess/compare.js';
import type { FieldDef } from '../questionnaire/fields.js';
import type { Answers, Currency } from '../questionnaire/schema.js';
import type { RuleId } from '../rules/rules.js';
import { selectActionPlan } from '../rules/evaluate.js';
import { fillPlaceholders, loadContent } from './content.js';

const SYMBOLS: Record<Currency, string> = { EUR: '€', GBP: '£', USD: '$' };

const PENSION_LABELS: Record<string, string> = {
  state: 'state',
  workplace_dc: 'workplace',
  personal: 'personal',
  defined_benefit: 'defined benefit',
  annuity: 'annuity',
  other: 'other',
};

export function roundHundred(n: number): number {
  return Math.round(n / 100) * 100;
}

function group(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function money(n: number, currency: Currency): string {
  return `${SYMBOLS[currency]}${group(roundHundred(n))}`;
}

function exactMoney(n: number, currency: Currency): string {
  return `${SYMBOLS[currency]}${group(n)}`;
}

function percent(rate: number): string {
  return `${Number((rate * 100).toFixed(2))}%`;
}

function months(value: number | null): string {
  return value === null ? 'unknown' : `${value.toFixed(1)} months`;
}

function signed(value: number | null, currency: Currency): string {
  if (value === null) return 'unknown';
  const rounded = roundHundred(value);
  const sign = rounded < 0 ? '−' : '+';
  return `${sign}${exactMoney(Math.abs(rounded), currency)}`;
}

function amount(value: number | null, currency: Currency): string {
  if (value === null) return 'unknown';
  const rounded = roundHundred(value);
  return `${rounded < 0 ? '−' : ''}${exactMoney(Math.abs(rounded), currency)}`;
}

export function renderConsent(): string {
  return [
    'Understand where you stand',
    '',
    'This builds a picture of your finances, shows what you might be overlooking, and estimates whether you are on track for the retirement you want. It is educational, and it is not financial advice. Your results depend on the information and assumptions you give.',
    '',
    'Please do not enter bank logins, account numbers, card numbers, passport details or tax numbers. We do not need them.',
    '',
    'I understand this is an educational assessment, not financial advice.',
    '',
    'Reply YES to continue',
  ].join('\n');
}

function prefillText(value: unknown, currency?: Currency): string {
  if (value === null) return "don't know";
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'number' && currency !== undefined) return exactMoney(value, currency);
  return String(value);
}

export function renderQuestion(f: FieldDef, currency?: Currency, prefill?: unknown): string {
  const lines: string[] = [f.prompt];
  if (f.helper !== undefined) lines.push(f.helper);
  if (f.options !== undefined && f.options.length > 0) lines.push(f.options.join(' / '));
  if (f.type === 'money' && currency !== undefined) lines.push(`Amounts in ${currency}.`);
  if (f.allowUnknown) lines.push("(reply 'don't know' if unsure)");
  if (prefill !== undefined) {
    const shown = prefillText(prefill, f.type === 'money' ? currency : undefined);
    lines.push(`Still right? Last time: ${shown} — reply 'same' or a new value`);
  }
  return lines.join('\n');
}

function excludedPensionNote(a: Assessment): string | null {
  const index = a.results.excluded_pensions[0];
  if (index === undefined) return null;
  const pension = a.answers.pensions[index];
  if (pension === undefined) return null;
  const label = PENSION_LABELS[pension.pension_type] ?? pension.pension_type;
  const start = pension.pension_start_age;
  const begins = start === null ? 'begins after your retirement age' : `begins at ${start}`;
  return (
    `Your ${label} pension ${begins} and is not included in this projection to age ${a.answers.retire_age}. ` +
    `This is a conservative estimate of your position at ${a.answers.retire_age}, not your shortfall across the whole of retirement.`
  );
}

function assumptionsLine(a: Assessment): string {
  const s = a.assumptions;
  return (
    `Assumptions: inflation ${percent(s.inflation_rate)}, investments and pensions ${percent(s.investment_growth_rate)}, ` +
    `cash ${percent(s.cash_growth_rate)}, property ${percent(s.property_growth_rate)}, income rate ${percent(s.withdrawal_rate)}.`
  );
}

export function renderResults(a: Assessment): string {
  const currency = a.base_currency;
  const r = a.results;
  const lines: string[] = [];

  if (r.is_minimum_estimate) {
    lines.push(
      `Minimum estimate based on what you know today. Missing: ${r.missing_fields.join(', ')}.`,
    );
    lines.push('');
  }

  if (r.mode === 'projection' || r.mode === 'no_gap') {
    const positionToday = r.position_today ?? 0;
    const headline =
      positionToday < 0
        ? `At ${a.answers.retire_age}, you are about ${money(Math.abs(positionToday), currency)} short`
        : `At ${a.answers.retire_age}, you are on track with about ${money(positionToday, currency)} to spare`;
    lines.push(headline);

    if (a.answers.retire_income_monthly !== null) {
      lines.push(
        `Retiring at ${a.answers.retire_age} on ${exactMoney(a.answers.retire_income_monthly, currency)} a month in today's spending power.`,
      );
    }
    lines.push('');
    lines.push(
      `Estimated capital needed at ${a.answers.retire_age}: ${amount(r.required_pot, currency)}`,
    );
    lines.push(`Projected from what you have and save: ${amount(r.projected_assets, currency)}`);
    lines.push(
      positionToday < 0
        ? `Shortfall at ${a.answers.retire_age}, in today's spending power: ${money(Math.abs(positionToday), currency)}`
        : `Spare at ${a.answers.retire_age}, in today's spending power: ${money(positionToday, currency)}`,
    );
    lines.push(
      r.extra_monthly === null
        ? 'Saving this much more each month would close it: nothing more needed'
        : `Saving this much more each month would close it: ${exactMoney(r.extra_monthly, currency)}`,
    );

    const note = excludedPensionNote(a);
    if (note !== null) {
      lines.push('');
      lines.push(note);
    }

    const low = r.sensitivity.find((s) => s.withdrawal_rate === 0.03);
    const high = r.sensitivity.find((s) => s.withdrawal_rate === 0.05);
    if (low !== undefined && high !== undefined) {
      lines.push('');
      lines.push(
        `At a 3% withdrawal rate the ${low.position < 0 ? 'gap' : 'surplus'} is ${money(Math.abs(low.position), currency)}; ` +
          `at 5% it is ${money(Math.abs(high.position), currency)}.`,
      );
    }
  } else if (r.mode === 'no_target') {
    lines.push(
      'You have not told us the monthly income you want in retirement, so there is no projection to show. Your blind spots are below.',
    );
    const note = excludedPensionNote(a);
    if (note !== null) {
      lines.push('');
      lines.push(note);
    }
  } else {
    lines.push(
      'You are at or past your retirement age, so there is no projection to show. Your blind spots are below.',
    );
  }

  lines.push('');
  lines.push(assumptionsLine(a));
  return lines.join('\n');
}

export function renderActionPlan(a: Assessment, whys: Record<RuleId, string>): string {
  const content = loadContent();
  const top = selectActionPlan(a.blind_spots);
  const blocks = top.map((fired) => {
    const entry = content[fired.rule_id];
    const why = whys[fired.rule_id] ?? entry.why;
    const lines = [
      entry.title,
      fillPlaceholders(entry.headline, a.answers, a.results),
      fillPlaceholders(why, a.answers, a.results),
      ...entry.learn.map((item) => `- ${item}`),
      entry.ask,
    ];
    return lines.join('\n');
  });
  if (top.length < 3) blocks.push('no other blind spot detected');
  return blocks.join('\n\n');
}

function monthlySaving(answers: Answers): number | null {
  if (answers.saving_monthly_other === null) return null;
  return answers.pensions.reduce(
    (acc, p) => acc + p.pension_contribution_monthly,
    answers.saving_monthly_other,
  );
}

function emergencyMonths(a: Assessment): number | null {
  const spending = a.derived.monthly_spending;
  if (a.answers.cash_total === null || spending === null || spending === 0) return null;
  return a.answers.cash_total / spending;
}

function titles(ids: RuleId[]): string {
  const content = loadContent();
  return ids.map((id) => content[id].title).join(', ');
}

export function renderProgress(previous: Assessment, current: Assessment, delta: Delta): string {
  const currency = current.base_currency;
  const since = new Date(previous.created_at).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  const previousSaving = monthlySaving(previous.answers);
  const currentSaving = monthlySaving(current.answers);
  const previousMonths = emergencyMonths(previous);
  const currentMonths = emergencyMonths(current);

  const lines: string[] = [
    `Since ${since}`,
    'Then / Now / Change',
    `Retirement position: ${amount(previous.results.position_today, currency)} / ${amount(current.results.position_today, currency)} / ${signed(delta.position_change, currency)}`,
    `Saved each month: ${previousSaving === null ? 'unknown' : exactMoney(previousSaving, currency)} / ${currentSaving === null ? 'unknown' : exactMoney(currentSaving, currency)} / ${delta.monthly_saving_change === null ? 'unknown' : `${delta.monthly_saving_change < 0 ? '−' : '+'}${exactMoney(Math.abs(delta.monthly_saving_change), currency)}`}`,
    `Emergency fund: ${months(previousMonths)} / ${months(currentMonths)} / ${
      delta.emergency_months_change === null
        ? previousMonths === null && currentMonths !== null
          ? 'resolved'
          : 'unknown'
        : `${delta.emergency_months_change < 0 ? '−' : '+'}${Math.abs(delta.emergency_months_change).toFixed(1)} months`
    }`,
    `Net worth: ${amount(previous.derived.net_worth, currency)} / ${amount(current.derived.net_worth, currency)} / ${signed(delta.net_worth_change, currency)}`,
    `Blind spots open: ${previous.blind_spots.length} / ${current.blind_spots.length} / ${delta.blind_spots_closed.length} closed`,
  ];

  if (delta.blind_spots_closed.length > 0) {
    lines.push(`Closed since last time: ${titles(delta.blind_spots_closed)}.`);
  }
  if (delta.blind_spots_new.length > 0) {
    lines.push(`New since last time: ${titles(delta.blind_spots_new)}.`);
  }
  if (delta.blind_spots_still_open.length > 0) {
    lines.push(`Still open: ${titles(delta.blind_spots_still_open)}.`);
  }
  if (delta.unknowns_resolved.length > 0) {
    lines.push(`You found out since last time: ${delta.unknowns_resolved.join(', ')}.`);
  }
  if (delta.assumptions_changed) {
    lines.push('this comparison uses your current assumptions for both dates.');
  }
  return lines.join('\n');
}
