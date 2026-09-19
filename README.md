# Financial Blindspot Detector

> **Status: Work in Progress (WIP)**  
> This project is currently in active development for HackBarna / AI Summit Barcelona 2026. Specifications, architecture decisions, and implementation tasks are tracked in [`openspec/changes/init-blindspot-agent/`](openspec/changes/init-blindspot-agent/).

---

## 🎯 Overview

Most financial apps show you what you have. **Financial Blindspot** shows you what you are missing before it becomes expensive.

Designed specifically for internationally mobile professionals and expats—who face split pensions, multi-currency assets, and cross-border tax complexity—the system conducts a 10-minute conversational checkup via Telegram, deterministically evaluates key financial health indicators, and produces an objective scorecard detailing their top 3 blind spots.

After the checkup, the baseline snapshot is stored so the user can trigger a simulated "six months later" re-check and see a then-versus-now delta on every indicator.

---

## 🧩 Capabilities

| Capability | What it does |
| --- | --- |
| `conversational-interview` | Single-question-at-a-time Telegram interview that collects demographics, income, expenditure, debt, assets and multi-country pensions, asks empathetic clarifying follow-ups, and extracts a strongly-typed profile. |
| `calculation-engine` | Pure TypeScript computation of Emergency Runway, Debt Exposure, Retirement Visibility, Asset Concentration and Cross-Border Complexity, plus threshold mapping to Green / Amber / Red and ranking of the top 3 blind spots. |
| `advice-guardrail` | Independent classifier on every outbound message; regenerates educational text whenever a draft looks like regulated advice. |
| `baseline-comparison` | Persists dated snapshots of profile + scorecard and renders a then-versus-now comparison on re-check. |

Behaviour contracts for each capability live in [`openspec/changes/init-blindspot-agent/specs/`](openspec/changes/init-blindspot-agent/specs/).

---

## ⚖️ Core Invariants

These architectural and regulatory invariants are strictly enforced across the codebase:

### 1. Education, Never Regulated Advice
Under EU regulations, personalized retail investment advice is a regulated activity. This system provides financial education and diagnostic awareness only.
- **Allowed:** *"Your emergency reserve covers ~2.7 months of reported expenditure. Here is why that benchmark matters."*
- **Strictly Prohibited:** *"You should buy this ETF."* / *"Move cash to bonds."* / *"Invest with provider X."*
- **Enforcement:** Enforced in code through a three-layer defense:
  1. **System Prompt Boundary**: Explicit role definition and mandatory opening disclosure to the user.
  2. **Outbound Guardrail Classifier**: An independent fast model (`Nemotron-3_5-Lightning`) checks every outbound message and blocks any recommendation-shaped text before delivery.
  3. **Deterministic Scoring**: The model never decides scorecard colors or calculates metrics.

### 2. Strict Separation of Facts and Explanation
- **Plain Code Calculation Engine**: Mathematical indicators (Emergency Runway, Debt Exposure, Retirement Visibility, Asset Concentration, Cross-Border Complexity) and their Green / Amber / Red thresholds are computed purely in deterministic TypeScript functions.
- **Natural Language Role**: The LLM writes plain-language explanations around results it did not calculate and flags it did not decide.

### 3. Data Minimization & Privacy
- **Zero Credentials**: Never collects or stores bank credentials, account numbers, card details, tax IDs, or passport numbers.
- **Approximations Only**: All evaluations operate on ranges, rounded numbers, and self-reported estimates.
- **Sensitive Input Handling**: If a user volunteers an identification number or credential, the tokens are stripped and the user is reminded that only ranges and estimates are needed.

---

## 💬 Telegram Commands

| Command | Behaviour |
| --- | --- |
| `/start` | Opens the assessment with the mandatory education-only disclosure, then asks the first question. |
| `/revisit` | Runs the simulated six-month re-check and reports indicator deltas against the stored baseline. |

---

## 📐 Specification-Driven Development (OpenSpec)

This project follows [OpenSpec](https://github.com/openspec/openspec) to maintain auditable specifications and verifiable tasks:
- **`openspec/specs/`**: Core system capabilities and behavior contracts (populated when a change is archived).
- **`openspec/changes/init-blindspot-agent/`**: Active development proposal, specs delta, architecture design, and implementation checklist.
  - [`proposal.md`](openspec/changes/init-blindspot-agent/proposal.md) — why the project exists and what it adds.
  - [`design.md`](openspec/changes/init-blindspot-agent/design.md) — goals/non-goals, technical decisions, risks.
  - [`specs/`](openspec/changes/init-blindspot-agent/specs/) — requirements and scenarios per capability.
  - [`tasks.md`](openspec/changes/init-blindspot-agent/tasks.md) — the phased implementation checklist.

Out of scope for the MVP: custom web/mobile UI, banking API or credential integrations, distributed database infrastructure, and a production scheduler for the six-month revisit.

---

## 🛠️ Stack & Technology

- **Agent & Channels**: [Mastra](https://mastra.ai) (orchestration, memory, Telegram channel adapter)
- **Model Inference**: [Nebius Token Factory](https://tokenfactory.nebius.com) (`DeepSeek-V4.1-Flash` for interview extraction, `Nemotron-3_5-Lightning` for outbound guardrail)
- **Evaluation & Adversarial Testing**: [Galtea](https://galtea.ai) (automated adversarial compliance and drift testing)
- **Language & Runtime**: TypeScript / Node.js
- **Storage**: Local SQLite / in-memory store for session state and baseline snapshots
- **Testing**: Vitest (pure mathematical calculation & rule boundary unit tests)

---

## 🗺️ Implementation Roadmap

Tracked in [`tasks.md`](openspec/changes/init-blindspot-agent/tasks.md); no phase is implemented yet.

1. Project initialization & skeleton (TypeScript project, Nebius client, Mastra + Telegram adapter).
2. Conversational interview machine & Zod-validated profile extraction.
3. Pure mathematical calculation engine with unit tests.
4. Threshold rules engine & outbound advice guardrail.
5. Baseline snapshot & longitudinal comparison.
6. Galtea adversarial evaluation (find, fix, prove).
7. Documentation & end-to-end rehearsal.

---

## 🚀 Getting Started

*Environment configuration and setup instructions will be finalized in Phase 1 of the implementation plan.*

Expected prerequisites: Node.js with TypeScript, a Telegram bot token, a Nebius Token Factory API key (base URL `https://api.tokenfactory.nebius.com/v1/`), and a Galtea API key for adversarial evaluation runs.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
