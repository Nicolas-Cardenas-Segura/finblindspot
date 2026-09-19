# Financial Blindspot Detector

> **Status: Work in Progress (WIP)**  
> This project is currently in active development for HackBarna / AI Summit Barcelona 2026. Specifications, architecture decisions, and implementation tasks are tracked in [`openspec/changes/init-blindspot-agent/`](openspec/changes/init-blindspot-agent/).

---

## 🎯 Overview

Most financial apps show you what you have. **Financial Blindspot** shows you what you are missing before it becomes expensive.

Designed specifically for internationally mobile professionals and expats—who face split pensions, multi-currency assets, and cross-border tax complexity—the system conducts a 10-minute conversational checkup via Telegram, deterministically evaluates key financial health indicators, and produces an objective scorecard detailing their top blind spots.

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

---

## 📐 Specification-Driven Development (OpenSpec)

This project follows [OpenSpec](https://github.com/openspec/openspec) to maintain auditable specifications and verifiable tasks:
- **`openspec/specs/`**: Core system capabilities and behavior contracts.
- **`openspec/changes/init-blindspot-agent/`**: Active development proposal, specs delta, architecture design, and implementation checklist.

---

## 🛠️ Stack & Technology

- **Agent & Channels**: [Mastra](https://mastra.ai) (orchestration, memory, Telegram channel adapter)
- **Model Inference**: [Nebius Token Factory](https://tokenfactory.nebius.com) (`DeepSeek-V4.1-Flash` for interview extraction, `Nemotron-3_5-Lightning` for outbound guardrail)
- **Evaluation & Adversarial Testing**: [Galtea](https://galtea.ai) (automated adversarial compliance and drift testing)
- **Language & Runtime**: TypeScript / Node.js
- **Testing**: Vitest (pure mathematical calculation & rule boundary unit tests)

---

## 🚀 Getting Started

*Environment configuration and setup instructions will be finalized in Phase 1 of the implementation plan.*

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
