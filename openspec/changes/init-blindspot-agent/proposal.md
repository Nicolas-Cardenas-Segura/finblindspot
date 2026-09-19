# Proposal: Financial Blindspot Detector & Personalised Learning Agent

## Why

Internationally mobile professionals and expats face multi-jurisdictional financial complexity—earning in one currency, pensions in another, investments split across borders—leading to overlooked risks (currency drag, untracked pensions, high debt exposure, missing emergency buffers). Most financial software shows what users already have; Financial Blindspot reveals what they are dangerously missing before it becomes costly. To remain ethical and legally compliant under EU financial regulations, the system strictly provides financial education and diagnostic awareness rather than regulated investment advice.

## What Changes

- **Conversational Interview on Telegram**: An empathetic 10-minute dialogue via Mastra and Nebius Token Factory (`DeepSeek-V4.1-Flash`) that gathers cross-border expat financial data turn-by-turn into a structured, validated JSON profile.
- **Deterministic Calculation Engine**: Pure TypeScript mathematical calculations (no LLM) computing quantitative indicators: Emergency Runway, Debt Exposure, Retirement Visibility, Asset Concentration, and Cross-border Complexity.
- **Objective Rules Engine**: Threshold-based mapping of calculated indicators to Green / Amber / Red status and ranking of top 3 financial blind spots.
- **Regulatory Advice Guardrail**: An independent outbound message filter powered by Nebius (`Nemotron-3_5-Lightning`) that blocks and regenerates any text resembling product recommendations, security picking, or regulated financial advice before it reaches the user.
- **Baseline Snapshot & Then-versus-Now**: Saving initial session diagnostics and enabling a simulated "six months later" re-check to demonstrate delta progress over time.
- **Adversarial Evaluation with Galtea**: Integration of Galtea adversarial testing to uncover agent drift across the advice boundary or hallucinated rules, proving measurable improvement after fixes.

## Capabilities

### New Capabilities
- `conversational-interview`: State machine coordinating the multi-domain conversational diagnostic interview over Telegram via Mastra and parsing natural language answers into a validated financial profile.
- `calculation-engine`: Pure functions and deterministic rules mapping financial profile metrics to R/A/G indicators and identifying top 3 blind spots without model inference.
- `advice-guardrail`: Automated outbound message classification ensuring all bot communications remain educational and strictly never provide regulated financial advice.
- `baseline-comparison`: Persistence and comparison of user financial snapshots to evaluate progress over simulated time intervals.

### Modified Capabilities
*(None - fresh project)*

## Impact

- **Core Stack**: Node.js, TypeScript, `@mastra/core`, Telegram channel adapter, `openai` SDK targeting Nebius Token Factory (`https://api.tokenfactory.nebius.com/v1/`), and `galtea` SDK.
- **Storage**: Local SQLite / in-memory store for session states and historical baseline snapshots.
- **Testing**: Comprehensive unit tests for all pure calculation functions and threshold boundaries using Vitest.
- **Compliance & Safety**: Three-tiered defense against regulated financial advice (system prompt, deterministic scorecard numbers, and independent classifier guardrail).
