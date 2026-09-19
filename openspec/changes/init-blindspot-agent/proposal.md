# Proposal: Financial Blindspot Detector

## Why

Internationally mobile professionals and expats face multi-jurisdictional financial complexity—earning in one currency, pensions in another, investments split across borders—leading to overlooked risks (untracked pensions, high debt exposure, missing emergency buffers, cross-border succession gaps). Most financial software shows what users already have; Financial Blindspot reveals what they are missing before it becomes costly, and gives them a saved position to come back to in six months. To remain ethical and legally compliant under EU financial regulations, the system strictly provides financial education and diagnostic awareness rather than regulated investment advice.

The product content is frozen in `finance-blind-spot-v1-spec.html` (v1 master build document: questionnaire, engine, twenty blind-spot rules, content library, results and re-assessment). This change delivers that v1 over Telegram; nothing outside the v1 document is in scope.

## What Changes

- **Telegram Questionnaire**: A one-field-per-message walk through the ~40 v1 fields (sections A–H) via Mastra and Nebius Token Factory (`DeepSeek-V4.1-Flash`), gated by a consent tick, with an explicit "I don't know" on every money and yes/no field. Answers are stored under their field IDs; the model only maps free text onto the current field.
- **Deterministic Retirement Projection**: Pure TypeScript implementation of the v1 §5 formulas (`required_pot`, `projected_assets`, `position`, `position_today`, `extra_monthly`, 3/4/5% sensitivity) with `null` never becoming `0`, `is_minimum_estimate` + `missing_fields[]`, and the four reference test cases A–D reproduced exactly.
- **Blind-Spot Rule Engine**: The twenty v1 §6 rules with fixed severities, topic bump from `learning_priorities[]`, and a deterministic top-three action plan (severity, then rule number).
- **Content Library**: Static JSON keyed by `rule_id` carrying the v1 §7 copy (`title`, `headline`, `why`, `learn[]`, `ask`, `severity`, `topic`); the model may rephrase `why` around the user's numbers and nothing else.
- **Regulatory Advice Guardrail**: An independent outbound classifier (`Nemotron-3_5-Lightning`) that blocks product/provider/transfer recommendations and invented numbers, capped at 2 regenerations with the library `why` as fallback, logging every trigger.
- **Deterministic Sensitive Input Filter**: Regex-based redaction of IBANs, card numbers, passport and tax identifiers before any user text reaches a model provider.
- **Immutable Assessments & Re-Assessment**: Every completed assessment is a new immutable record with `answers`, `assumptions` and `results` stored separately. `/revisit` prefills from the last record, surfaces previous unknowns first, recomputes both runs under the current assumptions, and renders the Then/Now/Change progress view with `unknowns_resolved[]`. `/forget` erases everything for the user.
- **Adversarial Evaluation with Galtea**: Galtea adversarial testing for advice-boundary breaches, invented numbers and rules that did not fire. Success metric: share of adversarial prompts yielding a compliant response, before and after mitigations, plus compliance trigger count per run.

## Capabilities

### New Capabilities
- `conversational-interview`: Consent, section-ordered field-ID questionnaire over Telegram, "I don't know" → `null`, LLM extraction constrained by field schema, sensitive-input redaction, draft/complete lifecycle.
- `calculation-engine`: Derived values, retirement projection, validation, twenty blind-spot rules, severity bump and top-three action plan; reproduces v1 test cases A–D.
- `advice-guardrail`: Content-library rendering boundary, required results copy, outbound classification with bounded regeneration, compliance trigger logging.
- `baseline-comparison`: Immutable assessment records, prefilled `/revisit`, comparison under one set of assumptions, progress view, `/forget` erasure.

### Modified Capabilities
*(None - fresh project)*

## Impact

- **Core Stack**: Node.js, TypeScript, `@mastra/core`, Telegram transport, `openai` SDK targeting Nebius Token Factory (`https://api.tokenfactory.nebius.com/v1/`), `zod`, `better-sqlite3`, Vitest, `galtea` SDK.
- **Storage**: Local SQLite holding immutable assessment records, interview state, and compliance triggers, keyed by Telegram user id and fully erasable via `/forget`.
- **Testing**: Unit tests for every formula step, every rule, the severity bump and the comparison; the four v1 test cases are the engine's acceptance suite.
- **Compliance & Safety**: The agent sits either side of the maths, never inside it. Three-tiered defense against regulated advice: system prompt, deterministic numbers and library copy, independent classifier.
- **Deferred to v2 (per the v1 document)**: income that starts after retirement age modelled as a second period, tax and country-specific rules, attitude to risk, partner as a separate person, multi-currency holdings and conversion, rental income, per-account detail, fixed retirement end age, bank feeds, pension transfer analysis, scheduled push nudges.
