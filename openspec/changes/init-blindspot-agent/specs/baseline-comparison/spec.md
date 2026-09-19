# Spec Delta

## Purpose

Stores every assessment immutably and supports the six-month re-assessment loop from `finance-blind-spot-v1-spec.html` §4 and §9: prefilled re-run, recompute under one set of assumptions, and a progress view.

## ADDED Requirements

### Requirement: Immutable Assessment Records
The system SHALL persist each assessment as a record `{ id, user_id, created_at, status, base_currency, answers, assumptions, derived, results, blind_spots[] }` keyed by the Telegram user identifier, with `answers`, `assumptions` and `results` stored as separate columns/documents.

#### Scenario: Assessment completion
- **WHEN** the interview reaches `status = complete` and the engines have run
- **THEN** the record is written once with `derived`, `results` (including `missing_fields[]` and `is_minimum_estimate`) and `blind_spots[] = [{ rule_id, severity, fired_at }]`, and is never updated afterwards.

#### Scenario: Re-assessment
- **WHEN** a user completes a second assessment
- **THEN** a new record with a new `id` is created; the earlier record is retained unchanged.

#### Scenario: Null answers are stored as null
- **WHEN** an answer was "I don't know"
- **THEN** the stored `answers` value for that field ID is `null`, so a later run can detect that it has since been resolved.

### Requirement: Prefilled Re-Assessment
The system SHALL support `/revisit`, which re-runs the questionnaire prefilled from the user's most recent complete assessment, one section per screen, asking "still right?" per field, and surfacing previously-`null` fields first.

#### Scenario: User re-assesses
- **WHEN** user sends `/revisit` and a complete assessment exists
- **THEN** the bot first lists the fields that were `null` last time and asks for each; then walks sections A–H showing the previous value and accepting "yes"/"same" to copy it forward or a new value to replace it; on completion a new immutable record is created.

#### Scenario: Re-check without a prior assessment
- **WHEN** user sends `/revisit` and no complete assessment exists for their identifier
- **THEN** the bot explains that there is nothing to compare against yet and offers `/start`.

#### Scenario: Simulated nudge
- **WHEN** the user has a complete assessment
- **THEN** the bot offers a `/revisit` reminder framed as "six or twelve months later" (chosen at the end of the first assessment); actual scheduled push delivery is out of scope for v1 and the reminder text is sent on the next interaction instead.

### Requirement: Comparison Under One Set of Assumptions
The system SHALL compute the progress view as `compare(previous.answers, current.answers, assumptions = current.assumptions)`, recomputing the previous assessment's `derived`, `results` and fired rules under the current assumptions before diffing.

#### Scenario: Progress view
- **WHEN** a re-assessment completes
- **THEN** the bot renders "Then / Now / Change" rows for retirement position (`position_today`), saved each month (`saving_monthly_other + sum(pension_contribution_monthly)`), emergency fund in months (`cash_total / monthly_spending`), net worth, and count of open blind spots, followed by `blind_spots_closed[]`, `blind_spots_new[]`, `blind_spots_still_open[]` and `unknowns_resolved[]`.

#### Scenario: Assumption changed between runs
- **WHEN** `current.assumptions` differs from the stored `previous.assumptions`
- **THEN** the view includes the single line "this comparison uses your current assumptions for both dates."

#### Scenario: Blind spot closed by resolving an unknown
- **WHEN** a rule fired previously only because a field was `null` and that field now has a real value that does not trigger the rule
- **THEN** the rule appears in `blind_spots_closed[]` and the field ID appears in `unknowns_resolved[]`, which gets its own line in the progress view.

### Requirement: User-Initiated Erasure
The system SHALL delete all stored data for a user on request.

#### Scenario: User requests deletion
- **WHEN** user sends `/forget`
- **THEN** the system deletes every assessment record (draft and complete), interview state, and compliance trigger row associated with that Telegram user identifier and confirms the deletion in the chat.
