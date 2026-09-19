# Spec Delta

## Purpose

Enables structured, conversational assessment interviews over Telegram to collect cross-border financial data and extract validated financial profiles.

## ADDED Requirements

### Requirement: Telegram Conversational Assessment
The system SHALL conduct an interactive, single-question-at-a-time interview via Telegram to elicit relevant financial details for internationally mobile individuals.

#### Scenario: User initiates assessment
- **WHEN** user sends `/start` or an opening greeting to the Telegram bot
- **THEN** the bot responds with a welcoming message explicitly stating its educational purpose, a clear disclaimer that it does not provide regulated financial advice, and the first question.

#### Scenario: User provides incomplete or ambiguous answer
- **WHEN** user responds with a vague estimation or missing vital context (e.g. "I have some savings in the UK")
- **THEN** the system asks an empathetic follow-up question to clarify the range or currency before advancing to the next domain.

### Requirement: Structured Profile Extraction
The system SHALL parse natural language user responses into a strongly-typed financial profile representation containing demographic, income, expenditure, debt, asset, and multi-country pension data.

#### Scenario: Valid financial response received
- **WHEN** user specifies their monthly expenditure and currency
- **THEN** the system updates the session financial profile with normalized numerical values and designated currency code.

#### Scenario: Unsupported or sensitive data entered
- **WHEN** user enters sensitive identification numbers or bank credentials
- **THEN** the system rejects and strips the sensitive tokens and instructs the user that only ranges and estimates are required.
