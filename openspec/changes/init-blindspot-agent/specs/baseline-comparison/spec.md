# Spec Delta

## Purpose

Enables baseline financial snapshot persistence and simulated longitudinal comparison to illustrate financial progress over time.

## ADDED Requirements

### Requirement: Baseline Snapshot Persistence
The system SHALL persist completed financial assessment profiles and resulting indicator scorecards associated with a user or session identifier and timestamp.

#### Scenario: Assessment completion
- **WHEN** user completes the diagnostic interview and scorecard generation
- **THEN** the system saves the profile and indicator results as a dated baseline snapshot.

### Requirement: Longitudinal Progress Comparison
The system SHALL support re-assessing key parameters and rendering a "then versus now" comparative report against the saved baseline.

#### Scenario: User requests progress re-check
- **WHEN** user triggers a simulated follow-up review (e.g. `/revisit`)
- **THEN** the system compares the updated metrics against the baseline snapshot and presents the delta improvement in green/amber/red indicators.
