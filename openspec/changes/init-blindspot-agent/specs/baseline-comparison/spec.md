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

### Requirement: Scheduled Re-Assessment Nudge
The system SHALL ask the user, after the results message, whether to be reminded in six or twelve months, SHALL persist a nudge `{ user_id, assessment_id, due_at, sent_at }`, and SHALL send the reminder as a Telegram message when it falls due.

#### Scenario: Nudge chosen
- **WHEN** the user answers `6` or `12` (months) to the reminder question
- **THEN** a nudge row is stored with `due_at = created_at + N months` and the bot confirms the date.

#### Scenario: Nudge declined
- **WHEN** the user answers "no" or does not answer within the interview session
- **THEN** no nudge row is stored and the bot mentions `/revisit` is available at any time.

#### Scenario: Nudge falls due
- **WHEN** the scheduler tick finds a nudge with `due_at <= now` and `sent_at` null
- **THEN** the bot sends "It has been N months since your last check. Reply /revisit to update it in five minutes and see what moved.", sets `sent_at`, and never sends the same nudge twice.

#### Scenario: Superseded by an earlier re-assessment
- **WHEN** the user completes a new assessment before a pending nudge is due
- **THEN** the pending nudge is cancelled (`sent_at` set to the cancellation time with `cancelled = 1`) and the new assessment asks the reminder question again.

#### Scenario: Demo fast-forward
- **WHEN** an operator sets `NUDGE_TICK_SECONDS` and `NUDGE_DEMO_MINUTES` in the environment
- **THEN** `N months` is replaced by `N * NUDGE_DEMO_MINUTES` minutes so the loop can be shown live; production leaves both unset.

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
- **THEN** the system deletes every assessment record (draft and complete), interview state, pending nudge, and compliance trigger row associated with that Telegram user identifier and confirms the deletion in the chat.
