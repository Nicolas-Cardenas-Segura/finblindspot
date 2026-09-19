# Proposal: Financial Blindspot Detector

## Why

Internationally mobile professionals and expats face multi-jurisdictional financial complexity—earning in one currency, pensions in another, investments split across borders—leading to overlooked risks (currency drag, untracked pensions, high debt exposure, missing emergency buffers). Most financial software shows what users already have; Financial Blindspot reveals what they are dangerously missing before it becomes costly. To remain ethical and legally compliant under EU financial regulations, the system strictly provides financial education and diagnostic awareness rather than regulated investment advice.

## What Changes

- **Conversational Interview on Telegram**: An empathetic 10-minute dialogue via Mastra and Nebius Token Factory (`DeepSeek-V4.1-Flash`) that gathers cross-border expat financial data turn-by-turn into a structured, validated JSON profile.
- **Deterministic Calculation Engine**: Pure TypeScript mathematical calculations (no LLM) computing quantitative indicators: Emergency Runway, Debt Exposure, Retirement Visibility, Asset Concentration, and Cross-border Complexity.
- **Objective Rules Engine**: Threshold-based mapping of calculated indicators to Green / Amber / Red / Unknown status (defaults pinned in the spec, centralised in one config module) and deterministic ranking of the top 3 financial blind spots.
- **Base Currency Normalisation**: The interview fixes a base currency up front and a bundled static rate table converts other currencies before any calculation.
- **Regulatory Advice Guardrail**: An independent outbound message filter powered by Nebius (`Nemotron-3_5-Lightning`) that blocks and regenerates any text resembling product recommendations, security picking, or regulated financial advice before it reaches the user, capped at 2 regenerations with a pre-approved fallback, and logging every trigger.
- **Deterministic Sensitive Input Filter**: Regex-based redaction of IBANs, card numbers, passport and tax identifiers before any user text reaches a model provider.
- **Baseline Snapshot & Then-versus-Now**: Saving initial session diagnostics and enabling a simulated "six months later" `/revisit` re-check to demonstrate delta progress over time, plus `/forget` for user-initiated erasure.
- **Adversarial Evaluation with Galtea**: Integration of Galtea adversarial testing to uncover agent drift across the advice boundary or hallucinated rules. Success metric: share of adversarial prompts that yield a compliant (educational or `BLOCK`ed) response, measured before and after mitigations, together with the compliance trigger count per run.

## Capabilities

### New Capabilities
- `conversational-interview`: State machine coordinating the multi-domain conversational diagnostic interview over Telegram via Mastra, declaring a base currency, redacting sensitive identifiers before model calls, and parsing natural language answers into a validated financial profile.
- `calculation-engine`: Pure functions and deterministic rules normalising amounts to the base currency, mapping financial profile metrics to Green / Amber / Red / Unknown indicators, and ranking the top 3 blind spots without model inference.
- `advice-guardrail`: Automated outbound message classification with bounded regeneration, safe fallback, and compliance trigger logging, ensuring all bot communications remain educational and strictly never provide regulated financial advice.
- `baseline-comparison`: Persistence, comparison, and erasure of user financial snapshots to evaluate progress over simulated time intervals.

### Modified Capabilities
*(None - fresh project)*

## Impact

- **Core Stack**: Node.js, TypeScript, `@mastra/core`, Telegram channel adapter, `openai` SDK targeting Nebius Token Factory (`https://api.tokenfactory.nebius.com/v1/`), and `galtea` SDK.
- **Storage**: Local SQLite / in-memory store for session states, historical baseline snapshots, and compliance trigger logs, keyed by Telegram user id and fully erasable via `/forget`.
- **Testing**: Comprehensive unit tests for all pure calculation functions and threshold boundaries using Vitest.
- **Compliance & Safety**: Three-tiered defense against regulated financial advice (system prompt, deterministic scorecard numbers, and independent classifier guardrail).
