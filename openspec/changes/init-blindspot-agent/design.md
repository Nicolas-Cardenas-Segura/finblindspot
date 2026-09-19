# Technical Design: Financial Blindspot Detector

## Context

See proposal.md for motivation. Preserve the existing OpenSpec change and teammate history. The user approved Telegram plus a read-only dashboard on Railway, targeted offline safety tests and the illustrative bands below. Nebius and Telegram are configured locally, and the supplied Miro journey image has been reviewed. Full live-flow verification, Railway deployment and Galtea evaluation remain gates. Work to the earlier event deadline, Sunday 20 September 2026 at 11:00 Europe/Madrid, and keep the bot live through 17:30. The published submission link still needs organiser confirmation.

## Goals / Non-Goals

**Goals:** Separate facts from wording, preserve user state across restarts, enforce a single pre-delivery safety boundary, protect private reports, and produce reproducible Galtea evidence.

**Non-Goals:** No banking connections, live FX, product recommendations, second chat UI, production six-month scheduler, distributed database, mandatory Norma/Make integration or legal compliance guarantee.

## Decisions

### 1. Application boundary

Telegram and authenticated evaluation routes call one application turn service. A pure core owns typed profiles, interview transitions, indicators, rules, report facts and comparison. Persistence and model clients stay outside it. Server-derived ownership is never a tool argument. Dashboard JSON is a persisted approved report, not independently calculated browser output.

### 2. Runtime and models

Use a single Node service with Mastra Channels and sanitised Mastra Memory. Start from aged, pinned dependencies: Mastra core 1.66.0, CLI 1.29.0, memory 1.29.0, libsql 1.22.5, Telegram adapter 4.40.0. Compile against installed APIs before assuming current online examples apply. Nebius candidates are Qwen/Qwen3-235B-A22B-Instruct-2507 for extraction/wording and Qwen/Qwen3-30B-A3B-Instruct-2507 for classification. DeepSeek-V4-Flash-0731 is only a candidate fallback, disabled until independently checked. Do not treat reported benchmark samples as proof of determinism. Model router configuration must preserve the upstream model namespace. A standalone OpenAI-compatible client can handle strict verdicts.

### 3. Financial semantics and approved illustrative bands

Money stores a non-negative bounded range, ISO currency and period. Unknown/skipped/not-applicable values are distinct. Never infer exchange rates or use unannounced midpoints. Request approximate base-currency equivalents; incomparable inputs produce not-assessed results. Income is monthly take-home, expenditure is essential monthly expenditure, cash is accessible cash, and debt is monthly debt service. Annual flow amounts are normalised in code.

Runway: red below 3 months, amber from 3 to below 6, green from 6. Debt service/income: green below 20%, amber from 20 to below 40%, red from 40%. Largest asset class/total: green below 60%, amber from 60 to below 80%, red from 80%. Retirement visibility: zero missing applicable fields green, one amber, two or more red. Cross-border complexity is extra jurisdictions plus extra currencies plus unverified foreign pensions: zero green, one or two amber, three or more red. These are user-approved product heuristics, not universal standards. Ranges crossing bands are not assigned a falsely precise colour. Zero denominators remain explicit unavailable states.

The short interview gathers country/base currency, income, expenditure, accessible cash and debt payments; other indicators remain not assessed. Full interview covers all 15 brief domains. Model patches are validated, confirmed and limited to known profile fields; corrections do not silently erase prior values. Rank up to three genuine flags or labelled data gaps using deterministic tie-breaking.

### 4. Delivery and privacy

Use controlled non-streaming channel handlers. Hide tool cards and never forward drafts, raw errors or intermediate model steps. A prefilter may reject; it never bypasses the classifier. Every final message, including deterministic fallbacks, must receive a valid ALLOW before delivery. Allow at most one regeneration; invalid JSON, truncation, timeout and unavailable classifier suppress delivery while leaving state resumable. Render all numeric report facts, units, colours and ranking in code. The report model selects definition/uncertainty phrase IDs for existing ranked indicators. Code validates references and renders an approved phrase catalogue; arbitrary generated report prose is not accepted. This prevents new numbers or jurisdiction-specific claims structurally. Invalid selections fall back to deterministic educational wording.

Reject sensitive input and unsupported attachments before model calls, history and telemetry. No raw financial content or tokens in operational logs. Private Telegram chats only. Deny public framework agent/memory/workflow access; expose only exact approved routes with webhook verification or scoped credentials. Evaluation uses synthetic, isolated identities and a dedicated inbound bearer token, separate from Galtea account credentials.

### 5. Durable state and reports

One Railway replica with `/data` mounted. Use explicit absolute file URLs for Mastra storage and application LibSQL tables. Initialise tables at startup, not build. Store canonical profiles, interview state, processed turn IDs, immutable snapshots and approved report DTOs explicitly; Mastra memory alone is not the domain store. Serialise per-user turns and use unique turn keys/transactions. Retries must not create duplicate snapshots; do not claim exactly-once outbound network delivery.

Snapshots include real timestamps, currency, schema and rules versions. Revisit creates a new record, retaining baseline. Only comparable indicators get deltas. `/simulate6months` is labelled and does not falsify timestamps or claim autonomous scheduling. Reports use expiring random bearer capabilities stored hashed, no session IDs as authorisation, no-store/no-referrer responses and no third-party report assets. Configurable short retention plus confirmed `/forget` deletes application state and sanitised Mastra memory and revokes links; Telegram history remains outside application control.

### 6. Evaluation and deployment

Galtea init/message/finalize endpoints execute the same turn service and guardrail as Telegram. Configure actual HTTPS Endpoint Connections, not a Python runtime or fake agent stub. Run early before dashboard polish. Freeze cases, evaluator configuration and fresh-session setup; record versions, sample/error counts, real failing cases and the rerun. Security datasets each cover one threat; include factual and benign completion tests to detect blanket refusal. Never fabricate improvement.

## Risks / Trade-offs

- Classifier adds latency and can suppress delivery during outages -> bounded generation/history/retries, measured latency and resumable state; never fail open.
- Sensitive-text detection cannot guarantee recognition of every secret -> minimise collection, reject unsupported formats and avoid raw persistence/logging.
- Illustrative bands may be misunderstood -> show provenance, arithmetic and limitations; never prescribe action.
- Volume-backed Railway deployments briefly interrupt service and cannot use replicas -> freeze deploys during judging and verify restart recovery.
- Live integration cannot be proven without credentials -> keep corresponding tasks open; independent pure-core work can proceed.
- Miro's reviewed journey image has a 2.7-month amber example and a cash-flow card -> retain the explicitly approved red runway boundary and agreed concentration indicator; reconcile demo wording rather than silently changing the calculation rules.

## Migration Plan

Create feat/financial-blindspot from refreshed origin/main. Update this existing change, pin/install dependencies, establish a guarded Telegram slice, deploy, connect real evaluation, complete offline core and interview, evaluate/fix, then add dashboard and rehearse. No automatic push, merge, public publication, payments or submission. Roll back executable deployments to the last verified commit without deleting user data; version persisted schemas and keep migrations additive.
