# Technical Design: Financial Blindspot Detector

## Context

See [proposal.md](proposal.md) for background and motivation. The project is an MVP built during HackBarna / AI Summit Barcelona 2026. It must run live on Telegram, comply strictly with EU regulations prohibiting non-regulated financial advice, and utilize technologies from at least three event sponsors (Mastra, Nebius Token Factory, Galtea).

## Goals / Non-Goals

**Goals:**
- Deliver a responsive, single-question-at-a-time conversational interview over Telegram via Mastra.
- Enforce strict separation between factual computation (pure code calculation engine) and natural language generation (LLM explanation).
- Implement an automated outbound message guardrail filter verifying zero advice/product mentions.
- Provide unit test coverage over all calculation formulas and threshold edge cases.
- Integrate Galtea adversarial evaluation to demonstrate a measurable "find, fix, prove" security/compliance cycle.

**Non-Goals:**
- No custom mobile/web UI (Telegram is the exclusive user interface for the MVP).
- No integration with banking APIs, Plaid, or live account credentials (ranges and approximate numbers only).
- No persistent distributed database infrastructure (local SQLite / session-scoped storage is sufficient).
- No production cron scheduler for 6-month revisits (simulated on-demand via command).

## Decisions

### 1. Separation of Computation and Explanation (Core Architectural Thesis)
- **Decision**: All financial indicators (emergency runway, debt ratio, retirement visibility, concentration, cross-border complexity) and their R/A/G threshold flags are calculated strictly in pure TypeScript functions. The LLM is never permitted to calculate numbers or choose flag colors.
- **Rationale**: Guarantees deterministic, auditable results that cannot hallucinate math. Provides Galtea with two distinct boundaries to test: mathematical interpretation accuracy and regulatory compliance drift.
- **Alternatives Considered**: End-to-end prompt-based scoring (rejected: non-deterministic and dangerous under financial regulations).

### 2. Framework & Routing: Mastra on Node.js / TypeScript
- **Decision**: Use `@mastra/core` for agent memory, channel integration, and workflow orchestration.
- **Rationale**: Fulfills the Mastra challenge requirement, provides native Telegram channel connectivity, and includes built-in conversation memory.

### 3. Model Selection: Nebius Token Factory
- **Decision**: Use `deepseek-ai/DeepSeek-V4.1-Flash` for the primary conversational agent and `nvidia/Nemotron-3_5-Lightning` for the outbound guardrail classifier.
- **Rationale**:
  - `DeepSeek-V4.1-Flash`: Fast TTFT, high JSON accuracy for turn extraction.
  - `Nemotron-3_5-Lightning`: Extremely lightweight and low latency (<150ms) for real-time binary classification (`ALLOW` vs `BLOCK`) before transmitting to Telegram.
- **Alternatives Considered**: Large 400B models (rejected for main loop due to Telegram latency constraints).
- **Verification**: The exact model identifiers and the guardrail latency budget are assumptions until task 1.2 confirms them against the Nebius model list; if either model is unavailable, substitute the closest fast model and record the swap here.

### 4. Guardrail Mechanism: Three-layer Defense
- **Decision**:
  1. **System prompt boundary**: declares education-only in the welcome message and in the agent's role definition.
  2. **Deterministic scoring**: the model never calculates indicators or picks flag colours (Decision 1), so it has no numbers of its own to recommend from.
  3. **Outbound message classifier hook**: intercepts every LLM-generated free-text message (templated questions, disclaimers, and rendered scorecard tables are exempt); if it mentions specific tickers, buy/sell directives, allocation percentages, or provider endorsements, the agent regenerates with a stricter educational prompt. After **2** rejections the agent stops regenerating and sends a fixed, pre-approved educational fallback message. Every rejection is logged as a compliance trigger (timestamp, session id, draft, verdict).
- **Rationale**: A disclaimer is not a compliance control. Active interception prevents regulatory breach; the retry cap bounds latency and guarantees termination; the trigger log is the raw material for the Galtea before/after metric.

### 5. Indicator States and Default Thresholds
- **Decision**: Every indicator resolves to one of four states: `GREEN`, `AMBER`, `RED`, or `UNKNOWN` (insufficient or zero-valued input). All thresholds live in a single configuration module (`thresholds.ts`) with the defaults below; unit tests pin the boundaries.

  | Indicator | Formula | Green | Amber | Red |
  | --- | --- | --- | --- | --- |
  | Emergency Runway | liquid cash / monthly essential expenditure (months) | >= 6 | >= 3 and < 6 | < 3 |
  | Debt Exposure | monthly debt service / monthly net income | < 20% | 20% to 35% | > 35% |
  | Retirement Visibility | count of pension pots with unknown value or tax status; retirement age stated | 0 unknown and age stated | 1 unknown, or age missing | >= 2 unknown |
  | Asset Concentration | largest single asset class or currency / total assets | < 50% | 50% to 75% | > 75% |
  | Cross-Border Complexity | distinct jurisdictions across income, assets, pensions, tax residency, plus 1 per unknown tax status | <= 2 and no unknown tax status | 3, or 1 unknown tax status | >= 4, or >= 2 unknown |

- **Ranking**: Blind spots are ranked `RED` > `AMBER` > `UNKNOWN` > `GREEN`; ties are broken by a fixed indicator priority (Emergency Runway, Debt Exposure, Retirement Visibility, Cross-Border Complexity, Asset Concentration). The scorecard shows up to three non-Green indicators; if fewer exist, it shows only those.
- **Rationale**: Boundaries must exist somewhere for task 4.2 to test them; centralising them keeps the pure functions free of magic numbers and makes tuning after the Galtea run a one-file change.

### 6. Base Currency Normalisation
- **Decision**: The interview asks the user to declare a base currency (default: currency of current residence) before any amount is collected. Amounts given in another currency are converted to the base currency using a static rate table bundled with the app (dated, editable); the conversion and the rate used are recorded on the profile. All calculations run on base-currency values.
- **Rationale**: The target user earns, spends, and saves in different currencies; dividing GBP cash by EUR expenses silently produces a wrong runway. Static rates are sufficient for range-based estimates and keep the demo offline-safe.
- **Alternatives Considered**: Live FX API (rejected: extra dependency and network risk at the venue for negligible accuracy gain on approximate inputs).

### 7. Sensitive Input Filter (Inbound, Deterministic)
- **Decision**: Before any user message is forwarded to Nebius, a regex/heuristic filter in plain code detects IBANs, card numbers (Luhn), long digit runs, passport-like patterns, and common tax-ID formats; matches are replaced with `[redacted]`, and the user is told that only ranges and estimates are needed.
- **Rationale**: The privacy invariant is only meaningful if PII never leaves the process; an LLM-based detector would already have transmitted the data.

### 8. Storage Architecture and Data Lifecycle
- **Decision**: SQLite via `better-sqlite3` (path `:memory:` for tests), keyed by Telegram user id. Two tables: `snapshots` (profile + scorecard + timestamp + label such as `baseline` or `revisit`) and `compliance_triggers` (see Decision 4). A `/forget` command deletes every row for the requesting user id. No retention beyond the demo; the datastore is documented as disposable.
- **Rationale**: Minimizes setup friction and keeps baseline snapshots reproducible across demo runs, while giving the user an erasure path consistent with the data-minimisation invariant.

### 9. Simulated Revisit
- **Decision**: `/revisit` re-asks only the mutable numeric fields (liquid cash, monthly expenditure, debt service, income, largest asset share, number of pensions with unknown values); unchanged answers are carried forward from the baseline. The new snapshot is labelled `revisit` with the real timestamp; "six months later" is a presentation label, not a fake clock. If no baseline exists, the bot explains and offers to start the full assessment.
- **Rationale**: Keeps the follow-up under two minutes for the demo while producing a genuine then-versus-now delta.

## Project Layout

All paths are relative to the repo root. Tests mirror `src/` under `tests/` with a `.test.ts` suffix.

```
package.json, tsconfig.json, vitest.config.ts, .env.example
src/
  index.ts                         boot: load env, open store, build agent, start Telegram transport
  config/
    env.ts                         zod-validated process.env -> Env
    thresholds.ts                  THRESHOLDS defaults + INDICATOR_PRIORITY (Decision 5)
    fxRates.ts                     FX_RATES static table with `asOf` date (Decision 6)
  llm/
    nebius.ts                      OpenAI-SDK client for Nebius + MODELS constants
    prompts.ts                     SYSTEM_PROMPT, EXTRACTION_PROMPT, EXPLANATION_PROMPT, GUARDRAIL_PROMPT, FALLBACK_MESSAGES
  privacy/
    sensitiveFilter.ts             redactSensitive() (Decision 7)
  profile/
    schema.ts                      zod schemas + inferred types for FinancialProfile and parts
    extract.ts                     extractProfileUpdate(): LLM turn -> partial profile
  interview/
    domains.ts                     INTERVIEW_DOMAINS ordered list with question templates + required fields
    stateMachine.ts                nextQuestion(), applyAnswer(), isComplete()
    revisit.ts                     REVISIT_FIELDS + buildRevisitProfile()
  engine/
    fx.ts                          toBaseCurrency()
    indicators/
      runway.ts                    computeRunway()
      debt.ts                      computeDebtExposure()
      retirement.ts                computeRetirementVisibility()
      concentration.ts             computeAssetConcentration()
      crossBorder.ts               computeCrossBorderComplexity()
    score.ts                       scoreIndicator(), buildScorecard()
    rank.ts                        rankBlindspots()
  guardrail/
    classifier.ts                  classifyOutbound(): text -> Verdict
    guard.ts                       guardedGenerate(): generate -> classify -> retry -> fallback
  explain/
    explain.ts                     explainScorecard(): LLM prose per blind spot via guardedGenerate
    render.ts                      renderScorecard(), renderComparison(), renderWelcome() templates
  store/
    db.ts                          openStore(path): Store (better-sqlite3)
    snapshots.ts                   snapshot table functions
    triggers.ts                    compliance_triggers table functions
  agent/
    agent.ts                       Mastra Agent definition (model, instructions, memory)
    telegram.ts                    startTelegram(): polling transport -> handleMessage
    handlers.ts                    handleMessage(): /start, /revisit, /forget, free text
eval/
  galtea/
    prompts.json                   adversarial prompt set
    run.ts                         Galtea runner -> metrics JSON
tests/                             mirrors src/
```

## Shared Types & Interfaces

Tasks reference these names verbatim. Owner file is given in brackets; consumers import from it.

```ts
// [src/profile/schema.ts]
export type Currency = string;                       // ISO-4217, upper-case
export interface Money { amount: number; currency: Currency }
export interface PensionPot { country: string; valueKnown: boolean; value?: Money; taxStatusKnown: boolean }
export interface AssetHolding { kind: 'cash' | 'property' | 'equities' | 'bonds' | 'crypto' | 'other'; country: string; value: Money }
export interface FinancialProfile {
  telegramUserId: string;
  baseCurrency: Currency;
  residenceCountry: string;                          // ISO-3166 alpha-2
  age?: number;
  retirementAge?: number;
  monthlyNetIncome?: Money;
  monthlyEssentialExpenditure?: Money;
  liquidCash?: Money;
  monthlyDebtService?: Money;
  assets: AssetHolding[];
  pensions: PensionPot[];
  incomeCountries: string[];
  taxResidencies: string[];
}
export const FinancialProfileSchema: z.ZodType<FinancialProfile>;
export type ProfilePatch = Partial<Omit<FinancialProfile, 'telegramUserId'>>;

// [src/engine/score.ts]
export type IndicatorId = 'emergency_runway' | 'debt_exposure' | 'retirement_visibility' | 'asset_concentration' | 'cross_border_complexity';
export type IndicatorState = 'GREEN' | 'AMBER' | 'RED' | 'UNKNOWN';
export interface IndicatorResult { id: IndicatorId; value: number | null; state: IndicatorState; missingInputs: string[] }
export interface Scorecard { indicators: IndicatorResult[]; blindspots: IndicatorId[]; baseCurrency: Currency; computedAt: string }

// [src/config/thresholds.ts]
export interface Band { green: (v: number) => boolean; amber: (v: number) => boolean }   // else RED
export const THRESHOLDS: Record<Exclude<IndicatorId, 'retirement_visibility' | 'cross_border_complexity'>, Band>;
export const INDICATOR_PRIORITY: IndicatorId[];     // Decision 5 tie-break order
export const STATE_SEVERITY: Record<IndicatorState, number>;   // RED 3, AMBER 2, UNKNOWN 1, GREEN 0

// [src/config/fxRates.ts]
export const FX_RATES: { asOf: string; base: 'EUR'; rates: Record<Currency, number> };

// [src/engine/fx.ts]
export type FxResult = { ok: true; amount: number; rate: number } | { ok: false; reason: 'no_rate' };
export function toBaseCurrency(m: Money, base: Currency): FxResult;

// [src/engine/indicators/*.ts]  one per file, same shape
export function computeRunway(p: FinancialProfile): IndicatorResult;
export function computeDebtExposure(p: FinancialProfile): IndicatorResult;
export function computeRetirementVisibility(p: FinancialProfile): IndicatorResult;
export function computeAssetConcentration(p: FinancialProfile): IndicatorResult;
export function computeCrossBorderComplexity(p: FinancialProfile): IndicatorResult;

// [src/engine/rank.ts]
export function rankBlindspots(results: IndicatorResult[]): IndicatorId[];   // up to 3 non-GREEN

// [src/engine/score.ts]
export function buildScorecard(p: FinancialProfile, now?: Date): Scorecard;

// [src/privacy/sensitiveFilter.ts]
export interface RedactionResult { text: string; redacted: boolean; kinds: Array<'iban' | 'card' | 'passport' | 'tax_id' | 'digit_run'> }
export function redactSensitive(text: string): RedactionResult;

// [src/guardrail/classifier.ts]
export type Verdict = 'ALLOW' | 'BLOCK';
export function classifyOutbound(text: string, deps?: { client: OpenAI }): Promise<Verdict>;

// [src/guardrail/guard.ts]
export interface GuardDeps { classify: (t: string) => Promise<Verdict>; logTrigger: (t: ComplianceTrigger) => void; maxAttempts?: number }  // default 2
export function guardedGenerate(generate: (attempt: number) => Promise<string>, fallback: string, ctx: { userId: string }, deps: GuardDeps): Promise<{ text: string; attempts: number; fellBack: boolean }>;

// [src/store/db.ts]
export interface Snapshot { userId: string; label: 'baseline' | 'revisit'; createdAt: string; profile: FinancialProfile; scorecard: Scorecard }
export interface ComplianceTrigger { userId: string; createdAt: string; draft: string; verdict: Verdict; attempt: number }
export interface Store {
  saveSnapshot(s: Snapshot): void;                  // replaces existing row with same userId+label
  getSnapshot(userId: string, label: Snapshot['label']): Snapshot | undefined;
  logTrigger(t: ComplianceTrigger): void;
  countTriggers(since?: string): number;
  deleteUser(userId: string): { snapshots: number; triggers: number };
}
export function openStore(path: string | ':memory:'): Store;

// [src/interview/stateMachine.ts]
export interface InterviewState { profile: FinancialProfile; domainIndex: number; awaitingClarification?: string; complete: boolean }
export function nextQuestion(s: InterviewState): string | null;               // null when complete
export function applyAnswer(s: InterviewState, patch: ProfilePatch): InterviewState;
export function isComplete(s: InterviewState): boolean;

// [src/interview/revisit.ts]
export const REVISIT_FIELDS: Array<keyof FinancialProfile>;                  // Decision 9
export function buildRevisitProfile(baseline: FinancialProfile, patch: ProfilePatch): FinancialProfile;

// [src/explain/render.ts]
export function renderWelcome(): string;
export function renderScorecard(sc: Scorecard, explanations: Record<IndicatorId, string>): string;
export function renderComparison(before: Scorecard, after: Scorecard): string;

// [src/agent/handlers.ts]
export interface Incoming { userId: string; text: string }
export interface Outgoing { text: string }
export function handleMessage(msg: Incoming, deps: HandlerDeps): Promise<Outgoing>;
export interface HandlerDeps { store: Store; sessions: Map<string, InterviewState>; llm: OpenAI; classify: GuardDeps['classify'] }
```

External APIs relied on:
- `openai` (`new OpenAI({ baseURL, apiKey })`, `chat.completions.create` with `response_format: { type: 'json_object' }`).
- `better-sqlite3` (`new Database(path)`, `prepare().run()/get()/all()`).
- `zod` (`z.object`, `.safeParse`).
- `@mastra/core` `Agent` class; whether a Telegram channel adapter exists is unverified - verify in task 1.4. Fallback transport is `grammy` long polling (`new Bot(token)`, `bot.on('message:text')`, `bot.start()`).
- `galtea` SDK: API surface unverified - verify in task 7.1.

## Risks / Trade-offs

- **[Risk] Telegram webhook drops on venue WiFi** → *Mitigation*: Support polling during development and provide ngrok/cloudflared tunnel configuration; prepare a cloud deploy option if needed.
- **[Risk] Cold test from Mastra remote judge** → *Mitigation*: The state machine handles conversational chit-chat, unrecognized commands, and approximations without throwing unhandled exceptions.
- **[Risk] Latency stacking from dual LLM calls (generation + guardrail)** → *Mitigation*: Use ultra-fast Nemotron model for guardrail; exempt templated messages from classification; cap regeneration at 2 attempts with a fixed fallback; stream or run evaluations asynchronously where channel adapters permit.
- **[Risk] Unverified platform assumptions (Mastra Telegram channel adapter availability, exact Nebius model IDs)** → *Mitigation*: Task 1.2/1.3 verify both on day one; fallback is a thin Telegram Bot API polling loop feeding the Mastra agent, and the nearest available fast models on Nebius.
- **[Risk] Static FX table drifts from market rates** → *Mitigation*: Rates are only used to normalise approximate ranges; the table is dated and the scorecard states that conversions are approximate.
