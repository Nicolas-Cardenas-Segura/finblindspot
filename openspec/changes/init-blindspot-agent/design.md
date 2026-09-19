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

### 4. Guardrail Mechanism: Dual-layer Defense
- **Decision**:
  1. System prompt boundary setting (declares education-only in welcome message).
  2. Outbound message classifier hook (intercepts any drafted response; if it mentions specific tickers, buy/sell directives, or provider endorsements, regenerates with an educational prompt).
- **Rationale**: A disclaimer is not a compliance control. Active interception prevents regulatory breach.

### 5. Storage Architecture
- **Decision**: SQLite via lightweight ORM / query builder or in-memory snapshot store.
- **Rationale**: Minimizes setup friction and keeps baseline snapshots reproducible across demo runs.

## Risks / Trade-offs

- **[Risk] Telegram webhook drops on venue WiFi** → *Mitigation*: Support polling during development and provide ngrok/cloudflared tunnel configuration; prepare a cloud deploy option if needed.
- **[Risk] Cold test from Mastra remote judge** → *Mitigation*: The state machine handles conversational chit-chat, unrecognized commands, and approximations without throwing unhandled exceptions.
- **[Risk] Latency stacking from dual LLM calls (generation + guardrail)** → *Mitigation*: Use ultra-fast Nemotron model for guardrail; stream or run evaluations asynchronously where channel adapters permit.
