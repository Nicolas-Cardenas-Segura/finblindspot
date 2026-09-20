# MyFinGap

**Most finance apps show what you have. MyFinGap helps you understand what you may be missing.**

A small, runnable Finance Blind Spot scaffold: a structured assessment over Telegram,
fixed calculations, and dated baselines. An unknown pension value is a finding, never a zero.

## Try it

Use Node **24** (`.nvmrc` pins 24.19.0) and npm **11.6+**.
No API keys are needed for the demo or terminal.

```sh
nvm install
nvm use
npm install --global npm@11.6.0
npm ci
npm run demo       # fictional assessment + follow-up; in-memory, no network
npm run dev        # interactive terminal; send /start
npm run check      # lint, typecheck, tests, build
npm start          # compiled terminal entry after building
```

The interview asks for a reporting currency and 18 answers. Enter estimates as `2500`,
`2,500.50`, or `2500 EUR`; answer yes/no for checks; use two-letter country codes.
`unknown`, `not sure`, and `I don't know` preserve uncertainty explicitly.
Unanswered questions remain unanswered. The terminal uses one local user;
Telegram isolates each sender's data.

## Included

- One question at a time, validation, clarification, persistent drafts, and confirmation
  of AI interpretations before recording them.
- Cash, income, spending, debt, investments, property, pensions, countries, fees,
  a local will, beneficiaries, and a retirement lifestyle goal.
- Pure TypeScript math, configurable red/amber/green rules, and the top three actual
  flags with educational explanations and document-checking next steps.
- Immutable SQLite assessments. `/revisit` reviews every answer, with `same` to keep
  a previous answer explicitly. Comparisons use the original baseline.
- Optional Mastra/Nebius extraction and independent outbound classification.
  The model cannot set indicators, compute money, or write the scorecard.
- Telegram long polling via grammY; no public server or webhook required.

## Telegram

1. Create a bot with [BotFather](https://t.me/BotFather).
2. Copy `.env.example` to `.env` and set `TELEGRAM_BOT_TOKEN`.
3. Run `npm run telegram` (or `npm run build && npm run start:telegram`).
4. Open your bot in a **private** chat and send `/start`.

| Command | Behavior |
| --- | --- |
| `/start` | Start a new draft; keep completed assessments |
| `/resume` | Show the current question or pending confirmation |
| `/revisit` | Review every answer; `same` retains the last value |
| `/report` | Latest scorecard and original-baseline comparison |
| `/history` | List completed assessment dates |
| `/cancel` | Discard only the draft |
| `/delete` | Ask for `/confirm_delete` before deleting local records |
| `/help` | Show commands |

Groups and bot senders are ignored. Replies are split below Telegram's size limit.
Run one bot process per token/database. Polling is sequential; multi-process coordination
and exactly-once delivery are outside this scaffold.

## Optional AI conversation

Set all of `NEBIUS_API_KEY`, `NEBIUS_INTERVIEW_MODEL`, and `NEBIUS_GUARDRAIL_MODEL`.
Choose available model IDs from your account; interview IDs use `provider/model` format.
The original hackathon proposal's model IDs are not assumed to be available.
See [Nebius API docs](https://docs.tokenfactory.nebius.com/api-reference/introduction).

Without these variables the interview uses a strict local parser and fixed educational
text. With AI enabled, Mastra extracts an answer when the parser cannot. Schema validation
and user confirmation still apply. Extracted numbers must match one literal number in
the user's message. The app never estimates ranges or infers exchange rates.

A separate Nebius call classifies each outbound reply and accepts only exact `ALLOW`.
Rejection, malformed verdicts and service errors prevent delivery. `/resume` or `/report`
recovers a turn whose state was saved but whose reply could not be delivered.
There is no generated explanatory prose. AI mode sends the current question/answer and
outgoing messages to Nebius, not raw conversation history. A classifier is a scaffolded
control, not a compliance certification; real-provider evaluation remains necessary.

## Fixed math and assumptions

All amounts use one reporting currency: EUR, GBP, USD, CHF, CAD or AUD.
No exchange rate is fetched or guessed.

| Indicator | Calculation / default rule |
| --- | --- |
| Emergency buffer | Cash / monthly spending; red <3 months, amber <6, otherwise green |
| Debt commitments | Monthly repayments / take-home income; green <20%, red >40%, otherwise amber |
| Pension visibility | Unknown count or multiple missing pension/age/tax inputs: red; one uncertainty, one untracked pot or unchecked tax rules: amber |
| Asset concentration | Largest cash/investment/pension/property-equity category / total; green <50%, red >80%, otherwise amber |
| Cross-border complexity | Countries including residence: one green, two amber, three or more red |
| Fees, local will, beneficiaries | Reported checked: green; not checked: red; unknown: amber |
| Retirement lifestyle | Projected capital minus target capital: negative red, nonnegative green, unavailable amber |

Unavailable ratios return `null`, including zero income/spending denominators.
A green flag reflects this limited framework and self-reported data, not verified
overall financial health. Severity ties use indicator order, not an AI ranking.

Retirement is an **illustrative scenario in today's money**:

```text
monthlyRate = (1 + annualRealReturn)^(1/12) - 1
months = (retirementAge - age) * 12
projectedPot = (pensions + investments) * (1 + monthlyRate)^months
             + monthlyContribution * ((1 + monthlyRate)^months - 1) / monthlyRate
targetPot = desiredMonthlyRetirementSpending * 12 / withdrawalRate
gap = projectedPot - targetPot
```

At zero return, use `pot + contributions * months`. Defaults are **3% annual real
return after fees** and **4% annual withdrawal**, neither a forecast nor a guarantee.
Contributions remain constant in today's money and arrive at month-end. Property,
emergency cash, state pensions, taxes, inheritance and currency movements are excluded.
Unknown/untracked pensions prevent projection; they are never silently zero-valued.
Defined-benefit pensions need a separate future model: do not invent a capital value.
Configure thresholds and assumptions through `assess(profile, settings)`.

Each snapshot records assumptions and a framework version. Currency, version or
assumption changes disable numerical comparison. Reviews show resolved, persistent
and new flags, and answers that became known or unknown. Six–twelve months is a suggested
return window; there is no scheduler or simulated date rewriting.

## Architecture

```text
src/profile.ts       Known/unknown schemas and questions
src/engine.ts        Pure calculations, thresholds and prioritization
src/interview.ts     Shared interview, validation and confirmation
src/store.ts         SQLite drafts, atomic snapshots and deletion
src/report.ts        Fixed explanations and baseline comparisons
src/ai.ts            Optional Mastra extraction and Nebius classifier
src/telegram-bot.ts  Private-chat adapter
src/cli.ts           Terminal adapter
src/demo.ts          Offline fictional walkthrough
```

The default database is `data/myfingap.db` (override `MYFINGAP_DB`), with POSIX file
permissions restricted to its owner. It is **not encrypted**. Only structured answers
are saved, not raw prompts/responses. The input filter rejects common credential/identifier
patterns before storage or inference but is not a complete PII detector.
`/delete` removes app records, not Telegram history, provider records or backups.
Use fictional data for this scaffold.

## Scope and verification

The existing [OpenSpec change](openspec/changes/init-blindspot-agent/) describes a larger
hackathon integration; unfinished tasks remain unchecked. Pensions are aggregate estimates
with an untracked-pot count, not a per-country ledger. Country codes are shape-validated,
not a legal-jurisdiction database. There is no bank integration, product recommendation,
web UI, deployment, reminder scheduler, Galtea evaluation, or production identity,
encryption and retention layer.

Tests cover math boundaries, unknowns, projection formulas, persistence across restart,
user isolation, confirmation/deletion, comparison, simulated Telegram updates and stubbed
AI calls. `npm run demo` exercises two full assessments. Live Telegram delivery, model
connectivity and classifier performance remain unverified without configured credentials.
There is no claimed live bot handle.

[MIT License](LICENSE). Educational information only; not financial, legal or tax advice.
