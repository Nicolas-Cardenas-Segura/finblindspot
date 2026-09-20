# Tasks

Scaffold scope: deterministic engine, local interview state machine, SQLite history,
terminal demo, grammY Telegram adapter, and optional Mastra/Nebius extraction.
The current tests use simulated Telegram updates and stubbed model responses.
Unchecked integration tasks still require live services or the fuller design;
in particular, pensions use an aggregate value and untracked-pot count, and
explanations are fixed templates rather than model-generated prose.

## 1. Project Initialization & Skeleton

- [x] 1.1 Initialize Node.js TypeScript project, configure `tsconfig.json`, `.gitignore`, and add dependencies (`@mastra/core`, `openai`, `zod`, `dotenv`, `vitest`) and verify with `npm install` and `npm test`.
- [ ] 1.2 Implement Nebius client integration using `openai` SDK pointing to `https://api.tokenfactory.nebius.com/v1/` and verify connectivity via a test model completion.
- [ ] 1.3 Configure Mastra agent and Telegram channel adapter with a basic ping-pong test message and verify response reception on Telegram.

## 2. Conversational Interview Machine & JSON Profile Extraction

- [ ] 2.1 Define strongly-typed Zod schemas for the user's financial profile covering demographics, expenditure, income, debt, assets, and cross-border pensions.
- [ ] 2.2 Implement the multi-domain interview state machine in Mastra with tailored prompts for expat scenarios and verify step progression across domains.
- [ ] 2.3 Implement LLM-driven structured extraction converting natural language user inputs into validated profile JSON and verify with test inputs.
- [x] 2.4 Add adaptive clarification turns for ambiguous or incomplete responses (e.g. unstated currencies or vague estimates) and verify conversational recovery.

## 3. Pure Mathematical Calculation Engine & Unit Tests

- [x] 3.1 Implement pure calculation functions for Emergency Runway (cash / monthly expense) with zero-division handling and verify with Vitest.
- [x] 3.2 Implement pure calculation functions for Debt Exposure (debt service / income) and verify with unit tests.
- [x] 3.3 Implement Retirement Visibility scoring (tracking unknown pension pots, values, and retirement age) and verify with unit tests.
- [x] 3.4 Implement Asset Concentration and Cross-Border Complexity calculation functions and verify with unit tests covering edge cases.

## 4. Threshold Rules Engine & Regulatory Advice Guardrail

- [x] 4.1 Implement configurable threshold definitions and rules engine mapping calculated indicators to Green / Amber / Red status and selecting the top 3 blind spots.
- [x] 4.2 Write Vitest unit tests verifying threshold boundaries and blind spot prioritization order.
- [ ] 4.3 Implement outbound explanation generation prompt ensuring the model only describes the deterministically computed indicators.
- [ ] 4.4 Implement outbound Advice Guardrail classifier (`nvidia/Nemotron-3_5-Lightning`) blocking product mentions or buy/sell directives and verify with test fixtures.

## 5. Baseline Snapshot & Longitudinal Comparison

- [x] 5.1 Implement local snapshot persistence saving completed profiles and indicator results with timestamps.
- [x] 5.2 Implement `/revisit` or simulated 6-month progress comparison workflow demonstrating delta changes between baseline and updated metrics.

## 6. Galtea Adversarial Evaluation

- [ ] 6.1 Set up Galtea SDK test runner targeting the agent with adversarial prompts (attempting prompt injections to give advice or confuse currencies).
- [ ] 6.2 Execute initial Galtea test run, document identified vulnerabilities, apply targeted prompt/guardrail mitigations, and rerun evaluation to capture before-and-after improvement metrics.

## 7. Documentation & Final Verification

- [ ] 7.1 Update `README.md` with clear cold-clone setup instructions, Telegram bot handle, architecture overview, and the required regulatory advice boundary disclosure.
- [ ] 7.2 Run end-to-end rehearsal simulating a cold user conversation on Telegram from welcome greeting to final scorecard and revisited snapshot.
