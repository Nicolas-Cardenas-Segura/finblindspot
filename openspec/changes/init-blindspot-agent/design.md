# Technical Design: Financial Blindspot Detector

## Context

See [proposal.md](proposal.md) for background and motivation. The project is an MVP built during HackBarna / AI Summit Barcelona 2026. It must run live on Telegram, comply strictly with EU regulations prohibiting non-regulated financial advice, and utilize technologies from at least three event sponsors (Mastra, Nebius Token Factory, Galtea).

The product content is frozen in [`finance-blind-spot-v1-spec.html`](../../../finance-blind-spot-v1-spec.html) (repo root; "v1 master build document", content owner Elena). Section numbers below (`v1 §n`) refer to that document. Where this design and the v1 document disagree, the v1 document wins and this design must be updated.

## Goals / Non-Goals

**Goals:**
- Walk the ~40 v1 fields one message at a time over Telegram, with consent first and an explicit "I don't know" everywhere.
- Implement the v1 §5 retirement projection and §6 twenty-rule blind-spot engine as pure TypeScript, reproducing test cases A–D (v1 §10) exactly.
- Render results and blind spots from the static v1 §7 content library; let the model rephrase only `why`.
- Enforce the advice boundary with an independent outbound classifier and compliance trigger log.
- Store every assessment immutably and deliver the six-month re-assessment loop (v1 §9) via `/revisit`.
- Integrate Galtea adversarial evaluation to demonstrate a measurable "find, fix, prove" cycle.

**Non-Goals:**
- No custom mobile/web UI (Telegram is the exclusive user interface for the MVP; the v1 document's "screens" map to Telegram messages).
- No banking APIs, live account credentials, or exact figures (approximate numbers only).
- No distributed database (local SQLite).
- No external job queue: the 6/12-month nudge runs on an in-process interval against the SQLite `nudges` table.
- Everything v1 §11 defers to v2: post-retirement income periods, tax, risk attitude, partner as a separate person, multi-currency conversion, rental income, per-account detail, retirement end age, bank feeds, pension transfer analysis.

## Decisions

### 1. The agent sits either side of the maths, never inside it
- **Decision**: The LLM is used at exactly two points. **Inbound**, before the state machine: it classifies the user's intent for the current field (`answer`, `dont_know`, `question`, `correction`, `skip_request`, `off_topic`) and, for `answer`/`correction`, extracts the typed value and target field. **Outbound**, after the engines: it rephrases a library `why` (or a field's rationale, for `question` intents) around the user's numbers. Everything in between — question order, validation, derived values, projection, rules, severity, ranking, comparison, results copy — is pure TypeScript keyed on stored answers, so identical `answers` always yield identical `blind_spots` no matter how they were phrased.
- **Rationale**: The non-deterministic model is where it adds value (understanding people) and absent where it would cost trust (deciding findings). Deterministic, auditable, testable against v1 §10; gives Galtea two clear boundaries (invented numbers, advice drift).
- **Alternatives Considered**: Regex-only parsing of replies (rejected: brittle for "about 4.2k after tax", cannot detect questions or corrections). Letting the model pick which rules apply, or end-to-end prompt-based assessment (rejected: non-idempotent, unauditable, dangerous under financial regulations).

### 2. Field IDs are the contract
- **Decision**: `Answers` is a flat object keyed by the v1 field IDs (plus `pensions: PensionRow[]` and `learning_priorities: Topic[]`). Every question template, schema, rule and formula references a field ID. The questionnaire order and copy live in one data file (`src/questionnaire/fields.ts`).
- **Rationale**: v1 §1 "the engine only ever reads IDs"; lets copy be edited without touching the engine.

### 3. Zero, unknown and blank are three different things (v1 §5)
- **Decision**: `0` is a number; "I don't know" is `null`; a blank required field is `undefined` and the state machine does not advance. The engine never coerces `null` to `0`; any `null` used by a formula term drops the term, appends the field ID to `missing_fields` and sets `is_minimum_estimate`. Conditional fields that were skipped are stored as the sentinel `'n/a'`.
- **Rationale**: "Not knowing is the finding."

### 4. Single currency in v1
- **Decision**: `base_currency ∈ {EUR, GBP, USD}` is asked at the start of section B; all money fields are in that currency; no conversion exists. Rule 17 uses `cash_currency_mismatch` and a bundled `COUNTRY_CURRENCY` lookup (ISO-3166 alpha-2 → ISO-4217) for `retire_country`.
- **Rationale**: v1 §11 explicitly defers multi-currency holdings and conversion to v2.

### 5. Projection engine (v1 §5)
- **Decision**: Implement the eleven formula steps verbatim (see [calculation-engine spec](specs/calculation-engine/spec.md)) in `src/engine/projection.ts` as a pure function of `(Answers, Assumptions)`. Lump sums compound annually, monthly flows compound monthly at `mr = investment_growth_rate / 12`. Pension rows with `pension_start_age > retire_age` are excluded entirely and set `results.excluded_pensions[]`. Results are computed at the user's `withdrawal_rate` and at 3% and 5%. Display rounding to the nearest hundred happens in `render.ts` only.
- **Verification**: `tests/engine/projection.test.ts` pins the four v1 §10 cases (A: 879,387 / 907,888 / +28,501; B: 1,179,492 / +300,105; C: 1,507,520 / −599,632; D: 1,256,267 / −348,379) to ±1.
- **Rationale**: The numbers are given; anything else is a bug.

### 6. Blind-spot rule engine (v1 §6)
- **Decision**: Twenty rules in `src/rules/rules.ts` as an ordered array `RULES: Rule[]`, each `{ number, id, topic, baseSeverity, fires(ctx) }` where `ctx = { answers, derived, results }`. `evaluateRules` returns fired rules with base severity; `applyTopicBump` raises severity one level when `topic ∈ learning_priorities`; `selectActionPlan` sorts by severity desc then rule number asc and takes three. `≠ yes` is implemented as `v !== 'yes'` so `null` and `'don't know'` fire.
- **Rationale**: Fixed severities and rule-number tie-break make two runs of the same answers produce the same plan.

### 7. Content library is data (v1 §7)
- **Decision**: `content/blind_spots.json` keyed by `rule_id` with `{ title, headline, why, learn[], ask, severity, topic }`, copied verbatim from v1 §7. `render.ts` fills `{retire_age}` / `{pension_start_age}` placeholders deterministically. `explain.ts` asks the model to rephrase `why` given the user's `derived`/`results` numbers; the output is accepted only if the guardrail passes and the deterministic number check (every figure in the draft appears in the allowed-number set) passes, otherwise the library `why` is used.
- **Rationale**: "This file is where the advice boundary is most easily broken"; keeping it as data lets copy be fixed without a deploy.

### 8. Framework & Routing: Mastra on Node.js / TypeScript
- **Decision**: Use `@mastra/core` `Agent` for the two model calls (extraction, explanation). Telegram transport: Mastra channel adapter if one exists, otherwise `grammy` long polling feeding `handleMessage`.
- **Verification**: Adapter availability is unverified — task 1.5 records the outcome here.

### 9. Model Selection: Nebius Token Factory
- **Decision**: `deepseek-ai/DeepSeek-V4.1-Flash` for extraction and explanation; `nvidia/Nemotron-3_5-Lightning` for the outbound classifier.
- **Verification**: Exact model IDs are assumptions until task 1.4 confirms them against `GET /models`; substitute the closest fast model and record the swap here.

### 10. Guardrail: Three-layer Defense
- **Decision**:
  1. **System prompt boundary**: education-only role; may/may-not list from v1 §1 embedded verbatim.
  2. **Deterministic numbers and copy**: the model has no numbers or actions of its own (Decisions 1, 5–7).
  3. **Outbound classifier**: every model-generated text is classified `ALLOW`/`BLOCK` (recommendations of products, providers, allocations, transfers/consolidation, invented figures). After **2** rejections the library `why` is sent. Every rejection is logged as a `ComplianceTrigger`.
- **Rationale**: A disclaimer is not a control; the retry cap bounds latency; the trigger log feeds the Galtea before/after metric.

### 11. Sensitive Input Filter (Inbound, Deterministic)
- **Decision**: Regex/Luhn filter in plain code replaces IBANs, card numbers, long digit runs, passport-like and tax-ID-like tokens with `[redacted]` before any model call; the original is never persisted.
- **Rationale**: PII must never leave the process; an LLM detector would already have transmitted it.

### 12. Storage: immutable assessments (v1 §4)
- **Decision**: SQLite via `better-sqlite3` (`:memory:` in tests). Tables: `assessments` (`id`, `user_id`, `created_at`, `status`, `base_currency`, `answers_json`, `assumptions_json`, `derived_json`, `results_json`, `blind_spots_json`), `interview_state` (`user_id`, `state_json`) for drafts, `compliance_triggers`. A complete assessment row is never updated; a re-assessment inserts a new row. `/forget` deletes every row for the user.
- **Rationale**: Separate `answers`/`assumptions`/`results` allow recomputing old answers under today's assumptions (Decision 15).

### 13. Inbound intent classification
- **Decision**: `classifyIntent(field, reply, context)` runs after `redactSensitive` and before `applyAnswer`. Deterministic shortcuts first: `/command`, exact keyboard option, don't-know synonym. Otherwise one `MODELS.interview` call with `INTENT_PROMPT` returns JSON `{ intent, value?, field_id? }`; `value` is validated by the field's zod parser, `field_id` for corrections must be an already-answered field in the draft. The state machine maps intents: `answer` → store & advance; `dont_know`/`skip_request` (when `allowUnknown`) → store `null` & advance; `correction` → overwrite `field_id`, confirm, re-ask current; `question` → guarded rephrase of the field's `rationale`, re-ask; `off_topic` → one-line nudge back, re-ask. Model failure or unparsable JSON → treated as `off_topic` (re-ask), never as an answer.
- **Rationale**: One model call per free-text turn; corrections and questions no longer derail a 40-field interview; every stored value still passes the schema.

### 14. Scheduled nudge (v1 §9 "They get a nudge at six or twelve months")
- **Decision**: After the results message the bot asks "Remind you in 6 or 12 months?" and stores a `nudges` row `{ id, user_id, assessment_id, due_at, sent_at, cancelled }`. `startNudgeScheduler` runs `setInterval` every `NUDGE_TICK_SECONDS` (default 3600) calling `store.dueNudges(now)` and sending the reminder through the Telegram transport, then `markNudgeSent`. Completing a new assessment cancels the user's pending nudge. For demos, `NUDGE_DEMO_MINUTES` scales months to minutes.
- **Rationale**: The loop is the product; an in-process interval against SQLite is enough for a single-instance bot and needs no extra infrastructure.
- **Alternatives Considered**: External cron / job queue (rejected: more moving parts than the hackathon deployment justifies).

### 15. Re-assessment and comparison (v1 §9)
- **Decision**: `/revisit` builds an `InterviewState` prefilled from the latest complete assessment, orders previously-`null` fields first, then walks sections A–H accepting "same" to copy forward. On completion `compare(previous.answers, current.answers, current.assumptions)` recomputes **both** runs through `projection` + `rules` under the current assumptions and returns `Delta`. The progress view is rendered from `Delta` only.
- **Rationale**: Comparing stored results would show an assumption tweak as progress.

## Project Layout

All paths are relative to the repo root. Tests mirror `src/` under `tests/` with a `.test.ts` suffix.

```
package.json, tsconfig.json, vitest.config.ts, .env.example
content/
  blind_spots.json                 v1 §7 copy keyed by rule_id (Decision 7)
src/
  index.ts                         boot: load env, open store, build agent, start Telegram transport
  config/
    env.ts                         zod-validated process.env -> Env
    assumptions.ts                 DEFAULT_ASSUMPTIONS + ASSUMPTION_RANGES (v1 §3G)
    countryCurrency.ts             COUNTRY_CURRENCY lookup (Decision 4)
  llm/
    nebius.ts                      OpenAI-SDK client for Nebius + MODELS constants
    prompts.ts                     SYSTEM_PROMPT, INTENT_PROMPT, EXPLANATION_PROMPT, GUARDRAIL_PROMPT
  privacy/
    sensitiveFilter.ts             redactSensitive() (Decision 11)
  questionnaire/
    fields.ts                      FIELDS: ordered FieldDef[] with id, section, prompt, rationale, type, options, showIf (v1 §3)
    schema.ts                      zod schemas: AnswersSchema, PensionRowSchema, AssumptionsSchema, per-field parsers
    intent.ts                      classifyIntent(): deterministic shortcuts, else LLM -> Intent (Decision 13)
  interview/
    stateMachine.ts                createState(), currentField(), applyAnswer(), applyCorrection(), isComplete()
    revisit.ts                     createRevisitState(): prefilled state, unknowns first
  nudge/
    scheduler.ts                   startNudgeScheduler(), dueAt() (Decision 14)
  engine/
    derived.ts                     computeDerived()
    validate.ts                    validateAnswers()
    projection.ts                  computeProjection() (Decision 5)
  rules/
    rules.ts                       RULES: Rule[] (twenty, Decision 6)
    evaluate.ts                    evaluateRules(), applyTopicBump(), selectActionPlan()
  assess/
    assess.ts                      runAssessment(): answers+assumptions -> derived, results, blind_spots
    compare.ts                     compare(): Delta (Decision 15)
  guardrail/
    classifier.ts                  classifyOutbound(): text -> Verdict
    numbers.ts                     allowedNumbers(), hasInventedNumber()
    guard.ts                       guardedGenerate(): generate -> checks -> retry -> fallback
  explain/
    content.ts                     loadContent(): BlindSpotContent map, fillPlaceholders()
    explain.ts                     explainBlindSpot(): rephrased why via guardedGenerate
    render.ts                      renderConsent(), renderQuestion(), renderResults(), renderActionPlan(), renderProgress()
  store/
    db.ts                          openStore(path): Store (better-sqlite3)
    assessments.ts                 assessments + interview_state table functions
    nudges.ts                      nudges table functions
    triggers.ts                    compliance_triggers table functions
  agent/
    agent.ts                       Mastra Agent definition (model, instructions)
    telegram.ts                    startTelegram(): transport -> handleMessage
    handlers.ts                    handleMessage(): /start, /revisit, /forget, free text
eval/
  galtea/
    prompts.json                   adversarial prompt set
    run.ts                         Galtea runner -> metrics JSON
tests/                             mirrors src/; tests/fixtures/cases.ts holds v1 §10 A–D
```

## Shared Types & Interfaces

Tasks reference these names verbatim. Owner file is given in brackets; consumers import from it.

```ts
// [src/questionnaire/schema.ts]
export type Currency = 'EUR' | 'GBP' | 'USD';
export type YesNoDk = 'yes' | 'no' | 'dont_know';
export type Unknown = null;                           // "I don't know"
export type NotApplicable = 'n/a';                    // conditional field skipped
export type Topic = 'protection' | 'succession' | 'education' | 'savings' | 'retirement' | 'investments' | 'cross_border' | 'property' | 'debt' | 'fees';
export interface PensionRow {
  pension_country: string;                            // ISO-3166 alpha-2
  pension_type: 'state' | 'workplace_dc' | 'personal' | 'defined_benefit' | 'annuity' | 'other';
  pension_value: number | Unknown | NotApplicable;
  pension_fixed_income_monthly: number | Unknown | NotApplicable;
  pension_start_age: number | Unknown;
  pension_contribution_monthly: number;
  pension_contributions_continue: YesNoDk;
}
export interface Answers {
  // A
  consent: 'yes';
  age: number;
  has_partner: 'just_me' | 'household';
  residence_country: string;
  stay_abroad: 'yes' | 'no' | 'unsure' | 'n/a';
  dependants: number;
  education_funded: YesNoDk | NotApplicable;
  decision_maker: 'me' | 'partner' | 'joint' | NotApplicable;
  partner_knows: YesNoDk | NotApplicable;
  // B
  base_currency: Currency;
  income_monthly: number | Unknown;
  spend_housing: number | Unknown;
  spend_living: number | Unknown;
  spend_debt: number | Unknown;
  spend_other: number | Unknown;
  saving_monthly_other: number | Unknown;
  // C
  cash_total: number | Unknown;
  cash_currency_mismatch: YesNoDk;
  money_countries: string[];
  investments_total: number | Unknown;
  fees_known: 'yes' | 'no' | 'not_sure';
  home_value: number | Unknown;
  home_mortgage: number | Unknown;
  property_value: number | Unknown;
  property_mortgage: number | Unknown;
  property_for_retirement: YesNoDk;
  debt_total: number | Unknown;
  debt_max_rate: number | Unknown;                    // percent, e.g. 8.5
  debt_at_retirement: number | Unknown;
  // D
  pensions: PensionRow[];
  beneficiaries_named: YesNoDk;
  // E
  life_cover: YesNoDk;
  life_cover_amount: number | Unknown | NotApplicable;
  illness_cover: YesNoDk;
  health_cover: YesNoDk;
  will: 'yes' | 'no';
  will_country: string | NotApplicable;
  will_year: number | Unknown | NotApplicable;
  // F
  retire_age: number;
  retire_country: string | Unknown;
  retire_income_monthly: number | Unknown;
  // H
  learning_priorities: Topic[];
}
export interface Assumptions {
  inflation_rate: number;            // 0.03
  investment_growth_rate: number;    // 0.05
  cash_growth_rate: number;          // 0.02
  property_growth_rate: number;      // 0.03
  withdrawal_rate: number;           // 0.04
}
export const AnswersSchema: z.ZodType<Answers>;
export const PensionRowSchema: z.ZodType<PensionRow>;
export const AssumptionsSchema: z.ZodType<Assumptions>;
export type FieldId = keyof Answers | keyof PensionRow | keyof Assumptions;

// [src/questionnaire/fields.ts]
export type Section = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';
export type FieldType = 'money' | 'integer' | 'percent' | 'year' | 'country' | 'country_list' | 'enum' | 'multi_select' | 'currency';
export interface FieldDef {
  id: FieldId;
  section: Section;
  prompt: string;                    // on-screen wording from v1 §3
  helper?: string;                   // required helper copy
  rationale: string;                 // one sentence: why we ask / what it feeds (v1 §3 "Used for"); source for `question` intents
  type: FieldType;
  options?: string[];                // enum / multi_select
  zeroValid?: boolean;
  allowUnknown: boolean;             // offers "I don't know" -> null
  showIf?: (a: Partial<Answers>) => boolean;
  repeat?: 'pensions';               // section D row fields
}
export const FIELDS: FieldDef[];      // section order A..H
export const PENSION_FIELDS: FieldDef[];

// [src/config/assumptions.ts]
export const DEFAULT_ASSUMPTIONS: Assumptions;
export const ASSUMPTION_RANGES: Record<keyof Assumptions, { min: number; max: number }>;

// [src/config/countryCurrency.ts]
export const COUNTRY_CURRENCY: Record<string, string>;   // 'DE' -> 'EUR'

// [src/engine/derived.ts]
export interface Derived { monthly_spending: number | null; monthly_surplus: number | null; net_worth: number | null; financial_assets: number | null; property_net: number | null }
export function computeDerived(a: Answers): Derived;

// [src/engine/validate.ts]
export type ValidationError = { field: FieldId; reason: 'retire_age_not_after_age' | 'rate_not_positive' | 'negative_money' | 'pension_start_age_out_of_range' };
export function validateAnswers(a: Answers, s: Assumptions): ValidationError[];

// [src/engine/projection.ts]
export interface RateResult { withdrawal_rate: number; required_pot: number; position: number; position_today: number }
export interface Results {
  mode: 'projection' | 'no_target' | 'already_retired' | 'no_gap';
  years: number | null;
  required_pot: number | null;
  projected_assets: number | null;
  position: number | null;
  position_today: number | null;
  extra_monthly: number | null;
  sensitivity: RateResult[];        // at 0.03, user rate, 0.05
  is_minimum_estimate: boolean;
  missing_fields: FieldId[];
  excluded_pensions: number[];      // indices into answers.pensions with start age > retire_age
}
export function computeProjection(a: Answers, s: Assumptions, d: Derived): Results;

// [src/rules/rules.ts]
export type RuleId =
  | 'thin_emergency_fund' | 'negative_surplus' | 'family_unprotected' | 'no_income_safety_net' | 'no_health_cover'
  | 'succession_gap' | 'education_unfunded' | 'pension_visibility' | 'pension_timing_gap' | 'scattered_pensions'
  | 'beneficiary_gap' | 'fees_unknown' | 'expensive_debt' | 'debt_into_retirement' | 'cash_concentration'
  | 'property_concentration' | 'currency_exposure' | 'single_point_of_failure' | 'retirement_gap' | 'lifestyle_reality_check';
export type Severity = 'low' | 'medium' | 'high';
export interface RuleContext { answers: Answers; derived: Derived; results: Results; now: Date }
export interface Rule { number: number; id: RuleId; topic: Topic; baseSeverity: Severity; fires(ctx: RuleContext): boolean }
export const RULES: Rule[];           // length 20, ascending number

// [src/rules/evaluate.ts]
export interface FiredRule { rule_id: RuleId; number: number; severity: Severity; fired_at: string }
export function evaluateRules(ctx: RuleContext): FiredRule[];
export function applyTopicBump(fired: FiredRule[], priorities: Topic[]): FiredRule[];
export function selectActionPlan(fired: FiredRule[]): FiredRule[];        // top 3

// [src/assess/assess.ts]
export interface Assessment {
  id: string; user_id: string; created_at: string; status: 'draft' | 'complete'; base_currency: Currency;
  answers: Answers; assumptions: Assumptions; derived: Derived; results: Results; blind_spots: FiredRule[];
}
export function runAssessment(a: Answers, s: Assumptions, now?: Date): Pick<Assessment, 'derived' | 'results' | 'blind_spots'>;

// [src/assess/compare.ts]
export interface Delta {
  position_change: number | null; net_worth_change: number | null; monthly_saving_change: number | null; emergency_months_change: number | null;
  blind_spots_closed: RuleId[]; blind_spots_new: RuleId[]; blind_spots_still_open: RuleId[];
  unknowns_resolved: FieldId[]; assumptions_changed: boolean;
}
export function compare(previous: Assessment, current: Assessment): Delta;   // both recomputed under current.assumptions

// [src/privacy/sensitiveFilter.ts]
export interface RedactionResult { text: string; redacted: boolean; kinds: Array<'iban' | 'card' | 'passport' | 'tax_id' | 'digit_run'> }
export function redactSensitive(text: string): RedactionResult;

// [src/questionnaire/intent.ts]
export type IntentKind = 'answer' | 'dont_know' | 'question' | 'correction' | 'skip_request' | 'off_topic' | 'command';
export type Intent =
  | { kind: 'answer'; value: unknown }                       // value already validated by the field parser
  | { kind: 'correction'; fieldId: FieldId; value: unknown }
  | { kind: 'question'; text: string }
  | { kind: 'command'; command: string }
  | { kind: 'dont_know' } | { kind: 'skip_request' } | { kind: 'off_topic' };
export interface IntentContext { answered: Partial<Answers>; currency?: Currency }
export function classifyIntent(field: FieldDef, reply: string, ctx: IntentContext, deps: { client: OpenAI }): Promise<Intent>;
export function classifyIntentDeterministic(field: FieldDef, reply: string): Intent | null;   // shortcuts; null = needs model

// [src/interview/stateMachine.ts]
export interface InterviewState { userId: string; answers: Partial<Answers>; assumptions: Assumptions; pensionDraft?: Partial<PensionRow>; fieldIndex: number; pensionFieldIndex?: number; retries: number; mode: 'assess' | 'revisit'; prefill?: Answers; complete: boolean; awaitingNudgeChoice?: boolean }
export function createState(userId: string): InterviewState;
export function currentField(s: InterviewState): FieldDef | null;              // null when complete
export function applyAnswer(s: InterviewState, value: unknown): InterviewState;
export function applyCorrection(s: InterviewState, fieldId: FieldId, value: unknown): InterviewState;   // overwrites an answered field, keeps position
export function isComplete(s: InterviewState): boolean;

// [src/nudge/scheduler.ts]
export interface Nudge { id: string; userId: string; assessmentId: string; dueAt: string; sentAt: string | null; cancelled: boolean }
export function dueAt(from: Date, months: 6 | 12, demoMinutes?: number): Date;
export function startNudgeScheduler(deps: { store: Store; send: (userId: string, text: string) => Promise<void>; tickSeconds: number; now?: () => Date }): { stop(): void; tick(): Promise<number> };   // tick returns nudges sent

// [src/interview/revisit.ts]
export function createRevisitState(userId: string, previous: Assessment): InterviewState;   // unknown fields first, prefill set

// [src/guardrail/classifier.ts]
export type Verdict = 'ALLOW' | 'BLOCK';
export function classifyOutbound(text: string, deps: { client: OpenAI }): Promise<Verdict>;

// [src/guardrail/numbers.ts]
export function allowedNumbers(a: Answers, d: Derived, r: Results, libraryText: string): Set<number>;
export function hasInventedNumber(draft: string, allowed: Set<number>): boolean;

// [src/guardrail/guard.ts]
export interface GuardDeps { classify: (t: string) => Promise<Verdict>; inventedNumber: (t: string) => boolean; logTrigger: (t: ComplianceTrigger) => void; maxAttempts?: number }  // default 2
export function guardedGenerate(generate: (attempt: number) => Promise<string>, fallback: string, ctx: { userId: string }, deps: GuardDeps): Promise<{ text: string; attempts: number; fellBack: boolean }>;

// [src/explain/content.ts]
export interface BlindSpotContent { title: string; headline: string; why: string; learn: string[]; ask: string; severity: Severity; topic: Topic }
export function loadContent(): Record<RuleId, BlindSpotContent>;
export function fillPlaceholders(text: string, a: Answers, r: Results): string;

// [src/explain/explain.ts]
export function explainBlindSpot(rule: FiredRule, assessment: Assessment, deps: { client: OpenAI; guard: GuardDeps }): Promise<string>;   // returns why text

// [src/explain/render.ts]
export function renderConsent(): string;
export function renderQuestion(f: FieldDef, currency?: Currency, prefill?: unknown): string;
export function renderResults(a: Assessment): string;
export function renderActionPlan(a: Assessment, whys: Record<RuleId, string>): string;
export function renderProgress(previous: Assessment, current: Assessment, delta: Delta): string;
export function roundHundred(n: number): number;

// [src/store/db.ts]
export interface ComplianceTrigger { userId: string; createdAt: string; draft: string; verdict: Verdict; attempt: number; reason: 'classifier' | 'invented_number' }
export interface Store {
  insertAssessment(a: Assessment): void;                          // throws if id exists
  latestComplete(userId: string): Assessment | undefined;
  listAssessments(userId: string): Assessment[];
  saveState(s: InterviewState): void;
  loadState(userId: string): InterviewState | undefined;
  clearState(userId: string): void;
  insertNudge(n: Nudge): void;
  dueNudges(now: string): Nudge[];                                 // sent_at null, cancelled 0, due_at <= now
  markNudgeSent(id: string, sentAt: string): void;
  cancelPendingNudges(userId: string, at: string): number;
  logTrigger(t: ComplianceTrigger): void;
  countTriggers(since?: string): number;
  deleteUser(userId: string): { assessments: number; states: number; nudges: number; triggers: number };
}
export function openStore(path: string | ':memory:'): Store;

// [src/agent/handlers.ts]
export interface Incoming { userId: string; text: string }
export interface Outgoing { text: string; options?: string[] }   // options -> reply keyboard
export interface HandlerDeps { store: Store; llm: OpenAI; guard: GuardDeps; now?: () => Date; nudgeDemoMinutes?: number }
export function handleMessage(msg: Incoming, deps: HandlerDeps): Promise<Outgoing>;
```

External APIs relied on:
- `openai` (`new OpenAI({ baseURL, apiKey })`, `chat.completions.create` with `response_format: { type: 'json_object' }`, `models.list()`).
- `better-sqlite3` (`new Database(path)`, `prepare().run()/get()/all()`).
- `zod` (`z.object`, `.safeParse`, `.nullable()`).
- `@mastra/core` `Agent` class; whether a Telegram channel adapter exists is unverified — verify in task 1.5. Fallback transport is `grammy` long polling (`new Bot(token)`, `bot.on('message:text')`, `ctx.reply(text, { reply_markup: Keyboard })`, `bot.start()`).
- `galtea` SDK: API surface unverified — verify in task 11.1.

## Risks / Trade-offs

- **[Risk] ~40 questions is long for a chat interface** → *Mitigation*: reply keyboards for enum/yes-no fields, one-line prompts, progress marker per section ("Section C of H"), `/start` resumes a draft.
- **[Risk] Telegram webhook drops on venue WiFi** → *Mitigation*: long polling during development; tunnel documented for webhooks.
- **[Risk] Latency stacking (intent + explanation + classifier)** → *Mitigation*: intent model call only when a reply is not a command, keyboard option or don't-know synonym; explanation only for the three action-plan rules; templated text exempt from classification; cap regeneration at 2.
- **[Risk] Intent model mislabels a question as an answer** → *Mitigation*: every `answer` value must pass the field's zod parser; failures re-ask; corrections may only target already-answered fields; Galtea `intent_confusion` prompts probe this.
- **[Risk] Nudge scheduler double-sends after a restart** → *Mitigation*: `markNudgeSent` before the send resolves is not enough — `dueNudges` filters on `sent_at IS NULL` and the send + mark run in one tick; tests cover restart with an already-sent row.
- **[Risk] Unverified platform assumptions (Mastra Telegram adapter, Nebius model IDs, Galtea SDK)** → *Mitigation*: tasks 1.4, 1.5, 11.1 verify on day one; fallbacks recorded in Decisions 8–9.
- **[Risk] Formula drift from v1 §5** → *Mitigation*: test cases A–D are the acceptance suite; no projection change merges without them passing.
- **[Risk] Model rephrases `why` into advice or invents a number** → *Mitigation*: Decision 7 number check + classifier + library fallback; Galtea prompts target exactly this.
