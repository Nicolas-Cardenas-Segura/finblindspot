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
- **Decision**: SQLite via lightweight ORM / query builder or in-memory snapshot store, keyed by Telegram user id. Two tables: `snapshots` (profile + scorecard + timestamp + label such as `baseline` or `revisit`) and `compliance_triggers` (see Decision 4). A `/forget` command deletes every row for the requesting user id. No retention beyond the demo; the datastore is documented as disposable.
- **Rationale**: Minimizes setup friction and keeps baseline snapshots reproducible across demo runs, while giving the user an erasure path consistent with the data-minimisation invariant.

### 9. Simulated Revisit
- **Decision**: `/revisit` re-asks only the mutable numeric fields (liquid cash, monthly expenditure, debt service, income, largest asset share, number of pensions with unknown values); unchanged answers are carried forward from the baseline. The new snapshot is labelled `revisit` with the real timestamp; "six months later" is a presentation label, not a fake clock. If no baseline exists, the bot explains and offers to start the full assessment.
- **Rationale**: Keeps the follow-up under two minutes for the demo while producing a genuine then-versus-now delta.

## Risks / Trade-offs

- **[Risk] Telegram webhook drops on venue WiFi** → *Mitigation*: Support polling during development and provide ngrok/cloudflared tunnel configuration; prepare a cloud deploy option if needed.
- **[Risk] Cold test from Mastra remote judge** → *Mitigation*: The state machine handles conversational chit-chat, unrecognized commands, and approximations without throwing unhandled exceptions.
- **[Risk] Latency stacking from dual LLM calls (generation + guardrail)** → *Mitigation*: Use ultra-fast Nemotron model for guardrail; exempt templated messages from classification; cap regeneration at 2 attempts with a fixed fallback; stream or run evaluations asynchronously where channel adapters permit.
- **[Risk] Unverified platform assumptions (Mastra Telegram channel adapter availability, exact Nebius model IDs)** → *Mitigation*: Task 1.2/1.3 verify both on day one; fallback is a thin Telegram Bot API polling loop feeding the Mastra agent, and the nearest available fast models on Nebius.
- **[Risk] Static FX table drifts from market rates** → *Mitigation*: Rates are only used to normalise approximate ranges; the table is dated and the scorecard states that conversions are approximate.
