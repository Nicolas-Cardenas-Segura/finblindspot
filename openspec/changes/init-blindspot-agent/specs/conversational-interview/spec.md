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
- **THEN** the system retains validated country/currency or simple monetary fragments separately from scored profile data and asks for the missing detail before advancing, rather than discarding the fragments and repeating the entire question.

#### Scenario: Multiple currencies mentioned
- **WHEN** a user reports Spain and holdings in dollars and euros without selecting a reporting currency
- **THEN** the bot retains Spain, asks only for the preferred reporting currency, and explains that this preference does not convert the original amounts.

#### Scenario: Currency-only follow-up
- **WHEN** a user supplies a currency after an incomplete country or amount answer
- **THEN** the currency is combined with the validated draft; previously supplied fields are not requested again, and a bare amount cannot inherit the reporting currency without currency evidence or a same-field validated currency.

#### Scenario: Context before path selection
- **WHEN** an opening financial concern explicitly states the user's current country before a quick/full choice
- **THEN** that validated country is retained while the bot acknowledges the concern and still lets the user choose the assessment path.

### Requirement: Structured Profile Extraction
The system SHALL parse natural language user responses into a strongly-typed financial profile representation containing demographic, income, expenditure, debt, asset, and multi-country pension data.

#### Scenario: Valid financial response received
- **WHEN** user specifies their monthly expenditure and currency
- **THEN** the system updates the session financial profile with normalized numerical values and designated currency code.

#### Scenario: Unsupported or sensitive data entered
- **WHEN** user enters sensitive identification numbers or bank credentials
- **THEN** the system rejects the input before model calls, persistent history or raw telemetry and supplies a classified explanation requesting ranges and estimates only.

### Requirement: Quick and Full Resumable Paths
The system SHALL offer a short partial assessment and a full interview covering the fifteen brief domains, preserving validated progress and allowing unknown values, skipping and corrections.

#### Scenario: Short assessment selected
- **WHEN** the user selects the quick path
- **THEN** the bot collects country/base currency, take-home income, essential expenditure, accessible cash and debt payments one question at a time, with clarification when needed.

#### Scenario: Correction or invalid extraction
- **WHEN** an answer changes a previously supplied value or cannot be validated
- **THEN** the system requests clarification/confirmation instead of silently overwriting known values or advancing past invalid data.

#### Scenario: Process restarts
- **WHEN** a user returns after the application restarts
- **THEN** the next question is derived from their persisted validated progress.

### Requirement: Respectful Conversational Delivery
The system SHALL identify itself as an AI assistant and use concise, non-judgmental wording, factual acknowledgements and gentle question transitions without altering calculations or bypassing classification.

#### Scenario: Natural-language path choice
- **WHEN** a user choosing a path says a common phrase such as "a quick check, please" or "a more detailed look"
- **THEN** the corresponding interview begins without requiring a slash command, while ambiguous phrases do not silently select a path.

#### Scenario: Approximate or unknown answer
- **WHEN** a user supplies an estimate, says they do not know, or skips a question
- **THEN** the bot acknowledges the answer without praising or judging their finances and asks only the next question rather than duplicating a model-generated question.

#### Scenario: Natural reset request
- **WHEN** a user says "start fresh"
- **THEN** the bot requests confirmation without deleting records, and a casual "yes" is not treated as the explicit deletion confirmation.

### Requirement: Private Assessments
The system SHALL restrict personal assessment and report delivery to private conversations and derive ownership from verified transport identity rather than model output.

#### Scenario: Another user's identifier supplied
- **WHEN** a message or extracted patch contains another user's session identifier
- **THEN** that identifier cannot grant access or change another assessment.
