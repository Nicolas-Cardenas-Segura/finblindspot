# Spec Delta

## Purpose

Enables baseline financial snapshot persistence and simulated longitudinal comparison to illustrate financial progress over time.

## ADDED Requirements

### Requirement: Baseline Snapshot Persistence
The system SHALL persist completed financial assessment profiles and resulting indicator scorecards keyed by the Telegram user identifier, with a timestamp and a label (`baseline` or `revisit`), in the local store.

#### Scenario: Assessment completion
- **WHEN** user completes the diagnostic interview and scorecard generation
- **THEN** the system saves the profile and indicator results as a dated `baseline` snapshot, replacing any earlier baseline for that user.

### Requirement: Longitudinal Progress Comparison
The system SHALL support re-assessing the mutable numeric parameters and rendering a "then versus now" comparative report against the saved baseline.

#### Scenario: User requests progress re-check
- **WHEN** user triggers a simulated follow-up review with `/revisit`
- **THEN** the system re-asks only liquid cash, monthly expenditure, monthly debt service, net income, largest asset share, and number of pensions with unknown values; carries every other baseline answer forward; recomputes the scorecard; stores it as a `revisit` snapshot; and presents each indicator's baseline state, current state, and numeric delta, labelled as a simulated six-month follow-up.

#### Scenario: Re-check without a baseline
- **WHEN** user sends `/revisit` and no `baseline` snapshot exists for their identifier
- **THEN** the system explains that no baseline is stored and offers to start the full assessment.

#### Scenario: Unchanged answer during re-check
- **WHEN** user replies that a re-asked value is unchanged
- **THEN** the system carries the baseline value forward without asking for a number.

### Requirement: User-Initiated Erasure
The system SHALL delete all stored data for a user on request.

#### Scenario: User requests deletion
- **WHEN** user sends `/forget`
- **THEN** the system deletes every snapshot, session state, and compliance trigger row associated with that Telegram user identifier and confirms the deletion in the chat.
