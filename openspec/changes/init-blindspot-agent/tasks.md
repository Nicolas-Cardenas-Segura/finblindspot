# Tasks

## 1. Project Initialization & Skeleton

- [ ] 1.1 Initialize Node.js TypeScript project, configure `tsconfig.json`, `.gitignore`, and add dependencies (`@mastra/core`, `openai`, `zod`, `dotenv`, `vitest`) and verify with `npm install` and `npm test`.
- [ ] 1.2 Implement Nebius client integration using `openai` SDK pointing to `https://api.tokenfactory.nebius.com/v1/`, verify that both `deepseek-ai/DeepSeek-V4.1-Flash` and `nvidia/Nemotron-3_5-Lightning` are listed and answer a test completion, and record any substitution in `design.md` Decision 3.
- [ ] 1.3 Configure Mastra agent and Telegram connectivity (native channel adapter if available, otherwise a Bot API polling loop), support polling in development with documented ngrok/cloudflared webhook setup, and verify a ping-pong message on Telegram.

## 2. Conversational Interview Machine & JSON Profile Extraction

- [ ] 2.1 Define strongly-typed Zod schemas for the user's financial profile covering demographics, base currency, expenditure, income, debt, assets, and cross-border pensions, with original amount + currency code preserved per monetary field.
- [ ] 2.2 Implement the multi-domain interview state machine in Mastra with tailored prompts for expat scenarios, including the `/start` disclosure and base-currency confirmation as the first steps, and verify step progression across domains.
- [ ] 2.3 Implement LLM-driven structured extraction converting natural language user inputs into validated profile JSON and verify with test inputs.
- [ ] 2.4 Add adaptive clarification turns for ambiguous or incomplete responses (e.g. unstated currencies or vague estimates) and verify conversational recovery.
- [ ] 2.5 Implement the deterministic inbound sensitive-input filter (IBAN, Luhn card numbers, passport/tax-ID patterns, long digit runs) that redacts before any model call and never persists the raw text, and verify with Vitest fixtures including ordinary numeric answers that must pass through.

## 3. Pure Mathematical Calculation Engine & Unit Tests

- [ ] 3.1 Implement pure calculation functions for Emergency Runway (cash / monthly expense) with zero-division handling and verify with Vitest.
- [ ] 3.2 Implement pure calculation functions for Debt Exposure (debt service / income) and verify with unit tests.
- [ ] 3.3 Implement Retirement Visibility scoring (tracking unknown pension pots, values, and retirement age) and verify with unit tests.
- [ ] 3.4 Implement Asset Concentration and Cross-Border Complexity calculation functions (jurisdiction count plus unknown tax statuses) and verify with unit tests covering edge cases.
- [ ] 3.5 Implement base-currency normalisation with a dated static rate table, returning `UNKNOWN` for currencies without a rate, and verify with unit tests.

## 4. Threshold Rules Engine & Regulatory Advice Guardrail

- [ ] 4.1 Implement `thresholds.ts` with the default boundaries from the calculation-engine spec and a rules engine mapping indicators to `GREEN` / `AMBER` / `RED` / `UNKNOWN`, ranking by state then fixed indicator priority, and selecting up to three non-green blind spots.
- [ ] 4.2 Write Vitest unit tests verifying every threshold boundary value (e.g. runway at exactly 3 and 6 months), `UNKNOWN` handling, tie-breaking, and the fewer-than-three case.
- [ ] 4.3 Implement outbound explanation generation prompt ensuring the model only describes the deterministically computed indicators, and author the fixed per-indicator fallback messages.
- [ ] 4.4 Implement outbound Advice Guardrail classifier (`nvidia/Nemotron-3_5-Lightning`) that skips templated messages, blocks product mentions or buy/sell directives, regenerates at most twice before sending the fallback, and writes a compliance trigger row per rejection; verify with test fixtures including the retry-limit path.

## 5. Baseline Snapshot & Longitudinal Comparison

- [ ] 5.1 Implement local snapshot persistence (`snapshots` and `compliance_triggers` tables keyed by Telegram user id) saving completed profiles and indicator results with timestamps and a `baseline` / `revisit` label.
- [ ] 5.2 Implement the `/revisit` workflow that re-asks only the mutable numeric fields, carries other answers forward, stores a `revisit` snapshot, and renders the then-versus-now delta; handle the no-baseline case.
- [ ] 5.3 Implement `/forget` to delete all rows for the requesting user id and confirm in chat; verify with a persistence test.

## 6. Galtea Adversarial Evaluation

- [ ] 6.1 Set up Galtea SDK test runner targeting the agent with adversarial prompts (attempting prompt injections to give advice or confuse currencies).
- [ ] 6.2 Execute initial Galtea test run, record the compliant-response rate and compliance trigger count, document identified vulnerabilities, apply targeted prompt/guardrail mitigations, and rerun evaluation to capture the before-and-after metrics for both the advice boundary and the math-interpretation boundary.

## 7. Documentation & Final Verification

- [ ] 7.1 Update `README.md` with clear cold-clone setup instructions, Telegram bot handle, architecture overview, the `/start`, `/revisit`, `/forget` commands, and the required regulatory advice boundary disclosure.
- [ ] 7.2 Run end-to-end rehearsal simulating a cold user conversation on Telegram from welcome greeting to final scorecard, revisited snapshot, and `/forget`.
