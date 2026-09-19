# Spec Delta

## Purpose

Enables structured, conversational assessment interviews over Telegram to collect cross-border financial data and extract validated financial profiles.

## ADDED Requirements

### Requirement: Telegram Conversational Assessment
The system SHALL conduct an interactive, single-question-at-a-time interview via Telegram to elicit relevant financial details for internationally mobile individuals.

#### Scenario: User initiates assessment
- **WHEN** user sends `/start` or an opening greeting to the Telegram bot
- **THEN** the bot responds with a welcoming message explicitly stating its educational purpose, a clear disclaimer that it does not provide regulated financial advice, and the first question.

#### Scenario: Base currency declared before amounts
- **WHEN** the assessment begins
- **THEN** the bot asks the user to confirm a base currency (defaulting to the currency of their country of residence) before asking for any monetary amount, and stores it on the profile.

#### Scenario: User provides incomplete or ambiguous answer
- **WHEN** user responds with a vague estimation or missing vital context (e.g. "I have some savings in the UK")
- **THEN** the system asks an empathetic follow-up question to clarify the range or currency before advancing to the next domain.

### Requirement: Structured Profile Extraction
The system SHALL parse natural language user responses into a strongly-typed financial profile representation containing demographic, income, expenditure, debt, asset, and multi-country pension data.

#### Scenario: Valid financial response received
- **WHEN** user specifies their monthly expenditure and currency
- **THEN** the system updates the session financial profile with normalized numerical values and designated currency code.

#### Scenario: Amount given in a non-base currency
- **WHEN** user states an amount with a currency different from the declared base currency
- **THEN** the system stores the original amount and currency code on the profile and marks it for base-currency conversion by the calculation engine.

### Requirement: Deterministic Sensitive Input Filter
The system SHALL screen every inbound user message with a deterministic (non-LLM) filter for identification numbers and credentials before the message is sent to any model provider.

#### Scenario: Unsupported or sensitive data entered
- **WHEN** user enters text matching IBAN, payment card (Luhn-valid), passport, tax identifier, or long digit-run patterns
- **THEN** the system replaces the matched tokens with `[redacted]` before any model call, does not persist the original text, and instructs the user that only ranges and estimates are required.

#### Scenario: Ordinary numeric answer
- **WHEN** user enters an amount, percentage, or age such as "about 12k" or "35%"
- **THEN** the filter leaves the message unchanged and the interview proceeds.
