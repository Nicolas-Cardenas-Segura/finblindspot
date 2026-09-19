# Spec Delta

## Purpose

Walks a Telegram user through the v1 questionnaire (`finance-blind-spot-v1-spec.html` §2–§3, sections A–H) one question at a time, storing every answer under its field ID so the engine never reads free text.

## ADDED Requirements

### Requirement: Consent Before Questions
The system SHALL show the educational-purpose disclaimer and the "do not enter bank logins, account numbers, card numbers, passport details or tax numbers" notice, and SHALL record `consent = yes` before asking any question.

#### Scenario: User initiates assessment
- **WHEN** user sends `/start`
- **THEN** the bot sends the "Understand where you stand" text from v1 §2 and asks the user to confirm; no section A question is asked until the confirmation arrives.

#### Scenario: Consent declined or absent
- **WHEN** the user replies with anything other than an affirmative
- **THEN** the bot repeats that consent is required to continue and does not create an assessment.

### Requirement: Field-ID Questionnaire
The system SHALL ask the v1 fields in section order A→H using the on-screen wording from the spec, one field per message, and SHALL store each answer under its field ID with the declared type (money, integer, %, year, country, enum, country list, multi-select).

#### Scenario: Base currency asked first in section B
- **WHEN** section B starts
- **THEN** the bot asks "Which currency shall we use?" with the choices `EUR`, `GBP`, `USD`, stores `base_currency`, and every later money question shows that currency; no other currency is accepted for a money field in v1.

#### Scenario: Conditional fields
- **WHEN** `dependants = 0`, or `has_partner = just_me`
- **THEN** `education_funded`, and `decision_maker` / `partner_knows` respectively, are skipped and stored as not-applicable rather than `null`.

#### Scenario: Repeated pension rows
- **WHEN** section D starts
- **THEN** the bot collects `pensions[]` one row at a time (country, type, value, fixed income, start age, contribution, contributions continue), asks "Another pension?" after each row, and finally asks `beneficiaries_named` once.

#### Scenario: Required helper copy
- **WHEN** the bot asks `home_value`, `retire_income_monthly` or the section G assumptions
- **THEN** it includes, respectively, "The home you live in is not counted towards retirement, because you will still need somewhere to live.", "Think about the lifestyle you want at today's prices. We adjust for inflation for you.", and the default/range for each assumption labelled as a planning assumption.

### Requirement: "I Don't Know" Is Always Offered
The system SHALL offer an explicit "I don't know" option on every money and yes/no field, store it as `null`, and never default a field to `0`.

#### Scenario: Unknown answer
- **WHEN** the user picks "I don't know" or writes an equivalent ("not sure", "no idea")
- **THEN** the field is stored as `null`, the bot acknowledges that not knowing is itself a finding, and moves on.

#### Scenario: Blank or off-topic reply to a required field
- **WHEN** the reply cannot be parsed to the field's type
- **THEN** the bot re-asks once with the accepted formats and the "I don't know" option; the field is not stored until a valid answer or explicit unknown arrives.

#### Scenario: Explicit zero
- **WHEN** the user answers "none" or `0` on a field marked "0 valid"
- **THEN** the value `0` is stored, distinct from `null`.

### Requirement: LLM-Assisted Answer Extraction
The system SHALL use the interview model only to map a free-text reply onto the current field's typed value (or `null`), validated by the field's schema; the model SHALL not choose the next question, alter stored answers, or compute anything.

#### Scenario: Natural-language amount
- **WHEN** the current field is `income_monthly` and the user writes "about 4.2k after tax"
- **THEN** the extractor returns `4200`, the schema accepts it, and the state machine advances.

#### Scenario: Extraction rejected by schema
- **WHEN** the extractor returns a value outside the field's range (e.g. `age = 12`)
- **THEN** the value is discarded and the bot re-asks with the valid range.

### Requirement: Deterministic Sensitive Input Filter
The system SHALL screen every inbound message with a deterministic (non-LLM) filter before the message is sent to any model provider.

#### Scenario: Sensitive data entered
- **WHEN** user text matches IBAN, payment card (Luhn-valid), passport, tax identifier, or long digit-run patterns
- **THEN** the matched tokens are replaced with `[redacted]` before any model call, the original is not persisted, and the bot reminds the user that only approximate figures are needed.

#### Scenario: Ordinary numeric answer
- **WHEN** user enters an amount, percentage, or age such as "about 12k" or "35%"
- **THEN** the filter leaves the message unchanged and the interview proceeds.

### Requirement: Draft Assessment Lifecycle
The system SHALL create an assessment record with `status = draft` at consent and set `status = complete` when the last field of section H is answered; the calculation and blind-spot engines run only on complete assessments.

#### Scenario: Interrupted interview
- **WHEN** a user with a `draft` assessment sends `/start` again
- **THEN** the bot offers to resume from the next unanswered field or to discard the draft and start over.
