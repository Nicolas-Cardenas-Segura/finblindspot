# Financial Blindspot Detector

> **Status: Work in Progress (WIP)**  
> This project is currently in active development for HackBarna / AI Summit Barcelona 2026. The product is defined in [`finance-blind-spot-v1-spec.html`](finance-blind-spot-v1-spec.html) (v1 master build document — questionnaire, engine, twenty blind-spot rules, content library, results, re-assessment, test cases). Architecture decisions and implementation tasks that deliver it over Telegram are tracked in [`openspec/changes/init-blindspot-agent/`](openspec/changes/init-blindspot-agent/).

---

## 🎯 Overview

Most financial apps show you what you have. **Financial Blindspot** shows you what you are missing before it becomes expensive.

Designed for internationally mobile professionals and expats—who face split pensions, cross-border succession and protection gaps—the bot asks around forty plain questions over Telegram, runs a deterministic retirement projection, checks twenty blind-spot rules, and returns three things: an honest picture of where they stand, the gaps they had not noticed, and a saved position they can come back to.

The re-assessment is the product: every assessment is stored immutably, and `/revisit` prefills the last answers, asks "still right?", surfaces the things they didn't know last time first, and shows what moved — recomputed under one set of assumptions so only real change counts.

---

## 🧩 Capabilities

| Capability | What it does |
| --- | --- |
| `conversational-interview` | Consent first, then the v1 questionnaire (sections A–H, ~40 field IDs) one message at a time over Telegram; every money and yes/no field offers "I don't know" (stored as `null`, never `0`); the model only maps a free-text reply onto the current field; sensitive identifiers are redacted before any model call. |
| `calculation-engine` | Pure TypeScript: derived values, the v1 §5 retirement projection (`required_pot`, `projected_assets`, `position`, today's-money and 3/4/5% sensitivity, minimum-estimate flag), input validation, the twenty v1 §6 blind-spot rules with severity bump and a deterministic top-three action plan. Reproduces v1 test cases A–D exactly. |
| `advice-guardrail` | Blind-spot copy comes from a static content library (v1 §7); the model may rephrase only "why it matters" around the user's numbers. An independent classifier plus an invented-number check gate every model-generated message (max 2 attempts, then the library copy), logging every compliance trigger. |
| `baseline-comparison` | Immutable assessment records (answers, assumptions, results stored separately); `/revisit` prefills from the last one, asks previous unknowns first, recomputes both runs under current assumptions and renders Then / Now / Change with closed, new and still-open blind spots and `unknowns_resolved`; `/forget` erases all user data. |

Behaviour contracts for each capability live in [`openspec/changes/init-blindspot-agent/specs/`](openspec/changes/init-blindspot-agent/specs/).

---

## ⚖️ Core Invariants

These architectural and regulatory invariants are strictly enforced across the codebase:

### 1. Education, Never Regulated Advice
Under EU regulations, personalized retail investment advice is a regulated activity. This system provides financial education and diagnostic awareness only.
- **The AI may:** ask follow-up questions, clarify an answer, point out missing information, explain a calculation or a concept, explain why something is a blind spot, suggest questions to ask a professional.
- **The AI may not:** recommend an investment, product or pension transfer, invent a missing value, present an assumption as a guarantee, or state that a projection will happen.
- **Enforcement:** a three-layer defense:
  1. **System Prompt Boundary**: the may / may-not list above, verbatim, plus the mandatory opening disclosure.
  2. **Deterministic numbers and copy**: every figure comes from the engine and every blind-spot text from the content library; the model has nothing of its own to recommend from.
  3. **Outbound Guardrail**: an independent fast model (`Nemotron-3_5-Lightning`) and a deterministic invented-number check gate every model-generated message before delivery.

### 2. The Agent Sits Either Side of the Maths, Never Inside It
- **Field IDs are the contract**: every question maps to one ID; the engine only ever reads IDs.
- **Plain Code Engine**: the projection formulas, validation, the twenty rules, severities, topic bump and top-three selection are pure TypeScript, specified in the [calculation-engine spec](openspec/changes/init-blindspot-agent/specs/calculation-engine/spec.md) and pinned by v1 test cases A–D.
- **"I don't know" is an answer, not a zero**: stored as `null`, left out of the maths, listed as missing, and it fires its own blind spot. Not knowing is the finding.
- **Single currency in v1**: `base_currency` is EUR / GBP / USD; multi-currency conversion is deferred to v2 per the v1 document.

### 3. Data Minimization & Privacy
- **Zero Credentials**: Never collects or stores bank credentials, account numbers, card details, tax IDs, or passport numbers.
- **Approximations Only**: All evaluations operate on ranges, rounded numbers, and self-reported estimates.
- **Sensitive Input Handling**: A deterministic (non-LLM) filter redacts IBANs, card numbers, passport and tax identifiers before any user text reaches a model provider, and reminds the user that only ranges and estimates are needed.
- **Erasure on Request**: `/forget` deletes every assessment, interview state, and compliance log entry for the requesting Telegram user.

---

## 💬 Telegram Commands

| Command | Behaviour |
| --- | --- |
| `/start` | Shows the education-only disclosure and no-credentials notice, records consent, then walks sections A–H one question at a time (resumes a draft if one exists). Ends with the results message and the three-item action plan. |
| `/revisit` | Prefilled re-assessment: previous unknowns first, then "still right?" per field; creates a new immutable assessment and renders the Then / Now / Change progress view. |
| `/forget` | Deletes all stored data for the requesting user and confirms in chat. |

---

## 📐 Specification-Driven Development (OpenSpec)

This project follows [OpenSpec](https://github.com/openspec/openspec) to maintain auditable specifications and verifiable tasks:
- **`openspec/specs/`**: Core system capabilities and behavior contracts (populated when a change is archived).
- **`openspec/changes/init-blindspot-agent/`**: Active development proposal, specs delta, architecture design, and implementation checklist.
  - [`proposal.md`](openspec/changes/init-blindspot-agent/proposal.md) — why the project exists and what it adds.
  - [`design.md`](openspec/changes/init-blindspot-agent/design.md) — goals/non-goals, technical decisions, risks.
  - [`specs/`](openspec/changes/init-blindspot-agent/specs/) — requirements and scenarios per capability.
  - [`tasks.md`](openspec/changes/init-blindspot-agent/tasks.md) — the phased implementation checklist.

Out of scope for the MVP: custom web/mobile UI, banking API or credential integrations, distributed database infrastructure, scheduled push nudges, and everything the v1 document defers to v2 (post-retirement income periods, tax, multi-currency conversion, rental income, pension transfer analysis, …).

---

## 🛠️ Stack & Technology

- **Agent & Channels**: [Mastra](https://mastra.ai) agent; Telegram via Mastra adapter or `grammy` long polling
- **Model Inference**: [Nebius Token Factory](https://tokenfactory.nebius.com) (`DeepSeek-V4.1-Flash` for answer extraction and explanation, `Nemotron-3_5-Lightning` for the outbound guardrail)
- **Evaluation & Adversarial Testing**: [Galtea](https://galtea.ai) (advice-boundary, invented-number and rule-not-fired probes)
- **Language & Runtime**: TypeScript / Node.js, `zod`
- **Storage**: Local SQLite (`better-sqlite3`) — immutable assessments, interview state, compliance triggers
- **Content**: `content/blind_spots.json` — the v1 §7 copy, keyed by rule id, editable without a deploy
- **Testing**: Vitest; v1 test cases A–D are the engine's acceptance suite

---

## 🗺️ Implementation Roadmap

Tracked in [`tasks.md`](openspec/changes/init-blindspot-agent/tasks.md) as small, single-file tasks (each names its target path, exported signature, and a mechanically checkable "Done when"); the project layout and shared types they reference are in [`design.md`](openspec/changes/init-blindspot-agent/design.md). No group is implemented yet.

1. Project skeleton & external API spikes (Nebius model IDs, Telegram transport).
2. Configuration tables (assumption defaults/ranges, country→currency).
3. Questionnaire schema, field definitions & test fixtures (v1 cases A–D).
4. Privacy filter.
5. Calculation engine (derived values, validation, projection).
6. Blind-spot rules (twenty rules, topic bump, action plan).
7. Assessment & comparison.
8. SQLite store (immutable assessments, interview state, triggers, erasure).
9. LLM prompts, extraction, guardrail (classifier + invented-number check).
10. Content library, explanation, rendering.
11. Interview state machine & revisit.
12. Agent, handlers, Telegram transport.
13. Galtea adversarial evaluation (baseline, fix, re-run).
14. Documentation & end-to-end rehearsal.

The task-granularity rules that produced this list live in [`openspec/config.yaml`](openspec/config.yaml) under `rules:` and are project-agnostic — copy that block into any OpenSpec repo whose tasks will be executed by small or fast models.

---

## 🚀 Getting Started

*Environment configuration and setup instructions will be finalized in Phase 1 of the implementation plan.*

Expected prerequisites: Node.js with TypeScript, a Telegram bot token, a Nebius Token Factory API key (base URL `https://api.tokenfactory.nebius.com/v1/`), and a Galtea API key for adversarial evaluation runs.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
